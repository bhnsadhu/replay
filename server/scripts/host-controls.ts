// Checks for the host's in-game controls (PLAN.md §5): PAUSE, SKIP SONG, END, plus the TV-drop pause
// interplay and changing initials in the public room.
//   npx tsx scripts/host-controls.ts [ws://localhost:8787/ws] [origin]
import WebSocket from 'ws';
import type { ClientMessage, ServerMessage } from '@replay/shared';

const url = process.argv[2] ?? 'ws://localhost:8787/ws';
const origin = process.argv[3];
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
const check = (ok: unknown, what: string) => {
  console.log(`${ok ? '✓' : '✗'} ${what}`);
  if (!ok) process.exit(1);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Msg<T extends ServerMessage['t']> = Extract<ServerMessage, { t: T }>;

function client(name: string) {
  const ws = new WebSocket(url, origin ? { origin } : undefined);
  const inbox: ServerMessage[] = [];
  ws.on('message', (d) => inbox.push(JSON.parse(d.toString()) as ServerMessage));
  const send = (m: ClientMessage) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(m));
  const ping = setInterval(() => send({ t: 'ping', at: Date.now() }), 3000);
  ws.on('close', () => clearInterval(ping));
  const until = async <T extends ServerMessage['t']>(t: T, where: (m: Msg<T>) => boolean = () => true, ms = 30_000, from = 0) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const hit = inbox.slice(from).find((m) => m.t === t && where(m as Msg<T>));
      if (hit) return hit as Msg<T>;
      await sleep(40);
    }
    throw new Error(`${name}: timed out waiting for ${t}`);
  };
  const mark = () => inbox.length;
  return { name, ws, inbox, send, until, mark, ready: new Promise<void>((r) => ws.once('open', () => r())) };
}

const waitForStart = async (m: Msg<'roundStart'>) => sleep(Math.max(0, m.startAt - Date.now()) + 300);

// ---------- Phone-hosted room: pause, skip, end ----------
const host = client('HOST');
await host.ready;
host.send({ t: 'room:create', role: 'player', initials: 'HST' });
const created = await host.until('room:state');
const code = created.room.code;
log('room', code);
const guest = client('GUEST');
await guest.ready;
guest.send({ t: 'room:join', code, initials: 'GST' });
await guest.until('room:state', (m) => m.you !== null);

host.send({ t: 'room:rules', rules: { rounds: 5, clipSeconds: 10, mix: 'today', sound: 'all' } });
await host.until('room:state', (m) => m.room.rules.rounds === 5);
host.send({ t: 'room:start' });
const r1 = await host.until('roundStart', (m) => m.index === 1, 60_000);
await waitForStart(r1);

// Only the host can pause.
let mark = guest.mark();
guest.send({ t: 'room:pause', paused: true });
const notHost = await guest.until('error', () => true, 3000, mark);
check(notHost.code === 'not_host', 'a guest cannot pause');

mark = guest.mark();
host.send({ t: 'room:pause', paused: true });
const paused = await guest.until('room:state', (m) => m.room.paused === 'host', 3000, mark);
check(paused.room.paused === 'host', 'host PAUSE: everyone sees the game paused by the host');
guest.send({ t: 'guess', roundId: r1.roundId, choice: 'A', elapsedMs: 500 });
await sleep(800);
check(!guest.inbox.slice(mark).some((m) => m.t === 'guessAck'), 'answers are ignored while paused');
await sleep(12_000); // Longer than the clip: the round must not time out while paused.
check(!guest.inbox.slice(mark).some((m) => m.t === 'reveal'), 'the round does not run out while paused');

mark = guest.mark();
host.send({ t: 'room:pause', paused: false });
const replayed = await guest.until('roundStart', (m) => m.roundId === r1.roundId, 3000, mark);
const unpaused = await guest.until('room:state', (m) => m.room.paused === null, 3000, mark);
check(unpaused && replayed.startAt > r1.startAt, 'host RESUME: the round replays from the top');

// SKIP during a reveal moves on right away.
await waitForStart(replayed);
host.send({ t: 'guess', roundId: r1.roundId, choice: 'A', elapsedMs: 900 });
guest.send({ t: 'guess', roundId: r1.roundId, choice: 'B', elapsedMs: 900 });
await guest.until('reveal', (m) => m.roundId === r1.roundId);
mark = guest.mark();
const skippedRevealAt = Date.now();
host.send({ t: 'room:skip' });
const r2 = await guest.until('roundStart', (m) => m.index === 2, 10_000, mark);
check(Date.now() - skippedRevealAt < 3000, `SKIP during the reveal starts round 2 right away (${Date.now() - skippedRevealAt} ms)`);

// SKIP during a round: nobody scores, a different song takes its place with the same number.
await waitForStart(r2);
guest.send({ t: 'guess', roundId: r2.roundId, choice: 'A', elapsedMs: 700 });
await guest.until('guessAck', (m) => m.roundId === r2.roundId, 3000);
mark = guest.mark();
host.send({ t: 'room:skip' });
await guest.until('roundSkipped', (m) => m.roundId === r2.roundId, 3000, mark);
const r2b = await guest.until('roundStart', (m) => m.roundId !== r2.roundId, 15_000, mark);
check(r2b.index === 2 && r2b.total === 5, 'SKIP mid-round: a different song plays as round 2');
check(!guest.inbox.slice(mark).some((m) => m.t === 'reveal' && m.roundId === r2.roundId), 'the skipped round is never revealed or scored');
const optionsChanged = r2b.options.map((o) => o.title).join() !== r2.options.map((o) => o.title).join();
check(optionsChanged, 'the replacement round has new options');

// A double skip doesn't start two rounds.
await waitForStart(r2b);
mark = guest.mark();
host.send({ t: 'room:skip' });
host.send({ t: 'room:skip' });
await guest.until('roundStart', (m) => m.roundId !== r2b.roundId, 15_000, mark);
await sleep(2500);
const starts = guest.inbox.slice(mark).filter((m) => m.t === 'roundStart');
check(starts.length === 1 && (starts[0] as Msg<'roundStart'>).index === 2, 'two quick skips start exactly one new round');

// END goes back to the lobby.
mark = guest.mark();
host.send({ t: 'room:end' });
const lobby = await guest.until('room:state', (m) => m.room.phase === 'lobby', 3000, mark);
check(lobby.room.phase === 'lobby' && lobby.room.paused === null, 'host END: back to the lobby');
host.send({ t: 'room:leave' });
guest.send({ t: 'room:leave' });

// ---------- TV room: a host pause survives the TV dropping and coming back ----------
const tv = client('TV');
await tv.ready;
tv.send({ t: 'room:create', role: 'tv' });
const tvCreated = await tv.until('room:state');
const tvCode = tvCreated.room.code;
const tvHost = client('TVHOST');
await tvHost.ready;
tvHost.send({ t: 'room:join', code: tvCode, initials: 'TVH' });
await tvHost.until('room:state', (m) => m.you !== null);
tv.send({ t: 'tv:soundOn' });
tvHost.send({ t: 'room:rules', rules: { rounds: 5, clipSeconds: 10, mix: 'today', sound: 'tv' } });
await tv.until('room:state', (m) => m.room.tvReady && m.room.rules.rounds === 5);
tvHost.send({ t: 'room:start' });
const t1 = await tvHost.until('roundStart', (m) => m.index === 1, 60_000);
await waitForStart(t1);
mark = tvHost.mark();
tvHost.send({ t: 'room:pause', paused: true });
await tvHost.until('room:state', (m) => m.room.paused === 'host', 3000, mark);
tv.send({ t: 'room:away' });
const tvGone = await tvHost.until('room:state', (m) => !m.room.tvConnected, 5000, mark);
check(tvGone.room.paused === 'tv', 'TV away during a host pause: shown as waiting for the TV');
const tv2 = client('TV2');
await tv2.ready;
mark = tvHost.mark();
tv2.send({ t: 'room:resume', code: tvCode, token: tvCreated.token });
const tvBack = await tvHost.until('room:state', (m) => m.room.tvConnected, 5000, mark);
await sleep(1500);
check(tvBack.room.paused === 'host' && !tvHost.inbox.slice(mark).some((m) => m.t === 'roundStart'), 'TV back: still paused by the host');
mark = tvHost.mark();
tvHost.send({ t: 'room:pause', paused: false });
const t1b = await tvHost.until('roundStart', (m) => m.roundId === t1.roundId, 3000, mark);
check(t1b.startAt > t1.startAt, 'host RESUME after the TV is back: the round replays');
tvHost.send({ t: 'room:leave' });
tv2.send({ t: 'room:leave' });

// ---------- Public: change initials mid-set ----------
const pub = client('PUB');
await pub.ready;
pub.send({ t: 'public:join', initials: 'AAA' });
const pubState = await pub.until('public:state');
pub.send({ t: 'public:initials', initials: 'ZZZ' });
const pr = await pub.until('roundStart', () => true, 60_000);
await waitForStart(pr);
pub.send({ t: 'guess', roundId: pr.roundId, choice: 'A', elapsedMs: 600 });
const pubReveal = await pub.until('reveal', (m) => m.roundId === pr.roundId, 30_000);
const myRow = pubReveal.board.find((b) => b.id === pubState.you);
check(myRow?.initials.startsWith('ZZ'), `public: new initials show on the board (${myRow?.initials})`);
pub.send({ t: 'public:leave' });

log('all checks passed');
process.exit(0);

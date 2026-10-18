// Resilience checks for M6 (PLAN.md §5): dropped players keep their seat, late joins, TV drop pauses,
// heartbeat timeouts, host grace, seat expiry, initials blocklist.
// Run against a local server started with short holds:
//   SEAT_HOLD_MS=6000 HOST_GRACE_MS=3000 PORT=8791 npm start
//   npx tsx scripts/resilience.ts ws://localhost:8791/ws
import WebSocket from 'ws';
import type { ClientMessage, ServerMessage } from '@replay/shared';

const url = process.argv[2] ?? 'ws://localhost:8791/ws';
const origin = process.argv[3];
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
const check = (ok: unknown, what: string) => {
  console.log(`${ok ? '✓' : '✗'} ${what}`);
  if (!ok) process.exit(1);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Msg<T extends ServerMessage['t']> = Extract<ServerMessage, { t: T }>;

function client(name: string, { heartbeat = true } = {}) {
  const ws = new WebSocket(url, origin ? { origin } : undefined);
  const inbox: ServerMessage[] = [];
  ws.on('message', (d) => inbox.push(JSON.parse(d.toString()) as ServerMessage));
  const send = (m: ClientMessage) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(m));
  // Real clients ping every 3 s; a "silent" client skips it to trigger the server's heartbeat timeout.
  const ping = heartbeat ? setInterval(() => send({ t: 'ping', at: Date.now() }), 3000) : null;
  ws.on('close', () => ping && clearInterval(ping));
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
  const state = () => [...inbox].reverse().find((m) => m.t === 'room:state') as Msg<'room:state'> | undefined;
  return { name, ws, inbox, send, until, mark, state, ready: new Promise<void>((r) => ws.once('open', () => r())) };
}
type Client = ReturnType<typeof client>;

async function join(c: Client, code: string, initials: string) {
  await c.ready;
  c.send({ t: 'room:join', code, initials });
  return c.until('room:state', (m) => m.you !== null);
}

// ---------- Room 1: a full game with drops ----------
const tv = client('TV');
await tv.ready;
tv.send({ t: 'room:create', role: 'tv' });
const created = await tv.until('room:state');
const code = created.room.code;
const tvToken = created.token;
log('room', code);

const host = client('MAY');
await join(host, code, 'MAY');
const rude = client('RUDE');
const rudeState = await join(rude, code, 'ASS');
const rudeMe = rudeState.room.players.find((p) => p.id === rudeState.you)!;
check(rudeMe.initials === 'AS2', `blocked initials ASS became ${rudeMe.initials}`);

const quitter = client('QUIT');
await join(quitter, code, 'JOR');
quitter.send({ t: 'room:leave' });
const afterQuit = await tv.until('room:state', (m) => m.room.players.length === 2, 3000, tv.mark() - 1);
check(afterQuit.room.players.length === 2, 'leaving on purpose in the lobby frees the seat right away');

const p3 = client('ZED');
await join(p3, code, 'ZED');
const p4 = client('KIT');
await join(p4, code, 'KIT');
const players = [host, rude, p3, p4];

tv.send({ t: 'tv:soundOn' });
host.send({ t: 'room:rules', rules: { rounds: 5, clipSeconds: 10, mix: 'today', sound: 'tv' } });
await tv.until('room:state', (m) => m.room.rules.rounds === 5 && m.room.tvReady);
host.send({ t: 'room:start' });

// Round 1: four players cover A-D so exactly one scores.
const r1 = await tv.until('roundStart', (m) => m.index === 1, 60_000);
await sleep(Math.max(0, r1.startAt - Date.now()) + 300);
players.forEach((p, i) => p.send({ t: 'guess', roundId: r1.roundId, choice: 'ABCD'[i] as 'A', elapsedMs: 1000 }));
const rev1 = await tv.until('reveal', (m) => m.roundId === r1.roundId);
const scorerEntry = rev1.board.find((b) => b.score > 0)!;
const scorer = players.find((p) => p.state()?.you === scorerEntry.id)!;
const scorerToken = scorer.state()!.token;
log(`round 1: ${scorerEntry.initials} scored ${scorerEntry.score}`);

// Abrupt drop (no goodbye message), like a phone losing signal.
const tvMark = tv.mark();
scorer.ws.terminate();
const awayState = await tv.until('room:state', (m) => m.room.players.find((p) => p.id === scorerEntry.id)?.connected === false, 25_000, tvMark);
check(awayState.room.players.some((p) => p.id === scorerEntry.id), 'a dropped player keeps their seat (shown as away)');

// Round 2 must not wait for the missing player.
const r2 = await tv.until('roundStart', (m) => m.index === 2, 30_000);
await sleep(Math.max(0, r2.startAt - Date.now()) + 300);
const others = players.filter((p) => p !== scorer);
others.forEach((p) => p.send({ t: 'guess', roundId: r2.roundId, choice: 'A', elapsedMs: 900 }));
const answeredAt = Date.now(); // Local clock only: the server's clock may differ from ours.
const rev2 = await tv.until('reveal', (m) => m.roundId === r2.roundId, 6000);
check(Date.now() - answeredAt < 3000, 'the round reveals as soon as everyone still here has answered');

// Late joiner during round 3 gets the round in progress.
const r3 = await tv.until('roundStart', (m) => m.index === 3, 30_000);
const late = client('LATE');
await join(late, code, 'NEW');
const lateRound = await late.until('roundStart', (m) => m.roundId === r3.roundId, 3000);
check(lateRound.index === 3, 'a late joiner drops into the round in progress');

// The dropped player comes back with their token.
const back = client('BACK');
await back.ready;
back.send({ t: 'room:resume', code, token: scorerToken });
const resumed = await back.until('room:state', (m) => m.you === scorerEntry.id, 5000);
const myScore = resumed.room.players.find((p) => p.id === scorerEntry.id)!.score;
check(myScore === rev2.board.find((b) => b.id === scorerEntry.id)!.score && myScore >= scorerEntry.score, `resumed with the same seat and score (${myScore})`);
check(await back.until('roundStart', (m) => m.roundId === r3.roundId, 3000), 'resumed player gets the round in progress');

// TV drops mid-round: the round pauses, answers are ignored, then it restarts when the TV is back.
await tv.until('reveal', (m) => m.roundId === r3.roundId, 30_000);
const r4 = await tv.until('roundStart', (m) => m.index === 4, 30_000);
await sleep(Math.max(0, r4.startAt - Date.now()) + 300);
const hostMark = host.mark();
tv.ws.terminate();
const paused = await host.until('room:state', (m) => m.room.paused && !m.room.tvConnected, 25_000, hostMark);
check(paused.room.paused, 'TV dropped mid-round: the game pauses');
host.send({ t: 'guess', roundId: r4.roundId, choice: 'A', elapsedMs: 500 });
await sleep(800);
check(!host.inbox.slice(hostMark).some((m) => m.t === 'guessAck'), 'answers are ignored while paused');
const tv2 = client('TV2');
await tv2.ready;
const replayMark = host.mark();
tv2.send({ t: 'room:resume', code, token: tvToken });
const tvBack = await tv2.until('room:state', (m) => m.role === 'tv', 5000);
check(!tvBack.room.paused && tvBack.room.tvConnected, 'TV back: the game resumes');
// If the drop was noticed mid-round, that round replays from the top; if the round had already ended
// by the time the server noticed (abrupt drops can take up to the 12 s heartbeat), the next one starts.
const restarted = await host.until('roundStart', (m) => m.index >= 4, 8000, replayMark);
check(
  restarted.roundId === r4.roundId ? restarted.startAt > r4.startAt : restarted.index === 5,
  `play carries on after the TV is back (${restarted.roundId === r4.roundId ? 'round 4 replayed from the top' : 'round 5 started'})`,
);

// Heartbeat: a client that goes quiet (no pings) is dropped by the server on its own.
const silent = client('SILENT', { heartbeat: false });
const silentState = await join(silent, code, 'SIL');
const silentId = silentState.you!;
const quietFrom = Date.now();
await tv2.until('room:state', (m) => m.room.players.find((p) => p.id === silentId)?.connected === false, 25_000, tv2.mark());
const quietFor = (Date.now() - quietFrom) / 1000;
check(quietFor >= 10 && quietFor <= 20, `silent connection dropped by the heartbeat after ${quietFor.toFixed(1)}s`);

// ---------- Room 2: lobby seat expiry and host grace ----------
const tvB = client('TVB');
await tvB.ready;
tvB.send({ t: 'room:create', role: 'tv' });
const codeB = (await tvB.until('room:state')).room.code;
const hostB = client('HOSTB');
const hostBState = await join(hostB, codeB, 'HHH');
const otherB = client('OTHERB');
await join(otherB, codeB, 'OOO');
const hostBToken = hostBState.token;
hostB.ws.terminate();
await tvB.until('room:state', (m) => m.room.players.find((p) => p.id === hostBState.you)?.connected === false, 15_000);
check(tvB.state()!.room.hostId === hostBState.you, 'a dropped host keeps the role during the grace period');
const handedOff = await tvB.until('room:state', (m) => m.room.hostId !== hostBState.you, 10_000, tvB.mark());
check(handedOff.room.hostId !== null, 'after the grace period the host role passes on');
await tvB.until('room:state', (m) => !m.room.players.some((p) => p.id === hostBState.you), 15_000, tvB.mark());
const lateB = client('LATEB');
await lateB.ready;
lateB.send({ t: 'room:resume', code: codeB, token: hostBToken });
const failed = await lateB.until('error', () => true, 5000);
check(failed.code === 'resume_failed', 'after the hold expires the seat is gone and resume fails');

log('all checks passed');
process.exit(0);

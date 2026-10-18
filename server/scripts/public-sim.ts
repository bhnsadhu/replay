// Plays a full public set against a running server (PLAN.md §5, M5).
// Usage: npx tsx scripts/public-sim.ts [ws://localhost:8787/ws] [origin]
import WebSocket from 'ws';
import { PUBLIC_MIX_ORDER, type ClientMessage, type ServerMessage } from '@replay/shared';

const url = process.argv[2] ?? 'ws://localhost:8787/ws';
const origin = process.argv[3];
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
const check = (ok: unknown, what: string) => {
  console.log(`${ok ? '✓' : '✗'} ${what}`);
  if (!ok) process.exit(1);
};

function player(initials: string) {
  const ws = new WebSocket(url, origin ? { origin } : undefined);
  const inbox: ServerMessage[] = [];
  let answer = true;
  const send = (m: ClientMessage) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(m));
  // Like the real app: ping every 3 s, or the server's heartbeat drops the connection.
  const ping = setInterval(() => send({ t: 'ping', at: Date.now() }), 3000);
  ws.on('close', () => clearInterval(ping));
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString()) as ServerMessage;
    inbox.push(m);
    // Everyone answers fast, so rounds reveal early and the set finishes quickly.
    if (m.t === 'roundStart' && answer) {
      const delay = Math.max(0, m.startAt - Date.now()) + 300 + Math.random() * 400;
      setTimeout(() => send({ t: 'guess', roundId: m.roundId, choice: 'ABCD'[Math.floor(Math.random() * 4)] as 'A', elapsedMs: 800 }), delay);
    }
  });
  const until = async <T extends ServerMessage['t']>(t: T, where: (m: Extract<ServerMessage, { t: T }>) => boolean = () => true, ms = 60_000, from = 0) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const hit = inbox.slice(from).find((m) => m.t === t && where(m as Extract<ServerMessage, { t: T }>));
      if (hit) return hit as Extract<ServerMessage, { t: T }>;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`${initials}: timed out waiting for ${t}`);
  };
  return { ws, inbox, send, until, ready: new Promise((r) => ws.once('open', r)), quiet: () => (answer = false) };
}

const first = player('ONE');
await first.ready;
first.send({ t: 'public:join', initials: 'ONE' });
const waiting = await first.until('public:state');
check(waiting.view.phase === 'waiting' && waiting.view.nextAt !== null, 'first player arrives: set starts in a few seconds');

const r1 = await first.until('roundStart', (m) => m.index === 1);
log('set 1 round 1 started, mix', (await first.until('public:state', (m) => m.view.phase === 'playing')).view.mix);

const late = player('TWO');
await late.ready;
late.send({ t: 'public:join', initials: 'TWO' });
const lateRound = await late.until('roundStart', () => true, 5000);
check(lateRound.roundId === r1.roundId || lateRound.index >= 1, 'a late joiner gets the round in progress right away');

const crowd = Array.from({ length: 12 }, (_, i) => player(`C${String.fromCharCode(65 + i)}${i % 10}`));
await Promise.all(crowd.map((c) => c.ready));
crowd.forEach((c, i) => c.send({ t: 'public:join', initials: `C${String.fromCharCode(65 + i)}${'XYZ'[i % 3]}` }));
await first.until('public:state', (m) => m.view.online === 14);
log('14 players online');

const reveal3 = await first.until('reveal', (m) => m.board.length > 0 && (m.you !== null), 60_000, first.inbox.length);
const everyone = [first, late, ...crowd];
const reveals = await Promise.all(everyone.map((p) => p.until('reveal', (m) => m.roundId === reveal3.roundId)));
check(reveals.every((r) => r.board.length <= 11), 'every board is at most top 10 + your own row');
check(
  reveals.every((r, i) => r.board.some((b) => b.id === everyone[i]!.inbox.find((m) => m.t === 'public:state')!.you)),
  'every player sees their own row',
);

const over = await first.until('gameOver', () => true, 150_000);
log('set over, top:', over.board.slice(0, 3).map((b) => `${b.initials} ${b.score}`).join(', '));
const inter = await first.until('public:state', (m) => m.view.phase === 'intermission');
check(inter.view.nextAt !== null, 'results break between sets');
const stats = player('WEB');
await stats.ready;
stats.send({ t: 'public:stats' });
const s = await stats.until('public:stats');
check(s.online === 14 && s.best.length > 0, `home screen stats: ${s.online} online, best ${s.best[0]?.initials} ${s.best[0]?.score}`);

const set2 = await first.until('public:state', (m) => m.view.phase === 'playing' && m.view.set === inter.view.set + 1, 30_000);
check(set2.view.mix === PUBLIC_MIX_ORDER[(PUBLIC_MIX_ORDER.indexOf(waiting.view.mix) + 1) % PUBLIC_MIX_ORDER.length], `next set starts on the next mix (${set2.view.mix})`);

everyone.forEach((p) => p.send({ t: 'public:leave' }));
await new Promise((r) => setTimeout(r, 500));
stats.send({ t: 'public:stats' });
const empty = await stats.until('public:stats', (m) => m.online === 0, 5000, stats.inbox.length);
check(empty.online === 0, 'everyone left: the public room goes to sleep');
log('all checks passed');
process.exit(0);

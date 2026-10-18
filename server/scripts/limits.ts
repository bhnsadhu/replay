// Checks the abuse limits (PLAN.md §8, M8) against a FRESH local server (the limits remember this IP):
//   PORT=8792 npm start            (in another terminal)
//   npx tsx scripts/limits.ts ws://localhost:8792/ws
import WebSocket from 'ws';
import type { ServerMessage } from '@replay/shared';

const url = process.argv[2] ?? 'ws://localhost:8792/ws';
const check = (ok: unknown, what: string) => {
  console.log(`${ok ? '✓' : '✗'} ${what}`);
  if (!ok) process.exit(1);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function open(): Promise<{ ws: WebSocket; inbox: ServerMessage[]; closed: Promise<number> }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const inbox: ServerMessage[] = [];
    const closed = new Promise<number>((r) => ws.on('close', (code) => r(code)));
    ws.on('message', (d) => inbox.push(JSON.parse(d.toString()) as ServerMessage));
    ws.once('open', () => resolve({ ws, inbox, closed }));
    ws.once('error', reject);
  });
}

// 1. Too many connections from one IP: the extras are closed with 1013.
const many = await Promise.all(Array.from({ length: 45 }, () => open()));
await sleep(500);
const closedCodes = many.filter((c) => c.ws.readyState !== WebSocket.OPEN).length;
check(closedCodes === 5, `45 connections from one IP: 40 stay open, ${closedCodes} closed`);
const firstClosed = many.find((c) => c.ws.readyState !== WebSocket.OPEN);
check((await firstClosed?.closed) === 1013, 'extra connections close with 1013 (try again later)');
many.forEach((c) => c.ws.close());
await sleep(300);

// 2. A normal client is never limited: pings every 3 s plus a burst of play.
const normal = await open();
for (let i = 0; i < 20; i++) normal.ws.send(JSON.stringify({ t: 'ping', at: Date.now() }));
await sleep(500);
check(!normal.inbox.some((m) => m.t === 'error'), 'a burst of 20 messages is fine');

// 3. Flooding: told to slow down, then cut off.
const flood = await open();
for (let i = 0; i < 300; i++) flood.ws.send(JSON.stringify({ t: 'ping', at: i }));
const floodCode = await Promise.race([flood.closed, sleep(3000).then(() => 0)]);
check(flood.inbox.some((m) => m.t === 'error' && m.code === 'rate_limited'), 'a flood gets a rate_limited error');
check(floodCode === 1008, `and is closed with 1008 after too many (${floodCode})`);
const pongs = flood.inbox.filter((m) => m.t === 'pong').length;
check(pongs >= 40 && pongs < 60, `only the allowed burst was answered (${pongs} pongs)`);

// 4. Guessing room codes: 30 tries, then rate_limited.
const guesser = await open();
for (let i = 0; i < 35; i++) {
  guesser.ws.send(JSON.stringify({ t: 'room:join', code: 'ZZZZ', initials: 'BOT' }));
  await sleep(20);
}
await sleep(500);
const notFound = guesser.inbox.filter((m) => m.t === 'error' && m.code === 'room_not_found').length;
const limited = guesser.inbox.some((m) => m.t === 'error' && m.code === 'rate_limited');
check(notFound === 30 && limited, `room code guessing: ${notFound} tries answered, then rate_limited`);
check(normal.ws.readyState === WebSocket.OPEN, 'the normal client is still connected');

console.log('all checks passed');
process.exit(0);

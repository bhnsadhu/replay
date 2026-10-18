// Checks the REPLAY? vote timer: 1 of 3 players votes yes, so after VOTE_MS everyone returns to the lobby.
// Usage: npx tsx scripts/vote-timeout.ts [ws://localhost:8787/ws] [origin]
import WebSocket from 'ws';
import { VOTE_MS, type ClientMessage, type ServerMessage } from '@replay/shared';

const url = process.argv[2] ?? 'ws://localhost:8787/ws';
const origin = process.argv[3];

function client() {
  const ws = new WebSocket(url, origin ? { origin } : undefined);
  const inbox: ServerMessage[] = [];
  ws.on('message', (d) => inbox.push(JSON.parse(d.toString()) as ServerMessage));
  const send = (m: ClientMessage) => ws.send(JSON.stringify(m));
  const until = async <T extends ServerMessage['t']>(t: T, where: (m: Extract<ServerMessage, { t: T }>) => boolean, ms = 60_000, from = 0) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const hit = inbox.slice(from).find((m) => m.t === t && where(m as Extract<ServerMessage, { t: T }>));
      if (hit) return hit as Extract<ServerMessage, { t: T }>;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`timed out waiting for ${t}`);
  };
  return { ws, send, until, inbox, ready: new Promise((r) => ws.once('open', r)) };
}

const tv = client();
await tv.ready;
tv.send({ t: 'room:create', role: 'tv' });
const { room } = await tv.until('room:state', () => true);
const phones = [client(), client(), client()];
await Promise.all(phones.map((p) => p.ready));
for (const [i, p] of phones.entries()) p.send({ t: 'room:join', code: room.code, initials: ['AAA', 'BBB', 'CCC'][i]! });
await tv.until('room:state', (m) => m.room.players.length === 3);
tv.send({ t: 'tv:soundOn' });
phones[0]!.send({ t: 'room:rules', rules: { rounds: 5, clipSeconds: 10, mix: 'today', sound: 'tv' } });
await tv.until('room:state', (m) => m.room.rules.rounds === 5 && m.room.tvReady);
phones[0]!.send({ t: 'room:start' });

for (let r = 1; r <= 5; r++) {
  const start = await tv.until('roundStart', (m) => m.index === r);
  setTimeout(() => phones.forEach((p) => p.send({ t: 'guess', roundId: start.roundId, choice: 'A', elapsedMs: 1000 })), Math.max(0, start.startAt - Date.now()) + 200);
  await tv.until('reveal', (m) => m.roundId === start.roundId);
}
await tv.until('gameOver', () => true);
const voteOpen = await tv.until('room:state', (m) => m.room.phase === 'over' && m.room.vote !== null);
const mark = tv.inbox.length;
phones[1]!.send({ t: 'vote', replay: true });
const t0 = Date.now();
const lobby = await tv.until('room:state', (m) => m.room.phase === 'lobby', VOTE_MS + 5000, mark);
const waited = Date.now() - t0;
const ok = lobby.room.vote === null && waited >= VOTE_MS - 1500 && waited <= VOTE_MS + 2000 && voteOpen.room.vote!.total === 3;
console.log(`${ok ? '✓' : '✗'} 1 of 3 voted yes: back to the lobby after ${(waited / 1000).toFixed(1)}s (vote window ${VOTE_MS / 1000}s)`);
process.exit(ok ? 0 : 1);

// Plays a full room game against a running server: 1 TV + 6 fake phones (PLAN.md §9).
// Usage: npm run simulate -w server [-- ws://localhost:8787/ws]
import WebSocket from 'ws';
import type { ClientMessage, ServerMessage } from '@replay/shared';

const url = process.argv[2] ?? 'ws://localhost:8787/ws';
const origin = process.argv[3];
const t0 = Date.now();
const log = (...args: unknown[]) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...args);

class Client {
  readonly ws: WebSocket;
  readonly inbox: ServerMessage[] = [];
  private waiters: { match: (m: ServerMessage) => boolean; resolve: (m: ServerMessage) => void }[] = [];

  constructor(readonly name: string) {
    this.ws = new WebSocket(url, origin ? { origin } : undefined);
    // Like the real app: ping every 3 s, or the server's heartbeat drops the connection.
    const ping = setInterval(() => this.ws.readyState === WebSocket.OPEN && this.send({ t: 'ping', at: Date.now() }), 3000);
    this.ws.on('close', () => clearInterval(ping));
    this.ws.on('message', (data) => {
      const msg = JSON.parse(data.toString()) as ServerMessage;
      this.inbox.push(msg);
      this.waiters = this.waiters.filter((w) => (w.match(msg) ? (w.resolve(msg), false) : true));
    });
  }

  ready(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws.once('open', () => resolve());
      this.ws.once('error', reject);
    });
  }

  send(msg: ClientMessage): void {
    this.ws.send(JSON.stringify(msg));
  }

  next<T extends ServerMessage['t']>(
    t: T,
    where: (m: Extract<ServerMessage, { t: T }>) => boolean = () => true,
    timeoutMs = 60_000,
  ): Promise<Extract<ServerMessage, { t: T }>> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${this.name}: timed out waiting for ${t}`)), timeoutMs);
      this.waiters.push({
        match: (m) => m.t === t && where(m as Extract<ServerMessage, { t: T }>),
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m as Extract<ServerMessage, { t: T }>);
        },
      });
    });
  }

  /** A matching message that already arrived, or the next one. Avoids races between clients. */
  async got<T extends ServerMessage['t']>(t: T, where: (m: Extract<ServerMessage, { t: T }>) => boolean): Promise<Extract<ServerMessage, { t: T }>> {
    const seen = this.inbox.find((m) => m.t === t && where(m as Extract<ServerMessage, { t: T }>));
    return (seen as Extract<ServerMessage, { t: T }> | undefined) ?? this.next(t, where);
  }

  last<T extends ServerMessage['t']>(t: T): Extract<ServerMessage, { t: T }> | undefined {
    return [...this.inbox].reverse().find((m) => m.t === t) as Extract<ServerMessage, { t: T }> | undefined;
  }
}

function check(condition: unknown, message: string): void {
  if (!condition) {
    console.error(`✗ ${message}`);
    process.exit(1);
  }
  console.log(`✓ ${message}`);
}

async function main(): Promise<void> {
  const tv = new Client('TV');
  await tv.ready();
  tv.send({ t: 'room:create', role: 'tv' });
  const created = await tv.next('room:state');
  const code = created.room.code;
  log(`room ${code} created by TV`);
  check(created.room.rules.sound === 'tv', 'TV-hosted room plays sound on the TV');

  const names = ['MAY', 'DEV', 'JOR', 'PRI', 'SAM', 'DEV'];
  const phones = names.map((_, i) => new Client(`P${i + 1}`));
  await Promise.all(phones.map((p) => p.ready()));
  for (const [i, p] of phones.entries()) {
    p.send({ t: 'room:join', code, initials: names[i]! });
    await p.next('room:state');
  }
  const lobby = await phones[0]!.got('room:state', (m) => m.room.players.length === 6);
  log('players:', lobby.room.players.map((p) => `P${p.slot}:${p.initials}`).join(' '));
  check(lobby.room.players.length === 6, '6 phones joined');
  check(lobby.room.hostId === lobby.you, 'first phone to join is the host');
  check(lobby.room.players.some((p) => p.initials === 'DE2'), 'duplicate initials DEV became DE2');

  const host = phones[0]!;
  phones[1]!.send({ t: 'room:start' });
  const notHost = await phones[1]!.next('error');
  check(notHost.code === 'not_host', 'non-host cannot start');

  host.send({ t: 'room:start' });
  const noSound = await host.next('error');
  check(noSound.code === 'cannot_start', 'cannot start before the TV presses a key');

  tv.send({ t: 'tv:soundOn' });
  host.send({ t: 'room:rules', rules: { rounds: 5, clipSeconds: 10, mix: 'today', sound: 'tv' } });
  await host.next('room:state');
  host.send({ t: 'room:start' });

  const rounds = 5;
  for (let r = 1; r <= rounds; r++) {
    const start = await tv.got('roundStart', (m) => m.index === r);
    check(start.index === r && start.durationMs === 10_000, `round ${r} started (10s clip)`);
    const active = phones.filter((p) => p.ws.readyState === WebSocket.OPEN);
    if (r === 3) {
      log('P6 disconnects mid-game');
      phones[5]!.ws.close();
    }
    const answering = active.filter((p) => !(r === 3 && p === phones[5]));
    const delay = Math.max(0, start.startAt - Date.now());
    answering.forEach((p, i) => {
      setTimeout(() => {
        const choice = start.options[(i + r) % 4]!.letter;
        p.send({ t: 'guess', roundId: start.roundId, choice, elapsedMs: 800 + i * 400 });
      }, delay + 300 + i * 150);
    });
    const reveal = await tv.got('reveal', (m) => m.roundId === start.roundId);
    const lockedIn = tv.last('lockedIn')!;
    const picked = Object.values(reveal.picks).flat().length;
    log(`round ${r}: answer ${reveal.correct} "${reveal.track.title}" · picks ${JSON.stringify(reveal.picks)}`);
    log(`  board: ${reveal.board.map((b) => `${b.rank}.${b.initials} ${b.score}(+${b.delta})`).join('  ')}`);
    check(picked === answering.length, `round ${r}: all ${answering.length} answers counted`);
    check(lockedIn.count === answering.length, `round ${r}: TV saw ${lockedIn.count}/${lockedIn.total} locked in`);
    check(reveal.you === null, `round ${r}: TV gets no personal result`);
    const hostReveal = await host.got('reveal', (m) => m.roundId === start.roundId);
    check(hostReveal.you !== null && hostReveal.board.length === 6, `round ${r}: phones get their own result and the full board`);
  }

  const over = await tv.got('gameOver', () => true);
  const hostOver = await host.got('gameOver', () => true);
  log('final:', over.board.map((b) => `${b.rank}.${b.initials} ${b.score}`).join('  '));
  log('awards:', JSON.stringify(over.awards));
  check(over.board.length === 6, 'final board has everyone, including the player who left');
  check(hostOver.you !== null && hostOver.you.rank >= 1, 'host gets their final rank');
  const sorted = over.board.every((b, i, all) => i === 0 || all[i - 1]!.score >= b.score);
  check(sorted, 'final board is sorted by score');
  await new Promise((r) => setTimeout(r, 300)); // The state update may already be in the inbox.
  check(tv.last('room:state')!.room.phase === 'over', 'room is in the game-over state');

  const voteState = tv.last('room:state')!.room.vote;
  check(voteState !== null && voteState.total === 5, 'REPLAY? vote opens for the 5 connected players');
  const voters = phones.filter((p) => p.ws.readyState === WebSocket.OPEN);
  voters.slice(0, 3).forEach((p) => p.send({ t: 'vote', replay: true }));
  const partial = await tv.next('room:state', (m) => m.room.vote?.yes.length === 3, 5000);
  check(partial.room.phase === 'over', '3 of 5 yes votes: still waiting for the rest or the timer');
  voters.slice(3).forEach((p) => p.send({ t: 'vote', replay: true }));
  const replay = await tv.next('roundStart', (m) => m.index === 1, 30_000);
  check(replay.index === 1, 'everyone voted yes: a new game starts right away in the same room');
  host.send({ t: 'room:end' });
  const lobbyAgain = await tv.next('room:state', (m) => m.room.phase === 'lobby', 5000);
  check(lobbyAgain.room.vote === null && lobbyAgain.room.phase === 'lobby', 'host can send everyone back to the lobby');
  const p6 = lobbyAgain.room.players.find((p) => p.initials === 'DE2');
  check(lobbyAgain.room.players.length === 6 && p6?.connected === false, 'the player who dropped keeps their seat for a minute (shown as away)');

  host.send({ t: 'room:kick', playerId: tv.last('room:state')!.room.players[1]!.id });
  const kicked = await phones[1]!.got('room:closed', () => true);
  check(kicked.reason.includes('removed'), 'host can remove a player');

  host.send({ t: 'room:leave' }); // What the real page sends on close (see client useRoom).
  host.ws.close();
  const afterHostLeft = await tv.next('room:state', (m) => m.room.hostId !== lobby.you, 5000);
  check(afterHostLeft.room.hostId !== null, 'host role passes on when the host leaves');

  tv.send({ t: 'room:leave' });
  tv.ws.close();
  const closed = await phones[2]!.got('room:closed', () => true);
  check(closed.reason.includes('TV'), 'room closes for everyone when the TV leaves');

  log('all checks passed');
  process.exit(0);
}

main().catch((err) => {
  console.error('✗', err instanceof Error ? err.message : err);
  process.exit(1);
});

import { randomBytes } from 'node:crypto';
import {
  CLIP_MS,
  PUBLIC_BOARD_SIZE,
  PUBLIC_FIRST_SET_DELAY_MS,
  PUBLIC_INTERMISSION_MS,
  PUBLIC_MAX_PLAYERS,
  PUBLIC_MIX_ORDER,
  ROUNDS_PER_GAME,
  type BestScore,
  type BoardEntry,
  type Letter,
  type PublicPhase,
  type PublicView,
  type ServerMessage,
} from '@replay/shared';
import { Game } from './game';
import { SEAT_HOLD_MS, uniqueInitials, type Session } from './rooms';

interface PublicPlayer {
  id: string;
  token: string;
  session: Session | null;
  initials: string;
  goneTimer: NodeJS.Timeout | null;
}

const BEST_WINDOW_MS = 24 * 60 * 60 * 1000;
const BEST_SHOWN = 8;

/** Top of the board plus your own row, so a crowded public board stays small (PLAN.md §5). */
export function boardFor(board: BoardEntry[], playerId: string): BoardEntry[] {
  const top = board.slice(0, PUBLIC_BOARD_SIZE);
  if (top.some((b) => b.id === playerId)) return top;
  const mine = board.find((b) => b.id === playerId);
  return mine ? [...top, mine] : top;
}

/**
 * The always-on public room: nonstop sets of 10 rounds, mixes rotating set by set.
 * Sleeps when nobody is connected; starts a set a few seconds after the first player arrives.
 */
class PublicRoom {
  private readonly players = new Map<string, PublicPlayer>();
  private game: Game | null = null;
  private phase: PublicPhase = 'waiting';
  private nextAt: number | null = null;
  private timer: NodeJS.Timeout | null = null;
  private setNumber = 0;
  private mixIndex = 0;
  private best: (BestScore & { at: number })[] = [];

  join(session: Session, initials: string): void {
    if (session.inPublic && session.playerId && this.players.has(session.playerId)) return;
    if (this.players.size >= PUBLIC_MAX_PLAYERS) {
      session.send({ t: 'error', code: 'room_full', message: 'The public room is full right now. Try again in a minute.' });
      return;
    }
    const inUse = new Set([...this.players.values()].map((p) => p.initials));
    const player: PublicPlayer = {
      id: randomBytes(8).toString('base64url'),
      token: randomBytes(16).toString('base64url'),
      session,
      initials: uniqueInitials(initials, inUse),
      goneTimer: null,
    };
    this.players.set(player.id, player);
    this.attach(session, player);
  }

  /** Gets a public seat (and this set's score) back after a dropped connection or reload. */
  resume(session: Session, token: string): boolean {
    const player = [...this.players.values()].find((p) => p.token === token);
    if (!player) return false;
    if (player.session && player.session !== session) {
      player.session.inPublic = false;
      player.session.playerId = null;
    }
    if (player.goneTimer) clearTimeout(player.goneTimer);
    player.goneTimer = null;
    this.attach(session, player);
    return true;
  }

  private attach(session: Session, player: PublicPlayer): void {
    player.session = session;
    session.inPublic = true;
    session.playerId = player.id;
    if (this.phase === 'waiting' && !this.timer) this.schedule(PUBLIC_FIRST_SET_DELAY_MS);
    this.broadcastState();
    // Drop straight into the round in progress, if there is one.
    const live = this.game?.roundInProgress();
    if (live) session.send(live);
  }

  /** Leaving on purpose: the seat goes right away. */
  leave(session: Session): void {
    const player = this.detach(session);
    if (player) this.release(player);
  }

  /** Dropped connection or reload: hold the seat for SEAT_HOLD_MS. */
  away(session: Session): void {
    const player = this.detach(session);
    if (!player) return;
    player.goneTimer = setTimeout(() => this.release(player), SEAT_HOLD_MS);
    this.game?.playerLeft();
    this.broadcastState();
  }

  private detach(session: Session): PublicPlayer | null {
    if (!session.inPublic || !session.playerId) return null;
    const player = this.players.get(session.playerId);
    session.inPublic = false;
    session.playerId = null;
    if (!player || player.session !== session) return null;
    player.session = null;
    return player;
  }

  private release(player: PublicPlayer): void {
    if (player.goneTimer) clearTimeout(player.goneTimer);
    this.players.delete(player.id);
    this.game?.playerLeft();
    if (this.players.size === 0) return this.sleep();
    this.broadcastState();
  }

  private connected(): PublicPlayer[] {
    return [...this.players.values()].filter((p) => p.session !== null);
  }

  /** New initials from the options screen; they show on the board from the next reveal. */
  setInitials(session: Session, initials: string): void {
    const player = session.inPublic && session.playerId ? this.players.get(session.playerId) : undefined;
    if (!player) return;
    const inUse = new Set([...this.players.values()].filter((p) => p !== player).map((p) => p.initials));
    player.initials = uniqueInitials(initials, inUse);
    this.broadcastState();
  }

  guess(session: Session, roundId: string, choice: Letter, elapsedMs: number): void {
    if (session.inPublic && session.playerId) this.game?.guess(session.playerId, roundId, choice, elapsedMs);
  }

  stats(): { online: number; best: BestScore[] } {
    const cutoff = Date.now() - BEST_WINDOW_MS;
    this.best = this.best.filter((b) => b.at >= cutoff);
    return { online: this.connected().length, best: this.best.slice(0, BEST_SHOWN).map(({ initials, score }) => ({ initials, score })) };
  }

  // ----- Sets -----

  private schedule(ms: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.nextAt = Date.now() + ms;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.startSet();
    }, ms);
  }

  private startSet(): void {
    if (this.connected().length === 0) return this.sleep();
    this.game?.dispose();
    this.setNumber += 1;
    const mix = PUBLIC_MIX_ORDER[this.mixIndex % PUBLIC_MIX_ORDER.length]!;
    this.phase = 'playing';
    this.nextAt = null;

    const game = new Game(
      { mix, rounds: ROUNDS_PER_GAME, clipMs: CLIP_MS },
      {
        playerIds: () => [...this.players.keys()],
        activePlayerIds: () => this.connected().map((p) => p.id),
        initialsOf: (id) => this.players.get(id)?.initials ?? '???',
        send: (build) => this.sendEach(build),
        onFinished: () => {
          if (this.game !== game) return;
          this.recordBest(game);
          this.mixIndex += 1;
          this.phase = 'intermission';
          this.schedule(PUBLIC_INTERMISSION_MS);
          this.broadcastState();
        },
        onFailed: (message) => {
          if (this.game !== game) return;
          this.sendEach(() => ({ t: 'error', code: 'music_unavailable', message }));
          this.mixIndex += 1; // Try the next mix after a short break.
          this.phase = 'intermission';
          this.schedule(PUBLIC_INTERMISSION_MS);
          this.broadcastState();
        },
      },
    );
    this.game = game;
    this.broadcastState();
    void game.start();
  }

  private recordBest(game: Game): void {
    const now = Date.now();
    for (const p of this.players.values()) {
      const score = game.scoreOf(p.id);
      if (score > 0) this.best.push({ initials: p.initials, score, at: now });
    }
    this.best.sort((a, b) => b.score - a.score);
    this.best = this.best.slice(0, 50);
  }

  /** Nobody left: stop the music until someone comes back. */
  private sleep(): void {
    for (const p of this.players.values()) if (p.goneTimer) clearTimeout(p.goneTimer);
    this.players.clear();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.game?.dispose();
    this.game = null;
    this.phase = 'waiting';
    this.nextAt = null;
  }

  // ----- Output -----

  private view(): PublicView {
    return {
      online: this.connected().length,
      phase: this.phase,
      nextAt: this.nextAt,
      set: this.setNumber,
      mix: PUBLIC_MIX_ORDER[this.mixIndex % PUBLIC_MIX_ORDER.length]!,
    };
  }

  private sendEach(build: (playerId: string | null) => ServerMessage | null): void {
    for (const p of this.players.values()) {
      if (!p.session) continue;
      const msg = build(p.id);
      if (!msg) continue;
      if (msg.t === 'reveal' || msg.t === 'gameOver') p.session.send({ ...msg, board: boardFor(msg.board, p.id) });
      else p.session.send(msg);
    }
  }

  private broadcastState(): void {
    const view = this.view();
    for (const p of this.players.values()) p.session?.send({ t: 'public:state', view, you: p.id, initials: p.initials, token: p.token });
  }
}

export const publicRoom = new PublicRoom();

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
import type { Session } from './rooms';

interface PublicPlayer {
  id: string;
  session: Session;
  initials: string;
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
    const player: PublicPlayer = { id: randomBytes(8).toString('base64url'), session, initials };
    this.players.set(player.id, player);
    session.inPublic = true;
    session.playerId = player.id;

    if (this.phase === 'waiting' && !this.timer) this.schedule(PUBLIC_FIRST_SET_DELAY_MS);
    this.broadcastState();
    // Drop straight into the round in progress, if there is one.
    const live = this.game?.roundInProgress();
    if (live) session.send(live);
  }

  leave(session: Session): void {
    if (!session.inPublic || !session.playerId) return;
    this.players.delete(session.playerId);
    session.inPublic = false;
    session.playerId = null;
    this.game?.playerLeft();
    if (this.players.size === 0) return this.sleep();
    this.broadcastState();
  }

  guess(session: Session, roundId: string, choice: Letter, elapsedMs: number): void {
    if (session.inPublic && session.playerId) this.game?.guess(session.playerId, roundId, choice, elapsedMs);
  }

  stats(): { online: number; best: BestScore[] } {
    const cutoff = Date.now() - BEST_WINDOW_MS;
    this.best = this.best.filter((b) => b.at >= cutoff);
    return { online: this.players.size, best: this.best.slice(0, BEST_SHOWN).map(({ initials, score }) => ({ initials, score })) };
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
    if (this.players.size === 0) return this.sleep();
    this.game?.dispose();
    this.setNumber += 1;
    const mix = PUBLIC_MIX_ORDER[this.mixIndex % PUBLIC_MIX_ORDER.length]!;
    this.phase = 'playing';
    this.nextAt = null;

    const game = new Game(
      { mix, rounds: ROUNDS_PER_GAME, clipMs: CLIP_MS },
      {
        playerIds: () => [...this.players.keys()],
        activePlayerIds: () => [...this.players.keys()],
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
      online: this.players.size,
      phase: this.phase,
      nextAt: this.nextAt,
      set: this.setNumber,
      mix: PUBLIC_MIX_ORDER[this.mixIndex % PUBLIC_MIX_ORDER.length]!,
    };
  }

  private sendEach(build: (playerId: string | null) => ServerMessage | null): void {
    for (const p of this.players.values()) {
      const msg = build(p.id);
      if (!msg) continue;
      if (msg.t === 'reveal' || msg.t === 'gameOver') p.session.send({ ...msg, board: boardFor(msg.board, p.id) });
      else p.session.send(msg);
    }
  }

  private broadcastState(): void {
    const view = this.view();
    for (const p of this.players.values()) p.session.send({ t: 'public:state', view, you: p.id });
  }
}

export const publicRoom = new PublicRoom();

import {
  AUDIO_PATH,
  LATE_GUESS_GRACE_MS,
  LETTERS,
  MAX_CLAIMED_LAG_MS,
  PRELOAD_MS,
  REVEAL_MS,
  scoreAnswer,
  type Awards,
  type BoardEntry,
  type Letter,
  type MixId,
  type RevealedTrack,
  type ServerMessage,
  type YourResult,
} from '@replay/shared';
import { newClipId, storeClip } from './audio';
import { downloadPreview, trackDetail } from './music/deezer';
import { loadMix } from './music/mixes';
import { buildQuestion, type PoolTrack, type Question } from './music/question';
import { areRelated, hitsBy } from './music/artists';

export interface GameSettings {
  mix: MixId;
  rounds: number;
  clipMs: number;
}

/** What a game needs from whoever owns it (a solo session or a room). */
export interface GameOwner {
  /** Everyone on the scoreboard, connected or not. */
  playerIds(): string[];
  /** Players expected to answer: the round reveals once all of them have. */
  activePlayerIds(): string[];
  initialsOf(playerId: string): string;
  /** Sends a message built per recipient: a player id, or null for the TV. Return null to skip. */
  send(build: (playerId: string | null) => ServerMessage | null): void;
  onFinished(): void;
  onFailed(message: string): void;
}

interface PreparedRound {
  roundId: string;
  question: Question;
  track: RevealedTrack;
}

interface LiveRound extends PreparedRound {
  startAt: number;
  guesses: Map<string, { choice: Letter; elapsedMs: number }>;
  revealed: boolean;
}

interface PlayerStats {
  score: number;
  streak: number;
  bestStreak: number;
  correctCount: number;
  fastestMs: number | null;
  /** Sum of correct answer times, for breaking ties (PLAN.md §6). */
  totalCorrectMs: number;
  lastDelta: number;
}

const MAX_PREPARE_ATTEMPTS = 5;

/** Server-timed rounds for any number of players (PLAN.md §7 state machine: ROUND_INTRO → GUESSING → REVEAL). */
export class Game {
  private pool: PoolTrack[] = [];
  private readonly used = new Set<number>();
  private readonly shown = new Set<number>();
  private readonly timers = new Set<NodeJS.Timeout>();
  private readonly stats = new Map<string, PlayerStats>();
  private next: Promise<PreparedRound | null> | null = null;
  private current: LiveRound | null = null;
  private currentStart: ServerMessage | null = null;
  private nobodyGot: { title: string; artist: string } | null = null;
  private index = 0;
  private disposed = false;
  /** Paused mid-round ('round') or between rounds ('between'); null while running. */
  private paused: 'round' | 'between' | null = null;
  /** A round that became ready while paused, started on resume. */
  private pendingStart: PreparedRound | null = null;
  private pendingReplace = false;
  /** Waiting for the next song to be ready (so a skip or resume can't start two at once). */
  private advancing = false;

  constructor(
    private readonly settings: GameSettings,
    private readonly owner: GameOwner,
  ) {}

  async start(): Promise<void> {
    try {
      this.pool = await loadMix(this.settings.mix);
      const first = await this.prepare();
      if (this.disposed) return;
      if (!first) throw new Error('No playable tracks');
      this.startRound(first);
    } catch (err) {
      console.error('[game] could not start', err);
      if (!this.disposed) this.owner.onFailed('Could not load songs right now. Try again in a moment.');
    }
  }

  /** The round in progress (for someone joining mid-round), or null between rounds. */
  roundInProgress(): ServerMessage | null {
    return this.current && !this.current.revealed ? this.currentStart : null;
  }

  scoreOf(playerId: string): number {
    return this.stats.get(playerId)?.score ?? 0;
  }

  /** Puts the game on hold (e.g. the TV dropped). Timers stop; answers are ignored until resume. */
  pause(): void {
    if (this.paused || this.disposed) return;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    this.paused = this.current && !this.current.revealed ? 'round' : 'between';
  }

  /** Carries on after pause. An interrupted round replays from the top: same song, fresh clock, no answers kept. */
  resume(): void {
    if (!this.paused || this.disposed) return;
    const was = this.paused;
    this.paused = null;
    if (this.pendingStart) {
      const prepared = this.pendingStart;
      this.pendingStart = null;
      this.startRound(prepared, { replace: this.pendingReplace });
    } else if (was === 'round' && this.current) {
      const { roundId, question, track } = this.current;
      this.startRound({ roundId, question, track }, { replay: true });
    } else {
      this.after(1000, () => void this.advance());
    }
  }

  /**
   * Host's SKIP SONG. During a round: drop it (nobody scores) and play a different song in its place.
   * During a reveal: move on right away. Returns false when there's nothing to skip.
   */
  skip(): boolean {
    if (this.paused || this.disposed || this.advancing) return false;
    const round = this.current;
    if (!round) return false;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    if (round.revealed) {
      void this.advance();
      return true;
    }
    round.revealed = true; // No more answers, and its time-up timer is gone.
    this.current = null;
    this.currentStart = null;
    this.owner.send(() => ({ t: 'roundSkipped', roundId: round.roundId }));
    void this.startNext({ replace: true });
    return true;
  }

  get isPaused(): boolean {
    return this.paused !== null;
  }

  guess(playerId: string, roundId: string, choice: Letter, claimedMs: number): void {
    if (this.paused) return;
    const round = this.current;
    if (!round || round.revealed || round.guesses.has(playerId) || roundId !== round.roundId) return;
    if (!this.owner.activePlayerIds().includes(playerId)) return;

    const { clipMs } = this.settings;
    const serverElapsed = Date.now() - round.startAt;
    if (serverElapsed < -LATE_GUESS_GRACE_MS || serverElapsed > clipMs + LATE_GUESS_GRACE_MS) return;

    // Trust the device's own timing (it knows when the clip actually started),
    // but never more than MAX_CLAIMED_LAG_MS faster than the server saw.
    const claimed = Math.min(Math.max(claimedMs, 0), clipMs);
    const elapsedMs = Math.min(Math.max(claimed, serverElapsed - MAX_CLAIMED_LAG_MS), clipMs);
    round.guesses.set(playerId, { choice, elapsedMs });

    this.owner.send((id) => (id === playerId ? { t: 'guessAck', roundId, choice } : null));
    this.sendLockedIn();
    this.revealIfEveryoneAnswered();
  }

  /** A player dropped out: don't keep the round waiting for them. */
  playerLeft(): void {
    this.sendLockedIn();
    this.revealIfEveryoneAnswered();
  }

  dispose(): void {
    this.disposed = true;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
  }

  private statsFor(playerId: string): PlayerStats {
    let s = this.stats.get(playerId);
    if (!s) {
      s = { score: 0, streak: 0, bestStreak: 0, correctCount: 0, fastestMs: null, totalCorrectMs: 0, lastDelta: 0 };
      this.stats.set(playerId, s);
    }
    return s;
  }

  private async prepare(): Promise<PreparedRound | null> {
    for (let attempt = 0; attempt < MAX_PREPARE_ATTEMPTS; attempt++) {
      const question = buildQuestion(this.pool, this.used, { related: areRelated, hitsBy, shown: this.shown });
      if (!question) return null;
      this.used.add(question.answer.id);
      for (const t of question.wrong) this.shown.add(t.id);
      try {
        const detail = await trackDetail(question.answer.id);
        if (!detail.preview) continue;
        const audio = await downloadPreview(detail.preview);
        const roundId = newClipId();
        storeClip(roundId, audio);
        // The pool's year, not Deezer's release_date (often a remaster or compilation year).
        const { title, artist, year } = question.answer;
        return { roundId, question, track: { title, artist, year } };
      } catch (err) {
        console.warn('[game] skipping track', question.answer.id, err instanceof Error ? err.message : err);
      }
    }
    return null;
  }

  /** `replay`: the same round again after a pause. `replace`: a different song in a skipped round's place. */
  private startRound(prepared: PreparedRound, { replay = false, replace = false } = {}): void {
    if (this.paused) {
      this.pendingStart = prepared;
      this.pendingReplace = replace;
      return;
    }
    if (!replay && !replace) this.index += 1;
    const { clipMs, rounds } = this.settings;
    const startAt = Date.now() + PRELOAD_MS;
    this.current = { ...prepared, startAt, guesses: new Map(), revealed: false };
    for (const id of this.owner.playerIds()) this.statsFor(id).lastDelta = 0;

    const msg: ServerMessage = {
      t: 'roundStart',
      roundId: prepared.roundId,
      index: this.index,
      total: rounds,
      options: prepared.question.options,
      audioPath: `${AUDIO_PATH}/${prepared.roundId}`,
      startAt,
      durationMs: clipMs,
    };
    this.currentStart = msg;
    this.owner.send(() => msg);
    this.sendLockedIn();

    this.after(startAt + clipMs + LATE_GUESS_GRACE_MS - Date.now(), () => this.reveal(prepared.roundId));
    if (!replay && this.index < rounds) this.next = this.prepare().catch(() => null);
  }

  private sendLockedIn(): void {
    const round = this.current;
    if (!round || round.revealed) return;
    const active = this.owner.activePlayerIds();
    const count = active.filter((id) => round.guesses.has(id)).length;
    const msg: ServerMessage = { t: 'lockedIn', roundId: round.roundId, count, total: active.length };
    this.owner.send(() => msg);
  }

  private revealIfEveryoneAnswered(): void {
    if (this.paused) return;
    const round = this.current;
    if (!round || round.revealed) return;
    const active = this.owner.activePlayerIds();
    if (active.length > 0 && active.every((id) => round.guesses.has(id))) this.reveal(round.roundId);
  }

  /** Reveals the given round. Ignores stale calls, e.g. a time-up timer from a round that was already answered. */
  private reveal(roundId: string): void {
    const round = this.current;
    if (!round || round.revealed || round.roundId !== roundId) return;
    round.revealed = true;

    const { clipMs } = this.settings;
    const results = new Map<string, YourResult>();
    const picks = Object.fromEntries(LETTERS.map((l) => [l, [] as string[]])) as Record<Letter, string[]>;
    let anyCorrect = false;

    for (const id of this.owner.playerIds()) {
      const s = this.statsFor(id);
      const guess = round.guesses.get(id) ?? null;
      const correct = guess?.choice === round.question.correct;
      const r = scoreAnswer({ correct, elapsedMs: guess?.elapsedMs ?? null, clipMs, streakBefore: s.streak });

      s.score += r.points;
      s.lastDelta = r.points;
      s.streak = r.streak;
      s.bestStreak = Math.max(s.bestStreak, s.streak);
      if (correct && guess) {
        anyCorrect = true;
        s.correctCount += 1;
        s.totalCorrectMs += guess.elapsedMs;
        if (s.fastestMs === null || guess.elapsedMs < s.fastestMs) s.fastestMs = guess.elapsedMs;
      }
      if (guess) picks[guess.choice].push(this.owner.initialsOf(id));
      results.set(id, { choice: guess?.choice ?? null, elapsedMs: guess?.elapsedMs ?? null, ...r, score: s.score });
    }
    if (!anyCorrect && !this.nobodyGot) this.nobodyGot = { title: round.track.title, artist: round.track.artist };

    const board = this.board();
    const nextAt = Date.now() + REVEAL_MS;
    this.owner.send((id) => ({
      t: 'reveal',
      roundId: round.roundId,
      correct: round.question.correct,
      track: round.track,
      picks,
      board,
      you: id === null ? null : (results.get(id) ?? null),
      nextAt,
    }));

    this.after(REVEAL_MS, () => void this.advance());
  }

  private board(): BoardEntry[] {
    const entries = this.owner.playerIds().map((id) => ({ id, s: this.statsFor(id) }));
    entries.sort((a, b) => b.s.score - a.s.score || a.s.totalCorrectMs - b.s.totalCorrectMs);
    return entries.map(({ id, s }, i) => ({
      id,
      initials: this.owner.initialsOf(id),
      score: s.score,
      delta: s.lastDelta,
      streak: s.streak,
      rank: i + 1,
    }));
  }

  private awards(): Awards {
    let bestStreak: Awards['bestStreak'] = null;
    let fastest: Awards['fastest'] = null;
    let mostCorrect: Awards['mostCorrect'] = null;
    for (const id of this.owner.playerIds()) {
      const s = this.statsFor(id);
      const initials = this.owner.initialsOf(id);
      if (s.bestStreak > 0 && (!bestStreak || s.bestStreak > bestStreak.value)) bestStreak = { initials, value: s.bestStreak };
      if (s.fastestMs !== null && (!fastest || s.fastestMs < fastest.ms)) fastest = { initials, ms: s.fastestMs };
      if (s.correctCount > 0 && (!mostCorrect || s.correctCount > mostCorrect.count)) mostCorrect = { initials, count: s.correctCount };
    }
    return { bestStreak, fastest, mostCorrect, nobodyGot: this.nobodyGot };
  }

  private async advance(): Promise<void> {
    if (this.index >= this.settings.rounds) {
      const board = this.board();
      const awards = this.awards();
      this.owner.send((id) => {
        if (id === null) return { t: 'gameOver', board, awards, you: null };
        const s = this.statsFor(id);
        const rank = board.find((b) => b.id === id)?.rank ?? board.length;
        return {
          t: 'gameOver',
          board,
          awards,
          you: { score: s.score, correctCount: s.correctCount, total: this.settings.rounds, bestStreak: s.bestStreak, fastestMs: s.fastestMs, rank },
        };
      });
      this.current = null;
      this.owner.onFinished();
      return;
    }
    await this.startNext({ replace: false });
  }

  private async startNext({ replace }: { replace: boolean }): Promise<void> {
    if (this.advancing) return;
    this.advancing = true;
    try {
      // The song prepared during the last round, or (after a skip on the last round) a fresh one.
      const pending = this.next ?? this.prepare().catch(() => null);
      this.next = null;
      const prepared = await pending;
      if (this.disposed) return;
      if (!prepared) {
        this.owner.onFailed('Could not load the next song. Try again in a moment.');
        return;
      }
      this.startRound(prepared, { replace });
    } finally {
      this.advancing = false;
    }
  }

  private after(ms: number, fn: () => void): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      if (!this.disposed) fn();
    }, Math.max(0, ms));
    this.timers.add(timer);
  }
}

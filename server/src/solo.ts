import {
  AUDIO_PATH,
  CLIP_MS,
  LATE_GUESS_GRACE_MS,
  MAX_CLAIMED_LAG_MS,
  PRELOAD_MS,
  REVEAL_MS,
  ROUNDS_PER_GAME,
  scoreAnswer,
  type ClientMessage,
  type Letter,
  type MixId,
  type RevealedTrack,
  type ServerMessage,
} from '@replay/shared';
import { newClipId, storeClip } from './audio';
import { downloadPreview, trackDetail } from './music/deezer';
import { loadMix } from './music/mixes';
import { buildQuestion, type PoolTrack, type Question } from './music/question';

interface PreparedRound {
  roundId: string;
  question: Question;
  track: RevealedTrack;
}

interface LiveRound extends PreparedRound {
  startAt: number;
  guess: { choice: Letter; elapsedMs: number } | null;
  revealed: boolean;
}

const MAX_PREPARE_ATTEMPTS = 5;

/** One player, one game, server-timed. The same round flow will power rooms in M3. */
export class SoloGame {
  private pool: PoolTrack[] = [];
  private readonly used = new Set<number>();
  private readonly timers = new Set<NodeJS.Timeout>();
  private next: Promise<PreparedRound | null> | null = null;
  private current: LiveRound | null = null;
  private disposed = false;

  private index = 0;
  private score = 0;
  private streak = 0;
  private bestStreak = 0;
  private correctCount = 0;
  private fastestMs: number | null = null;

  constructor(
    private readonly mix: MixId,
    private readonly send: (msg: ServerMessage) => void,
  ) {}

  async start(): Promise<void> {
    this.send({ t: 'solo:preparing', mix: this.mix });
    try {
      this.pool = await loadMix(this.mix);
      const first = await this.prepare();
      if (this.disposed) return;
      if (!first) throw new Error('No playable tracks');
      this.startRound(first);
    } catch (err) {
      console.error('[solo] could not start', err);
      this.fail();
    }
  }

  guess(msg: Extract<ClientMessage, { t: 'guess' }>): void {
    const round = this.current;
    if (!round || round.revealed || round.guess || msg.roundId !== round.roundId) return;

    const serverElapsed = Date.now() - round.startAt;
    if (serverElapsed < -LATE_GUESS_GRACE_MS || serverElapsed > CLIP_MS + LATE_GUESS_GRACE_MS) return;

    // Trust the device's own timing (it knows when the clip actually started playing),
    // but never more than MAX_CLAIMED_LAG_MS faster than the server saw.
    const claimed = Math.min(Math.max(msg.elapsedMs, 0), CLIP_MS);
    const elapsedMs = Math.min(Math.max(claimed, serverElapsed - MAX_CLAIMED_LAG_MS), CLIP_MS);

    round.guess = { choice: msg.choice, elapsedMs };
    this.send({ t: 'guessAck', roundId: round.roundId, choice: msg.choice });
    this.reveal(round.roundId); // Solo: everyone has answered.
  }

  dispose(): void {
    this.disposed = true;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
  }

  private async prepare(): Promise<PreparedRound | null> {
    for (let attempt = 0; attempt < MAX_PREPARE_ATTEMPTS; attempt++) {
      const question = buildQuestion(this.pool, this.used);
      if (!question) return null;
      this.used.add(question.answer.id);
      try {
        const detail = await trackDetail(question.answer.id);
        if (!detail.preview) continue;
        const audio = await downloadPreview(detail.preview);
        const roundId = newClipId();
        storeClip(roundId, audio);
        // Deezer's release_date is the year of the album version (often a remaster or compilation),
        // not the original release, so it would show wrong years. Left out until there's a reliable source.
        return { roundId, question, track: { title: question.answer.title, artist: question.answer.artist, year: null } };
      } catch (err) {
        console.warn('[solo] skipping track', question.answer.id, err instanceof Error ? err.message : err);
      }
    }
    return null;
  }

  private startRound(prepared: PreparedRound): void {
    this.index += 1;
    const startAt = Date.now() + PRELOAD_MS;
    this.current = { ...prepared, startAt, guess: null, revealed: false };

    this.send({
      t: 'roundStart',
      roundId: prepared.roundId,
      index: this.index,
      total: ROUNDS_PER_GAME,
      options: prepared.question.options,
      audioPath: `${AUDIO_PATH}/${prepared.roundId}`,
      startAt,
      durationMs: CLIP_MS,
    });

    this.after(startAt + CLIP_MS + LATE_GUESS_GRACE_MS - Date.now(), () => this.reveal(prepared.roundId));
    if (this.index < ROUNDS_PER_GAME) this.next = this.prepare().catch(() => null);
  }

  /** Reveals the given round. Ignores stale calls, e.g. a time-up timer from a round that was already answered. */
  private reveal(roundId: string): void {
    const round = this.current;
    if (!round || round.revealed || round.roundId !== roundId) return;
    round.revealed = true;

    const choice = round.guess?.choice ?? null;
    const elapsedMs = round.guess?.elapsedMs ?? null;
    const correct = choice === round.question.correct;
    const result = scoreAnswer({ correct, elapsedMs, clipMs: CLIP_MS, streakBefore: this.streak });

    this.score += result.points;
    this.streak = result.streak;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    if (correct) {
      this.correctCount += 1;
      if (elapsedMs !== null && (this.fastestMs === null || elapsedMs < this.fastestMs)) this.fastestMs = elapsedMs;
    }

    const nextAt = Date.now() + REVEAL_MS;
    this.send({
      t: 'reveal',
      roundId: round.roundId,
      correct: round.question.correct,
      track: round.track,
      you: { choice, elapsedMs, ...result, score: this.score },
      nextAt,
    });

    this.after(REVEAL_MS, () => void this.advance());
  }

  private async advance(): Promise<void> {
    if (this.index >= ROUNDS_PER_GAME) {
      this.send({
        t: 'gameOver',
        score: this.score,
        correctCount: this.correctCount,
        total: ROUNDS_PER_GAME,
        bestStreak: this.bestStreak,
        fastestMs: this.fastestMs,
      });
      this.current = null;
      return;
    }
    const prepared = await this.next;
    if (this.disposed) return;
    if (!prepared) {
      this.fail();
      return;
    }
    this.startRound(prepared);
  }

  private fail(): void {
    if (this.disposed) return;
    this.send({ t: 'error', code: 'music_unavailable', message: 'Could not load songs right now. Try again in a moment.' });
  }

  private after(ms: number, fn: () => void): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      if (!this.disposed) fn();
    }, Math.max(0, ms));
    this.timers.add(timer);
  }
}

// Scoring rules from PLAN.md §6.

export const BASE_POINTS = 1000;
export const MAX_SPEED_BONUS = 500;
export const STREAK_STEP = 50;
export const MAX_STREAK_BONUS = 250;

export interface ScoreInput {
  correct: boolean;
  /** Time from the clip starting to the answer, in ms. Null when no answer was given. */
  elapsedMs: number | null;
  clipMs: number;
  /** Consecutive correct answers before this one. */
  streakBefore: number;
}

export interface ScoreResult {
  points: number;
  base: number;
  speed: number;
  streakBonus: number;
  /** Streak after this answer (resets to 0 on a miss). */
  streak: number;
}

const round10 = (n: number): number => Math.round(n / 10) * 10;

export function scoreAnswer({ correct, elapsedMs, clipMs, streakBefore }: ScoreInput): ScoreResult {
  if (!correct || elapsedMs === null) {
    return { points: 0, base: 0, speed: 0, streakBonus: 0, streak: 0 };
  }
  const t = Math.min(Math.max(elapsedMs, 0), clipMs);
  const speed = round10(MAX_SPEED_BONUS * (1 - t / clipMs));
  const streak = streakBefore + 1;
  const streakBonus = Math.min(STREAK_STEP * streak, MAX_STREAK_BONUS);
  return { points: BASE_POINTS + speed + streakBonus, base: BASE_POINTS, speed, streakBonus, streak };
}

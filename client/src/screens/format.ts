export const pad2 = (n: number): string => String(n).padStart(2, '0');

/** The timer blinks for the last few seconds of a clip. */
export const isUrgent = (secondsLeft: number): boolean => secondsLeft > 0 && secondsLeft <= 5;

/** Number of lit timer segments (out of `total`) for the time remaining. */
export function timerSegments(secondsLeft: number, clipSeconds: number, total = 20): number {
  if (clipSeconds <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, secondsLeft / clipSeconds));
  return Math.round(ratio * total);
}

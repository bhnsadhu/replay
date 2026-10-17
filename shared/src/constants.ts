// Game timings and settings (PLAN.md §1, §6, §7).

export const ROUNDS_PER_GAME = 10;
export const CLIP_SECONDS = 15;
export const CLIP_MS = CLIP_SECONDS * 1000;
export const REVEAL_MS = 5000;
/** Time between announcing a round and the clip starting, so devices can load the audio. */
export const PRELOAD_MS = 1500;
/** Grace period after the clip ends before guesses stop counting. */
export const LATE_GUESS_GRACE_MS = 500;
/** A device may claim to be at most this much faster than the server saw. Caps cheating. */
export const MAX_CLAIMED_LAG_MS = 2000;

export const MIXES = [
  { id: 'throwbacks', label: 'THROWBACKS' },
  { id: '80s', label: '80s' },
  { id: '90s', label: '90s' },
  { id: '2000s', label: '2000s' },
  { id: 'today', label: 'TODAY' },
] as const;

export type MixId = (typeof MIXES)[number]['id'];

export function isMixId(value: unknown): value is MixId {
  return MIXES.some((mix) => mix.id === value);
}

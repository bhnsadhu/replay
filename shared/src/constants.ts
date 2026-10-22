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
/** How long the REPLAY? vote runs after a game (PLAN.md §5). */
export const VOTE_MS = 10_000;

export const MIXES = [
  { id: 'throwbacks', label: 'THROWBACKS', blurb: 'Hits from the 80s, 90s and 2000s' },
  { id: '80s', label: '80s', blurb: 'Hits from 1980 to 1989' },
  { id: '90s', label: '90s', blurb: 'Hits from 1990 to 1999' },
  { id: '2000s', label: '2000s', blurb: 'Hits from 2000 to 2009' },
  { id: 'today', label: 'TODAY', blurb: 'On the charts right now' },
] as const;

export type MixId = (typeof MIXES)[number]['id'];

export function isMixId(value: unknown): value is MixId {
  return MIXES.some((mix) => mix.id === value);
}

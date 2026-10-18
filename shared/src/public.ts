// The public room: always on, anyone can drop in, nonstop sets of 10 rounds (PLAN.md §5).
import type { MixId } from './constants';

export const PUBLIC_MAX_PLAYERS = 200;
/** Results stay up this long between sets. */
export const PUBLIC_INTERMISSION_MS = 12_000;
/** Pause before the first set when someone joins an empty public room. */
export const PUBLIC_FIRST_SET_DELAY_MS = 3000;
/** Mixes rotate set by set. */
export const PUBLIC_MIX_ORDER: MixId[] = ['throwbacks', 'today', '80s', '90s', '2000s'];
/** Players shown on the public board (plus your own row if you're outside it). */
export const PUBLIC_BOARD_SIZE = 10;

export type PublicPhase = 'waiting' | 'playing' | 'intermission';

export interface PublicView {
  online: number;
  phase: PublicPhase;
  /** Server time of the next set start (waiting/intermission), else null. */
  nextAt: number | null;
  /** Set number since the server started, for display. */
  set: number;
  mix: MixId;
}

export interface BestScore {
  initials: string;
  score: number;
}

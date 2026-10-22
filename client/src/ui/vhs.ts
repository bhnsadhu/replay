// VHS status labels, one per stage of the game (PLAN.md §4, rule 2).
// ❚❚ PAUSE only ever means the game is actually paused; reveals fast-forward to the next song.
export type VhsStatus = 'play' | 'stop' | 'pause' | 'ff' | 'rew';

const GLYPHS: Record<VhsStatus, string> = {
  play: '▶',
  stop: '■',
  pause: '❚❚',
  ff: '▶▶',
  rew: '◀◀',
};

const WORDS: Record<VhsStatus, string> = {
  play: 'PLAY',
  stop: 'STOP',
  pause: 'PAUSE',
  ff: 'FF',
  rew: 'REW',
};

export const vhsGlyph = (status: VhsStatus): string => GLYPHS[status];
export const vhsWord = (status: VhsStatus): string => WORDS[status];

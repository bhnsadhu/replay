import { describe, expect, it } from 'vitest';
import type { BoardEntry } from '@replay/shared';
import { boardFor } from './public';

const board: BoardEntry[] = Array.from({ length: 30 }, (_, i) => ({
  id: `p${i + 1}`,
  initials: `P${String(i + 1).padStart(2, '0')}`.slice(0, 3),
  score: 3000 - i * 100,
  delta: 0,
  streak: 0,
  rank: i + 1,
}));

describe('boardFor', () => {
  it('sends the top 10 to someone in the top 10', () => {
    const mine = boardFor(board, 'p3');
    expect(mine).toHaveLength(10);
    expect(mine.map((b) => b.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('adds your own row when you are outside the top 10', () => {
    const mine = boardFor(board, 'p23');
    expect(mine).toHaveLength(11);
    expect(mine[10]).toMatchObject({ id: 'p23', rank: 23 });
  });

  it('copes with small boards and unknown players', () => {
    expect(boardFor(board.slice(0, 3), 'p2')).toHaveLength(3);
    expect(boardFor(board, 'nobody')).toHaveLength(10);
  });
});

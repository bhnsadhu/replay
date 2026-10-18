import { describe, expect, it } from 'vitest';
import { spoken } from './announce';

const track = { title: 'Clocks', artist: 'Coldplay', year: null };
const result = { elapsedMs: 900, base: 1000, speed: 300, streakBonus: 0, streak: 1, score: 1300 };

describe('spoken', () => {
  it('reads the options at the start of a round', () => {
    const text = spoken({
      t: 'roundStart',
      roundId: 'r',
      index: 2,
      total: 10,
      options: [
        { letter: 'A', title: 'Clocks', artist: 'Coldplay' },
        { letter: 'B', title: 'Beat It', artist: 'Michael Jackson' },
      ],
      audioPath: '/audio/x',
      startAt: 0,
      durationMs: 15000,
    });
    expect(text).toBe('Round 2 of 10. A: Clocks by Coldplay. B: Beat It by Michael Jackson.');
  });

  it("reads your verdict, or just the answer on the TV", () => {
    const base = { t: 'reveal' as const, roundId: 'r', correct: 'C' as const, track, picks: { A: [], B: [], C: [], D: [] }, board: [], nextAt: null };
    expect(spoken({ ...base, you: { ...result, choice: 'C', points: 1300 } })).toBe('Correct! It was C: Clocks by Coldplay. Plus 1300. Score 1300.');
    expect(spoken({ ...base, you: { ...result, choice: null, points: 0 } })).toMatch(/^Time's up\./);
    expect(spoken({ ...base, you: null })).toBe('It was C: Clocks by Coldplay.');
  });

  it('stays quiet for everything else', () => {
    expect(spoken({ t: 'lockedIn', roundId: 'r', count: 1, total: 2 })).toBeNull();
  });
});

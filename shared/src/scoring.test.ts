import { describe, expect, it } from 'vitest';
import { scoreAnswer } from './scoring';

const CLIP = 15_000;

describe('scoreAnswer', () => {
  it('matches the PLAN.md example: 7.2s of 15s on a streak of 4 = +1460', () => {
    expect(scoreAnswer({ correct: true, elapsedMs: 7200, clipMs: CLIP, streakBefore: 3 })).toEqual({
      points: 1460,
      base: 1000,
      speed: 260,
      streakBonus: 200,
      streak: 4,
    });
  });

  it('gives the full speed bonus for an instant answer', () => {
    expect(scoreAnswer({ correct: true, elapsedMs: 0, clipMs: CLIP, streakBefore: 0 }).speed).toBe(500);
  });

  it('gives no speed bonus at the buzzer and clamps late or negative times', () => {
    expect(scoreAnswer({ correct: true, elapsedMs: CLIP, clipMs: CLIP, streakBefore: 0 }).speed).toBe(0);
    expect(scoreAnswer({ correct: true, elapsedMs: CLIP + 900, clipMs: CLIP, streakBefore: 0 }).speed).toBe(0);
    expect(scoreAnswer({ correct: true, elapsedMs: -50, clipMs: CLIP, streakBefore: 0 }).speed).toBe(500);
  });

  it('caps the streak bonus at 250', () => {
    const result = scoreAnswer({ correct: true, elapsedMs: CLIP, clipMs: CLIP, streakBefore: 9 });
    expect(result.streak).toBe(10);
    expect(result.streakBonus).toBe(250);
  });

  it('scores zero and resets the streak on a miss or no answer', () => {
    const zero = { points: 0, base: 0, speed: 0, streakBonus: 0, streak: 0 };
    expect(scoreAnswer({ correct: false, elapsedMs: 1000, clipMs: CLIP, streakBefore: 5 })).toEqual(zero);
    expect(scoreAnswer({ correct: false, elapsedMs: null, clipMs: CLIP, streakBefore: 5 })).toEqual(zero);
  });

  it('keeps a perfect 10-round game at the 17,500 maximum', () => {
    let streak = 0;
    let total = 0;
    for (let i = 0; i < 10; i++) {
      const r = scoreAnswer({ correct: true, elapsedMs: 0, clipMs: CLIP, streakBefore: streak });
      streak = r.streak;
      total += r.points;
    }
    expect(total).toBeLessThanOrEqual(17_500);
  });
});

import { describe, expect, it } from 'vitest';
import { pad2, timerSegments } from './format';

describe('pad2', () => {
  it('pads single digits', () => {
    expect(pad2(4)).toBe('04');
    expect(pad2(10)).toBe('10');
  });
});

describe('timerSegments', () => {
  it('lights all segments at the start and none at the end', () => {
    expect(timerSegments(15, 15)).toBe(20);
    expect(timerSegments(0, 15)).toBe(0);
  });

  it('scales in between', () => {
    expect(timerSegments(12, 15)).toBe(16);
  });

  it('clamps out-of-range values', () => {
    expect(timerSegments(20, 15)).toBe(20);
    expect(timerSegments(-3, 15)).toBe(0);
    expect(timerSegments(5, 0)).toBe(0);
  });
});

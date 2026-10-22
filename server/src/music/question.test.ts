import { describe, expect, it } from 'vitest';
import { buildQuestion, closeness, toPool, type PoolTrack } from './question';
import type { DeezerTrack } from './deezer';

/** Deterministic pseudo-random numbers so tests are repeatable. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const pool: PoolTrack[] = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1,
  title: `Song ${i + 1}`,
  artist: `Artist ${(i % 6) + 1}`,
  artistId: (i % 6) + 1,
  year: null,
  genre: null,
}));

describe('buildQuestion', () => {
  it('returns 4 options with distinct artists and titles, including the answer', () => {
    const q = buildQuestion(pool, new Set(), seeded(1));
    expect(q).not.toBeNull();
    const { options, correct, answer } = q!;
    expect(options.map((o) => o.letter)).toEqual(['A', 'B', 'C', 'D']);
    expect(new Set(options.map((o) => o.artist)).size).toBe(4);
    expect(new Set(options.map((o) => o.title)).size).toBe(4);
    const right = options.find((o) => o.letter === correct)!;
    expect(right.title).toBe(answer.title);
    expect(right.artist).toBe(answer.artist);
  });

  it('never repeats a used track as the answer', () => {
    const used = new Set<number>();
    for (let i = 0; i < pool.length; i++) {
      const q = buildQuestion(pool, used, seeded(i + 7));
      expect(q).not.toBeNull();
      expect(used.has(q!.answer.id)).toBe(false);
      used.add(q!.answer.id);
    }
    expect(buildQuestion(pool, used, seeded(99))).toBeNull();
  });

  it('avoids past answers as wrong options when there are enough fresh songs', () => {
    const used = new Set([1, 2, 3]);
    for (let seed = 0; seed < 50; seed++) {
      const q = buildQuestion(pool, used, seeded(seed))!;
      const ids = q.options.map((o) => pool.find((t) => t.title === o.title)!.id);
      expect(ids.some((id) => used.has(id))).toBe(false);
    }
  });

  it('spreads the correct letter across A–D', () => {
    const rng = seeded(42);
    const counts = { A: 0, B: 0, C: 0, D: 0 };
    for (let i = 0; i < 400; i++) counts[buildQuestion(pool, new Set(), rng)!.correct]++;
    for (const n of Object.values(counts)) expect(n).toBeGreaterThan(60);
  });

  it('returns null when there are not enough different artists', () => {
    const tiny = [1, 2, 3, 4].map((id) => ({ id, title: `T${id}`, artist: id < 3 ? 'Same' : 'Other', artistId: id < 3 ? 1 : 2, year: null, genre: null }));
    expect(buildQuestion(tiny, new Set(), seeded(3))).toBeNull();
  });
});

describe('similar wrong options', () => {
  // Two scenes of 4 artists each: related within a scene, a few years apart; the scenes are 20 years apart.
  const song = (id: number, artistId: number, year: number, genre: string | null = null): PoolTrack => ({
    id,
    title: `Song ${id}`,
    artist: `Artist ${artistId}`,
    artistId,
    year,
    genre,
  });
  const scene = (artistId: number) => (artistId <= 4 ? 'eighties' : 'noughties');
  const related = (a: number, b: number) => a !== b && scene(a) === scene(b);
  const scenes: PoolTrack[] = [
    ...[1, 2, 3, 4].map((a) => song(a, a, 1983 + a)),
    ...[5, 6, 7, 8].map((a) => song(a, a, 2000 + a)),
    ...[1, 2, 3, 4].map((a) => song(a + 10, a, 1984)),
    ...[5, 6, 7, 8].map((a) => song(a + 10, a, 2006)),
  ];

  it('scores a related artist above a nearby year, and both above neither', () => {
    const answer = song(1, 1, 1985);
    expect(closeness(answer, song(2, 2, 2010), related)).toBe(3);
    expect(closeness(answer, song(5, 5, 1986), related)).toBe(2);
    expect(closeness(answer, song(6, 6, 1989), related)).toBe(1);
    expect(closeness(answer, song(7, 7, 2010), related)).toBe(0);
    expect(closeness(answer, song(2, 2, 1984), related)).toBe(5);
  });

  it('counts the same genre when both songs have one', () => {
    const answer = song(1, 1, 2026, 'Country');
    expect(closeness(answer, song(5, 5, 2010, 'Country'), related)).toBe(2);
    expect(closeness(answer, song(6, 6, 2010, 'Pop'), related)).toBe(0);
    expect(closeness(song(1, 1, 2026), song(7, 7, 2010), related)).toBe(0);
  });

  it('takes wrong options from the answer’s own scene', () => {
    for (let seed = 0; seed < 100; seed++) {
      const q = buildQuestion(scenes, new Set(), seeded(seed), related)!;
      const ids = q.options.map((o) => scenes.find((t) => t.title === o.title)!.artistId);
      expect(new Set(ids.map(scene))).toEqual(new Set([scene(q.answer.artistId)]));
    }
  });

  it('still varies which similar songs appear', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 100; seed++) {
      const q = buildQuestion(scenes, new Set(), seeded(seed), related)!;
      if (q.answer.id === 1) seen.add(q.options.map((o) => o.title).sort().join());
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('toPool', () => {
  const track = (id: number, extra: Partial<DeezerTrack> = {}): DeezerTrack => ({
    id,
    title_short: `Song ${id}`,
    preview: 'https://example/p.mp3',
    readable: true,
    explicit_lyrics: false,
    artist: { id, name: `Artist ${id}` },
    ...extra,
  });

  it('drops tracks without a preview, unreadable tracks and duplicates, and keeps explicit ones', () => {
    const result = toPool([
      track(1),
      track(2, { preview: '' }),
      track(3, { readable: false }),
      track(4, { explicit_lyrics: true }),
      track(5),
      track(6, { title_short: 'Song 5', artist: { id: 5, name: 'artist 5' } }),
      track(1),
    ]);
    expect(result.map((t) => t.id)).toEqual([1, 4, 5]);
  });

  it('keeps chart tracks, which have no readable field', () => {
    const chartTrack = track(7);
    delete chartTrack.readable;
    expect(toPool([chartTrack]).map((t) => t.id)).toEqual([7]);
  });
});

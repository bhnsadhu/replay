import { LETTERS, type AnswerOption, type Letter } from '@replay/shared';
import type { DeezerTrack } from './deezer';
import { norm } from './names';

export interface PoolTrack {
  id: number;
  title: string;
  artist: string;
}

export interface Question {
  answer: PoolTrack;
  correct: Letter;
  options: AnswerOption[];
}

/** Keeps playable, clean tracks and drops duplicates (same id, or same title by the same artist). */
export function toPool(tracks: DeezerTrack[]): PoolTrack[] {
  const seen = new Set<string>();
  const pool: PoolTrack[] = [];
  for (const t of tracks) {
    // Chart tracks don't include `readable`, so only skip tracks explicitly marked unreadable.
    if (!t.preview || t.readable === false || t.explicit_lyrics) continue;
    const key = `${norm(t.artist.name)}|${norm(t.title_short)}`;
    if (seen.has(key) || seen.has(`id:${t.id}`)) continue;
    seen.add(key);
    seen.add(`id:${t.id}`);
    pool.push({ id: t.id, title: t.title_short, artist: t.artist.name });
  }
  return pool;
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * Picks an unused track as the answer plus 3 wrong options from the same pool.
 * All 4 options have different artists and different titles. Returns null if the pool is too small.
 */
export function buildQuestion(pool: PoolTrack[], usedIds: ReadonlySet<number>, rng: () => number = Math.random): Question | null {
  const candidates = shuffle(pool.filter((t) => !usedIds.has(t.id)), rng);

  for (const answer of candidates) {
    const artists = new Set([norm(answer.artist)]);
    const titles = new Set([norm(answer.title)]);
    const wrong: PoolTrack[] = [];
    // Prefer songs not used yet, so a past answer doesn't reappear as an obvious wrong option.
    const shuffled = shuffle(pool, rng);
    const byPreference = [...shuffled.filter((t) => !usedIds.has(t.id)), ...shuffled.filter((t) => usedIds.has(t.id))];
    for (const t of byPreference) {
      if (wrong.length === 3) break;
      if (artists.has(norm(t.artist)) || titles.has(norm(t.title))) continue;
      artists.add(norm(t.artist));
      titles.add(norm(t.title));
      wrong.push(t);
    }
    if (wrong.length < 3) continue;

    const ordered = shuffle([answer, ...wrong], rng);
    const options = ordered.map((t, i) => ({ letter: LETTERS[i]!, title: t.title, artist: t.artist }));
    const correct = LETTERS[ordered.indexOf(answer)]!;
    return { answer, correct, options };
  }
  return null;
}

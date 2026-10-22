import { LETTERS, type AnswerOption, type Letter } from '@replay/shared';
import type { DeezerTrack } from './deezer';
import { norm } from './names';

export interface PoolTrack {
  id: number;
  title: string;
  artist: string;
  artistId: number;
  /** Original release year, when known. */
  year: number | null;
  /** Main genre, when the source knows it (TODAY only: Deezer's are too broad). */
  genre: string | null;
}

/** A Deezer track, plus its release year and genre when the source knows them. */
export type SourceTrack = DeezerTrack & { year?: number | null; genre?: string | null };

/** How a wrong option is judged against the answer. */
export type ArtistsRelated = (a: number, b: number) => boolean;

export interface Question {
  answer: PoolTrack;
  correct: Letter;
  options: AnswerOption[];
}

/** Keeps playable tracks and drops duplicates (same id, or same title by the same artist). */
export function toPool(tracks: SourceTrack[]): PoolTrack[] {
  const seen = new Set<string>();
  const pool: PoolTrack[] = [];
  for (const t of tracks) {
    // Chart tracks don't include `readable`, so only skip tracks explicitly marked unreadable.
    if (!t.preview || t.readable === false) continue;
    const key = `${norm(t.artist.name)}|${norm(t.title_short)}`;
    if (seen.has(key) || seen.has(`id:${t.id}`)) continue;
    seen.add(key);
    seen.add(`id:${t.id}`);
    pool.push({ id: t.id, title: t.title_short, artist: t.artist.name, artistId: t.artist.id, year: t.year ?? null, genre: t.genre ?? null });
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

/** Random noise added to closeness, so equally close songs take turns and a slightly less close one sometimes wins. */
const JITTER = 1.5;

/** How much a song sounds like the answer: a related artist counts most, then the same genre or a nearby year. */
export function closeness(answer: PoolTrack, t: PoolTrack, related: ArtistsRelated): number {
  let score = related(answer.artistId, t.artistId) ? 3 : 0;
  if (answer.genre && answer.genre === t.genre) score += 2;
  if (answer.year != null && t.year != null) {
    const gap = Math.abs(answer.year - t.year);
    score += gap <= 2 ? 2 : gap <= 5 ? 1 : 0;
  }
  return score;
}

/**
 * Picks an unused track as the answer plus 3 wrong options from the same pool, favouring songs that sound like the
 * answer so it's hard to guess by elimination. All 4 options have different artists and different titles.
 * Returns null if the pool is too small.
 */
export function buildQuestion(
  pool: PoolTrack[],
  usedIds: ReadonlySet<number>,
  rng: () => number = Math.random,
  related: ArtistsRelated = () => false,
): Question | null {
  const candidates = shuffle(pool.filter((t) => !usedIds.has(t.id)), rng);

  for (const answer of candidates) {
    const artists = new Set([norm(answer.artist)]);
    const titles = new Set([norm(answer.title)]);
    const wrong: PoolTrack[] = [];
    // Past answers go last, so one doesn't reappear as an obvious wrong option.
    const ranked = pool
      .map((t) => ({ t, rank: closeness(answer, t, related) + rng() * JITTER - (usedIds.has(t.id) ? 100 : 0) }))
      .sort((a, b) => b.rank - a.rank);
    for (const { t } of ranked) {
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

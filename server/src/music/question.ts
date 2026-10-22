import { LETTERS, type AnswerOption, type Letter } from '@replay/shared';
import type { DeezerTrack } from './deezer';
import { baseTitle, norm } from './names';

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
  wrong: PoolTrack[];
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

export interface QuestionSources {
  rng?: () => number;
  related?: ArtistsRelated;
  /** An artist's other well-known songs: used as wrong options only, never as answers. */
  hitsBy?: (artistId: number) => readonly PoolTrack[];
  /** Songs already shown as wrong options this game: ranked lower so the same ones don't keep coming back. */
  shown?: ReadonlySet<number>;
}

/** Rank penalty for a song already shown as a wrong option this game. */
const SHOWN_PENALTY = 3;

/**
 * How the 3 wrong options group by artist, as in Mixtape: pairs and trios of the same artist make you know the song,
 * not just the voice. A group that always held the answer would give it away (and one that never did would rule it
 * out), so each answer-group layout is used only alongside its decoy-group twin, at the same odds.
 */
type Part = { same: number } | { group: number } | { singles: number };
const LAYOUTS = {
  allDifferent: { weight: 2, parts: [{ singles: 3 }] },
  answerPair: { weight: 2, parts: [{ same: 1 }, { singles: 2 }], twin: 'decoyPair' },
  decoyPair: { weight: 2, parts: [{ group: 2 }, { singles: 1 }], twin: 'answerPair' },
  twoPairs: { weight: 2, parts: [{ same: 1 }, { group: 2 }] },
  answerTrio: { weight: 1, parts: [{ same: 2 }, { singles: 1 }], twin: 'decoyTrio' },
  decoyTrio: { weight: 1, parts: [{ group: 3 }], twin: 'answerTrio' },
} satisfies Record<string, { weight: number; parts: Part[]; twin?: string }>;
type Layout = keyof typeof LAYOUTS;

const artistKey = (t: PoolTrack) => norm(t.artist);
const titleKey = (t: PoolTrack) => norm(baseTitle(t.title));

/** 3 wrong options in the given layout from songs ranked most to least alike, or null if the songs don't allow it. */
function wrongOptions(answer: PoolTrack, ranked: PoolTrack[], used: ReadonlySet<number>, layout: Layout): PoolTrack[] | null {
  const titles = new Set([titleKey(answer)]);
  const artists = new Set([artistKey(answer)]);
  const usable = (t: PoolTrack, picked: PoolTrack[]) =>
    !titles.has(titleKey(t)) && !picked.some((p) => titleKey(p) === titleKey(t));

  const pick = (part: Part): PoolTrack[] | null => {
    const picked: PoolTrack[] = [];
    if ('same' in part) {
      for (const t of ranked) {
        if (picked.length === part.same) break;
        if (artistKey(t) === artistKey(answer) && !used.has(t.id) && usable(t, picked)) picked.push(t);
      }
      return picked.length === part.same ? picked : null;
    }
    if ('group' in part) {
      // The most alike artist with enough different songs.
      const byArtist = new Map<string, PoolTrack[]>();
      for (const t of ranked) {
        // Groups never use past answers: a song already played is an obvious wrong option.
        if (artists.has(artistKey(t)) || used.has(t.id)) continue;
        const songs = byArtist.get(artistKey(t)) ?? [];
        if (!usable(t, songs)) continue;
        songs.push(t);
        byArtist.set(artistKey(t), songs);
        if (songs.length === part.group) return songs;
      }
      return null;
    }
    for (const t of ranked) {
      if (picked.length === part.singles) break;
      if (!artists.has(artistKey(t)) && usable(t, picked) && !picked.some((p) => artistKey(p) === artistKey(t))) {
        picked.push(t);
      }
    }
    return picked.length === part.singles ? picked : null;
  };

  const wrong: PoolTrack[] = [];
  for (const part of LAYOUTS[layout].parts) {
    const picked = pick(part);
    if (!picked) return null;
    for (const t of picked) {
      titles.add(titleKey(t));
      artists.add(artistKey(t));
    }
    wrong.push(...picked);
  }
  return wrong;
}

/** A random layout among those these songs allow, keeping answer groups and decoy groups equally likely. */
function chooseWrongOptions(
  answer: PoolTrack,
  ranked: PoolTrack[],
  used: ReadonlySet<number>,
  rng: () => number,
): PoolTrack[] | null {
  const built = new Map<Layout, PoolTrack[]>();
  for (const layout of Object.keys(LAYOUTS) as Layout[]) {
    const wrong = wrongOptions(answer, ranked, used, layout);
    if (wrong) built.set(layout, wrong);
  }
  const fair = [...built.keys()].filter((layout) => {
    const twin = (LAYOUTS[layout] as { twin?: Layout }).twin;
    return !twin || built.has(twin);
  });
  const total = fair.reduce((sum, layout) => sum + LAYOUTS[layout].weight, 0);
  let roll = rng() * total;
  for (const layout of fair) {
    if ((roll -= LAYOUTS[layout].weight) < 0) return built.get(layout)!;
  }
  return built.get('allDifferent') ?? null;
}

/**
 * Picks an unused track as the answer plus 3 wrong options, favouring songs that sound like the answer (similar
 * artists, the same artist's other hits) so it's hard to guess by elimination. Titles are all different; an artist may
 * appear up to 3 times. Returns null if the pool is too small.
 */
export function buildQuestion(
  pool: PoolTrack[],
  usedIds: ReadonlySet<number>,
  { rng = Math.random, related = () => false, hitsBy = () => [], shown = new Set() }: QuestionSources = {},
): Question | null {
  const candidates = shuffle(pool.filter((t) => !usedIds.has(t.id)), rng);
  // Every song that could be a wrong option: the mix itself plus its artists' other hits.
  const inPool = new Set(pool.map((t) => `${artistKey(t)}|${titleKey(t)}`));
  const extras = [...new Set(pool.map((t) => t.artistId))]
    .flatMap(hitsBy)
    .filter((t) => !inPool.has(`${artistKey(t)}|${titleKey(t)}`));
  const everything = [...pool, ...extras];

  for (const answer of candidates) {
    // Past answers go last, so one doesn't reappear as an obvious wrong option.
    const ranked = everything
      .filter((t) => t.id !== answer.id)
      .map((t) => ({
        t,
        rank: closeness(answer, t, related) + rng() * JITTER - (shown.has(t.id) ? SHOWN_PENALTY : 0) - (usedIds.has(t.id) ? 100 : 0),
      }))
      .sort((a, b) => b.rank - a.rank)
      .map(({ t }) => t);
    const wrong = chooseWrongOptions(answer, ranked, usedIds, rng);
    if (!wrong) continue;

    const ordered = shuffle([answer, ...wrong], rng);
    const options = ordered.map((t, i) => ({ letter: LETTERS[i]!, title: t.title, artist: t.artist }));
    const correct = LETTERS[ordered.indexOf(answer)]!;
    return { answer, wrong, correct, options };
  }
  return null;
}

// The TODAY mix: Apple Music's most-played charts pick the songs, Deezer supplies the clips.
// Deezer's own chart is skewed by its small US audience and mixes in decades-old catalog songs.
import { chartTracks, searchTracks, type DeezerTrack } from './deezer';
import type { SourceTrack } from './question';
import { baseTitle, norm, primaryArtist, songKey } from './names';

/** Storefronts to merge: US first, then UK for more pop variety. */
const COUNTRIES = ['us', 'gb'];
/** Only songs released this recently count as "today". */
const MAX_AGE_MS = 2 * 365 * 24 * 60 * 60 * 1000;
/** Keeps one superstar from filling the mix. */
const MAX_PER_ARTIST = 3;
/** Below this many matches, top up with Deezer's chart rather than run a thin mix. */
const MIN_TRACKS = 20;
const TIMEOUT_MS = 8000;

export interface ChartSong {
  artist: string;
  title: string;
  releaseDate: string;
  genre?: string | null;
}

async function appleChart(country: string): Promise<ChartSong[]> {
  const url = `https://rss.marketingtools.apple.com/api/v2/${country}/music/most-played/100/songs.json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Apple chart ${country} failed: HTTP ${res.status}`);
  const body = (await res.json()) as {
    feed: { results: { artistName: string; name: string; releaseDate: string; genres?: { name: string }[] }[] };
  };
  return body.feed.results.map((r) => ({
    artist: r.artistName,
    title: r.name,
    releaseDate: r.releaseDate,
    // "Music" is a catch-all Apple adds to every song.
    genre: r.genres?.find((g) => g.name !== 'Music')?.name ?? null,
  }));
}

/** Recent songs only, each once, at most a few per artist, in chart order. */
export function recentSongs(songs: ChartSong[], now: number): ChartSong[] {
  const seen = new Set<string>();
  const perArtist = new Map<string, number>();
  return songs.filter((s) => {
    const artist = norm(primaryArtist(s.artist));
    const key = songKey(artist, s.title);
    const count = perArtist.get(artist) ?? 0;
    if (seen.has(key) || count >= MAX_PER_ARTIST || !(now - Date.parse(s.releaseDate) <= MAX_AGE_MS)) return false;
    seen.add(key);
    perArtist.set(artist, count + 1);
    return true;
  });
}

/** The Deezer result that is this song: same lead artist and title, playable. Deezer ranks the original version first. */
export function pickMatch(song: ChartSong, results: DeezerTrack[]): DeezerTrack | null {
  const artist = norm(primaryArtist(song.artist));
  const title = norm(baseTitle(song.title));
  return (
    results.find(
      (t) =>
        t.preview &&
        t.readable !== false &&
        norm(primaryArtist(t.artist.name)) === artist &&
        norm(baseTitle(t.title_short)) === title,
    ) ?? null
  );
}

async function findOnDeezer(song: ChartSong): Promise<SourceTrack | null> {
  const artist = primaryArtist(song.artist);
  const title = baseTitle(song.title);
  try {
    const match =
      pickMatch(song, await searchTracks(`artist:"${artist}" track:"${title}"`)) ??
      pickMatch(song, await searchTracks(`${artist} ${title}`));
    return match && { ...match, year: Number(song.releaseDate.slice(0, 4)) || null, genre: song.genre ?? null };
  } catch {
    return null;
  }
}

export async function todayTracks(): Promise<SourceTrack[]> {
  const charts = await Promise.allSettled(COUNTRIES.map(appleChart));
  const songs = recentSongs(
    charts.flatMap((c) => (c.status === 'fulfilled' ? c.value : [])),
    Date.now(),
  );
  // Deezer searches run in its background lane, which paces them.
  const found = (await Promise.all(songs.map(findOnDeezer))).filter((t): t is SourceTrack => t !== null);
  if (found.length >= MIN_TRACKS) return found;
  console.warn(`[today] only ${found.length} chart songs matched on Deezer; adding Deezer's chart`);
  return [...found, ...(await chartTracks())];
}

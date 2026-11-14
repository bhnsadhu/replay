// The TODAY mix: Apple Music's most-played charts pick the songs, Deezer supplies the clips.
// Deezer's own chart is skewed by its small US audience and mixes in decades-old catalog songs.
import { searchTracks, type DeezerTrack } from './deezer';
import type { SourceTrack } from './question';
import { baseTitle, norm, primaryArtist, songKey } from './names';

/** Storefronts to merge: US first, then UK for more pop variety. */
const COUNTRIES = ['us', 'gb'];
/** Only songs released this recently count as "today". */
const MAX_AGE_MS = 2 * 365 * 24 * 60 * 60 * 1000;
/** Keeps one superstar from filling the mix. */
const MAX_PER_ARTIST = 3;
const TIMEOUT_MS = 8000;
const MAX_FEED_AGE_MS = 48 * 60 * 60 * 1000;
const ALT_VERSION = /\b(live|remix|mix|acoustic|instrumental|karaoke|demo|sped|slowed|version|session)\b/i;

export interface ChartSong {
  artist: string;
  title: string;
  releaseDate: string;
  genre?: string | null;
}

/** Reject broken or stale feeds instead of presenting them as today's chart. */
export function chartSongs(body: unknown, now: number): ChartSong[] {
  const feed = (body as { feed?: { updated?: unknown; results?: unknown } } | null)?.feed;
  const updated = typeof feed?.updated === 'string' ? Date.parse(feed.updated) : NaN;
  if (!Number.isFinite(updated) || now - updated > MAX_FEED_AGE_MS || updated - now > 5 * 60 * 1000) {
    throw new Error('Apple chart has no recent update date');
  }
  if (!Array.isArray(feed?.results)) throw new Error('Apple chart has no song list');
  return feed.results.flatMap((row: unknown): ChartSong[] => {
    if (!row || typeof row !== 'object') return [];
    const r = row as Record<string, unknown>;
    if (typeof r.artistName !== 'string' || !r.artistName.trim() || typeof r.name !== 'string' || !r.name.trim() || typeof r.releaseDate !== 'string') return [];
    const genre = Array.isArray(r.genres)
      ? r.genres.find((g: unknown): g is { name: string } => !!g && typeof g === 'object' && 'name' in g && typeof g.name === 'string' && g.name !== 'Music')?.name
      : null;
    return [{ artist: r.artistName, title: r.name, releaseDate: r.releaseDate, genre: genre ?? null }];
  });
}

export async function appleChart(country: string): Promise<ChartSong[]> {
  const url = `https://rss.marketingtools.apple.com/api/v2/${country}/music/most-played/100/songs.json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Apple chart ${country} failed: HTTP ${res.status}`);
  return chartSongs(await res.json(), Date.now());
}

/** Recent songs only, each once, at most a few per artist, in chart order. */
export function recentSongs(songs: ChartSong[], now: number): ChartSong[] {
  const seen = new Set<string>();
  const perArtist = new Map<string, number>();
  return songs.filter((s) => {
    const artist = norm(primaryArtist(s.artist));
    const key = songKey(artist, s.title);
    const count = perArtist.get(artist) ?? 0;
    const age = now - Date.parse(s.releaseDate);
    if (!artist || !norm(baseTitle(s.title)) || seen.has(key) || count >= MAX_PER_ARTIST || !(age >= 0 && age <= MAX_AGE_MS)) return false;
    seen.add(key);
    perArtist.set(artist, count + 1);
    return true;
  });
}

/** Alternative recordings need the same full title; a studio hit must not resolve to a live take or remix. */
function sameRecording(song: ChartSong, track: DeezerTrack): boolean {
  const suppliedTitle = track.title ?? track.title_short;
  const version = track.title_version ?? '';
  const trackTitle = version && !norm(suppliedTitle).includes(norm(version)) ? `${suppliedTitle} ${version}` : suppliedTitle;
  const annotations = `${song.title.replace(baseTitle(song.title), '')} ${trackTitle.replace(baseTitle(trackTitle), '')} ${track.title_version ?? ''}`;
  return !ALT_VERSION.test(annotations) || norm(song.title) === norm(trackTitle);
}

/** The Deezer result that is this song: same lead artist, title and recording, playable. */
export function pickMatch(song: ChartSong, results: DeezerTrack[]): DeezerTrack | null {
  const artist = norm(primaryArtist(song.artist));
  const title = norm(baseTitle(song.title));
  return (
    results.find(
      (t) =>
        t.preview &&
        t.readable !== false &&
        norm(primaryArtist(t.artist.name)) === artist &&
        norm(baseTitle(t.title_short)) === title &&
        sameRecording(song, t),
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
  // The mix cache rejects thin results and retains the last good pool during an outage.
  // Never fill TODAY with Deezer's all-ages chart: those songs may be decades old.
  return found;
}

import { MIXES, type MixId } from '@replay/shared';
import { playlistTracks, type DeezerTrack } from './deezer';
import { toPool, type PoolTrack, type SourceTrack } from './question';
import { warmArtists } from './artists';
import { todayTracks } from './today';
import { songKey } from './names';
import { MixCache } from './cache';
import years from './years.json' with { type: 'json' };

type Era = [from: number, to: number];

// Deezer editorial playlists for each decade (PLAN.md §10). IDs found via Deezer's playlist search.
export const DECADES: Record<'80s' | '90s' | '2000s', { playlists: number[]; era: Era }> = {
  '80s': { playlists: [867825522, 1913763402], era: [1980, 1989] }, // "80s Hits", "80s Party Hits"
  '90s': { playlists: [878989033, 2322259622], era: [1990, 1999] }, // "90s Hits", "90s Party Hits"
  '2000s': { playlists: [248297032, 1977689462], era: [2000, 2009] }, // "00s Hits", "00s Party Hits"
};

/** Original release years from MusicBrainz, written by `npm run years -w server`. Null = not found. */
const YEARS: Record<string, number | null> = years;

const SOURCES: Record<MixId, { load: () => Promise<SourceTrack[]>; era?: Era }> = {
  // Keep all three decades represented, even if one playlist in a decade is unavailable.
  throwbacks: { load: async () => (await Promise.all(Object.values(DECADES).map((d) => fromPlaylists(d.playlists)))).flat(), era: [1980, 2009] },
  '80s': { load: () => fromPlaylists(DECADES['80s'].playlists), era: DECADES['80s'].era },
  '90s': { load: () => fromPlaylists(DECADES['90s'].playlists), era: DECADES['90s'].era },
  '2000s': { load: () => fromPlaylists(DECADES['2000s'].playlists), era: DECADES['2000s'].era },
  today: { load: todayTracks },
};

const playlistLoading = new Map<number, Promise<DeezerTrack[]>>();

/** Decade and throwback refreshes share requests for the same playlist. */
function sharedPlaylist(id: number): Promise<DeezerTrack[]> {
  const pending = playlistLoading.get(id);
  if (pending) return pending;
  const job = playlistTracks(id).finally(() => playlistLoading.delete(id));
  playlistLoading.set(id, job);
  return job;
}

export async function fromPlaylists(ids: number[], load = sharedPlaylist): Promise<DeezerTrack[]> {
  const lists = await Promise.allSettled(ids.map(load));
  const tracks = lists.flatMap((list) => list.status === 'fulfilled' ? list.value : []);
  if (tracks.length === 0) throw new Error('No songs returned by the decade playlists');
  return tracks;
}

/** Editors slip in songs from other decades; drop any whose original release year is known to be outside the era. */
export function inEra(track: Pick<PoolTrack, 'artist' | 'title'>, [from, to]: Era, yearOf: (key: string) => number | null | undefined): boolean {
  const year = yearOf(songKey(track.artist, track.title));
  return year == null || (year >= from && year <= to);
}

const cache = new MixCache(async (mix) => {
  const { load, era } = SOURCES[mix];
  const tracks = await load();
  const pool = toPool(tracks)
    .map((t) => ({ ...t, year: t.year ?? YEARS[songKey(t.artist, t.title)] ?? null }))
    .filter((t) => !era || inEra(t, era, (key) => YEARS[key]));
  return pool;
});

/** Refreshed hourly; a last good pool can cover an outage for up to 24 hours. */
export async function loadMix(mix: MixId): Promise<PoolTrack[]> {
  const pool = await cache.load(mix);
  warmArtists(pool.map((t) => t.artistId));
  return pool;
}

export const musicStatus = () => cache.status();

/** Loads every mix at boot, so the first game doesn't wait (TODAY takes ~20 s of Deezer searches). */
export function warmMixes(): void {
  for (const { id } of MIXES) {
    void loadMix(id).catch(() => {}); // Cache logs source failures and backs off before retrying.
  }
}

import { MIXES, type MixId } from '@replay/shared';
import { playlistTracks, type DeezerTrack } from './deezer';
import { toPool, type PoolTrack } from './question';
import { todayTracks } from './today';
import { songKey } from './names';
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

const SOURCES: Record<MixId, { load: () => Promise<DeezerTrack[]>; era?: Era }> = {
  throwbacks: { load: () => fromPlaylists(Object.values(DECADES).flatMap((d) => d.playlists)), era: [1980, 2009] },
  '80s': { load: () => fromPlaylists(DECADES['80s'].playlists), era: DECADES['80s'].era },
  '90s': { load: () => fromPlaylists(DECADES['90s'].playlists), era: DECADES['90s'].era },
  '2000s': { load: () => fromPlaylists(DECADES['2000s'].playlists), era: DECADES['2000s'].era },
  today: { load: todayTracks },
};

async function fromPlaylists(ids: number[]): Promise<DeezerTrack[]> {
  const lists = await Promise.all(ids.map(playlistTracks));
  return lists.flat();
}

/** Editors slip in songs from other decades; drop any whose original release year is known to be outside the era. */
export function inEra(track: PoolTrack, [from, to]: Era, yearOf: (key: string) => number | null | undefined): boolean {
  const year = yearOf(songKey(track.artist, track.title));
  return year == null || (year >= from && year <= to);
}

const CACHE_MS = 60 * 60 * 1000;
const cache = new Map<MixId, { pool: PoolTrack[]; loadedAt: number }>();
const loading = new Map<MixId, Promise<PoolTrack[]>>();

function refresh(mix: MixId): Promise<PoolTrack[]> {
  const inFlight = loading.get(mix);
  if (inFlight) return inFlight;
  const { load, era } = SOURCES[mix];
  const job = load()
    .then((tracks) => {
      const pool = toPool(tracks).filter((t) => !era || inEra(t, era, (key) => YEARS[key]));
      cache.set(mix, { pool, loadedAt: Date.now() });
      return pool;
    })
    .finally(() => loading.delete(mix));
  loading.set(mix, job);
  return job;
}

/** Playable, clean tracks for a mix. Refreshed hourly in the background; the last good pool is served meanwhile. */
export async function loadMix(mix: MixId): Promise<PoolTrack[]> {
  const hit = cache.get(mix);
  if (!hit) return refresh(mix);
  if (Date.now() - hit.loadedAt >= CACHE_MS) {
    refresh(mix).catch((err) => console.error(`[mixes] refresh ${mix} failed`, err));
  }
  return hit.pool;
}

/** Loads every mix at boot, so the first game doesn't wait (TODAY takes ~20 s of Deezer searches). */
export function warmMixes(): void {
  for (const { id } of MIXES) {
    refresh(id).catch((err) => console.error(`[mixes] warm ${id} failed`, err));
  }
}

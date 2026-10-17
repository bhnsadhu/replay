import type { MixId } from '@replay/shared';
import { chartTracks, playlistTracks, type DeezerTrack } from './deezer';
import { toPool, type PoolTrack } from './question';

// Deezer editorial playlists for each mix (PLAN.md §10). IDs found via Deezer's playlist search.
const PLAYLISTS = {
  hits80s: [867825522, 1913763402], // "80s Hits", "80s Party Hits"
  hits90s: [878989033, 2322259622], // "90s Hits", "90s Party Hits"
  hits00s: [248297032, 1977689462], // "00s Hits", "00s Party Hits"
};

const SOURCES: Record<MixId, () => Promise<DeezerTrack[]>> = {
  throwbacks: () => fromPlaylists([PLAYLISTS.hits80s[0]!, PLAYLISTS.hits90s[0]!, PLAYLISTS.hits00s[0]!]),
  '80s': () => fromPlaylists(PLAYLISTS.hits80s),
  '90s': () => fromPlaylists(PLAYLISTS.hits90s),
  '2000s': () => fromPlaylists(PLAYLISTS.hits00s),
  today: chartTracks,
};

async function fromPlaylists(ids: number[]): Promise<DeezerTrack[]> {
  const lists = await Promise.all(ids.map(playlistTracks));
  return lists.flat();
}

const CACHE_MS = 60 * 60 * 1000;
const cache = new Map<MixId, { pool: PoolTrack[]; loadedAt: number }>();

/** Playable, clean tracks for a mix. Cached for an hour. */
export async function loadMix(mix: MixId): Promise<PoolTrack[]> {
  const hit = cache.get(mix);
  if (hit && Date.now() - hit.loadedAt < CACHE_MS) return hit.pool;
  const pool = toPool(await SOURCES[mix]());
  cache.set(mix, { pool, loadedAt: Date.now() });
  return pool;
}

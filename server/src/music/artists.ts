// What Deezer knows about each artist in a mix, used to pick wrong options that sound like the answer:
// related artists, and the artist's other hits. Kept for the server's lifetime (both rarely change, and every
// deploy starts fresh).
import { artistTopTracks, relatedArtists, type DeezerTrack } from './deezer';
import { baseTitle, norm } from './names';
import type { PoolTrack } from './question';

/** How many of an artist's hits to keep as wrong options. */
const HITS_PER_ARTIST = 6;
/** Live takes, remixes and the like are the same song: not a fair wrong option. */
const ALT_VERSION = /\b(live|remix|mix|acoustic|instrumental|karaoke|demo|sped|slowed|version|session)\b/i;

const related = new Map<number, ReadonlySet<number>>();
const hits = new Map<number, readonly PoolTrack[]>();
const loading = new Set<number>();

/** An artist's best-known songs: their own tracks only, one per title, no alternate versions. */
export function toHits(artistId: number, tracks: DeezerTrack[]): PoolTrack[] {
  const seen = new Set<string>();
  const out: PoolTrack[] = [];
  for (const t of tracks) {
    if (out.length === HITS_PER_ARTIST) break;
    const title = norm(baseTitle(t.title_short));
    if (t.artist.id !== artistId || seen.has(title) || ALT_VERSION.test(`${t.title_short} ${t.title_version ?? ''}`)) continue;
    seen.add(title);
    out.push({ id: t.id, title: t.title_short, artist: t.artist.name, artistId, year: null, genre: null });
  }
  return out;
}

/** Fetches related artists and hits for any of these not known yet, in Deezer's idle lane. */
export function warmArtists(artistIds: Iterable<number>): void {
  for (const id of new Set(artistIds)) {
    if (related.has(id) || loading.has(id)) continue;
    loading.add(id);
    Promise.all([relatedArtists(id), artistTopTracks(id)])
      .then(([similar, top]) => {
        related.set(id, new Set(similar.map((a) => a.id)));
        hits.set(id, toHits(id, top));
      })
      .catch(() => {}) // Tried again on the mix's next refresh.
      .finally(() => loading.delete(id));
  }
}

/** True if Deezer lists either artist as related to the other. */
export function areRelated(a: number, b: number): boolean {
  return related.get(a)?.has(b) || related.get(b)?.has(a) || false;
}

/** The artist's best-known songs, once loaded. */
export function hitsBy(artistId: number): readonly PoolTrack[] {
  return hits.get(artistId) ?? [];
}

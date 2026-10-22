// Deezer's related artists, used to pick wrong options that sound like the answer.
// Kept for the server's lifetime: related artists rarely change, and every deploy starts fresh.
import { relatedArtists } from './deezer';

const related = new Map<number, ReadonlySet<number>>();
const loading = new Set<number>();

/** Fetches related artists for any of these not known yet, in Deezer's background lane. */
export function warmRelated(artistIds: Iterable<number>): void {
  for (const id of new Set(artistIds)) {
    if (related.has(id) || loading.has(id)) continue;
    loading.add(id);
    relatedArtists(id)
      .then((list) => related.set(id, new Set(list.map((a) => a.id))))
      .catch(() => {}) // Tried again on the mix's next refresh.
      .finally(() => loading.delete(id));
  }
}

/** True if Deezer lists either artist as related to the other. */
export function areRelated(a: number, b: number): boolean {
  return related.get(a)?.has(b) || related.get(b)?.has(a) || false;
}

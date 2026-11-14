import { MIXES, type MixId } from '@replay/shared';
import type { PoolTrack } from './question';

const REFRESH_MS = 60 * 60 * 1000;
const MAX_STALE_MS = 24 * REFRESH_MS;
const RETRY_MS = 5 * 60 * 1000;
/** Enough for the longest game (15 rounds), wrong options and a few failed clips. */
const MIN_TRACKS = 20;

interface Entry {
  pool: PoolTrack[];
  loadedAt: number;
}

/** A failed or thin refresh cannot replace a usable selection. All callers share each refresh. */
export class MixCache {
  private readonly entries = new Map<MixId, Entry>();
  private readonly loading = new Map<MixId, Promise<PoolTrack[]>>();
  private readonly retryAt = new Map<MixId, number>();

  constructor(
    private readonly fetchPool: (mix: MixId) => Promise<PoolTrack[]>,
    private readonly now: () => number = Date.now,
    private readonly onFailure: (mix: MixId, error: unknown) => void = (mix, error) => console.error(`[mixes] refresh ${mix} failed`, error),
  ) {}

  private refresh(mix: MixId): Promise<PoolTrack[]> {
    const pending = this.loading.get(mix);
    if (pending) return pending;
    if (this.now() < (this.retryAt.get(mix) ?? 0)) return Promise.reject(new Error(`Music source ${mix} is temporarily unavailable`));
    const job = Promise.resolve()
      .then(() => this.fetchPool(mix))
      .then((pool) => {
        if (pool.length < MIN_TRACKS) throw new Error(`Only ${pool.length} playable tracks for ${mix}; need ${MIN_TRACKS}`);
        this.entries.set(mix, { pool, loadedAt: this.now() });
        this.retryAt.delete(mix);
        return pool;
      })
      .catch((error: unknown) => {
        this.retryAt.set(mix, this.now() + RETRY_MS);
        this.onFailure(mix, error);
        throw error;
      })
      .finally(() => this.loading.delete(mix));
    this.loading.set(mix, job);
    return job;
  }

  async load(mix: MixId): Promise<PoolTrack[]> {
    const hit = this.entries.get(mix);
    const age = hit ? this.now() - hit.loadedAt : Infinity;
    if (!hit || age >= MAX_STALE_MS) return this.refresh(mix);
    if (age >= REFRESH_MS && this.now() >= (this.retryAt.get(mix) ?? 0)) {
      void this.refresh(mix).catch(() => {}); // Failure was logged; keep the usable cached pool.
    }
    return hit.pool;
  }

  status(): Record<MixId, { tracks: number; loadedAt: number | null; refreshing: boolean; ready: boolean }> {
    return Object.fromEntries(MIXES.map(({ id }) => {
      const hit = this.entries.get(id);
      return [id, {
        tracks: hit?.pool.length ?? 0,
        loadedAt: hit?.loadedAt ?? null,
        refreshing: this.loading.has(id),
        ready: !!hit && this.now() - hit.loadedAt < MAX_STALE_MS,
      }];
    })) as ReturnType<MixCache['status']>;
  }
}

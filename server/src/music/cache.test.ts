import { describe, expect, it, vi } from 'vitest';
import { MixCache } from './cache';
import type { PoolTrack } from './question';

const HOUR = 60 * 60 * 1000;
const pool: PoolTrack[] = Array.from({ length: 30 }, (_, id) => ({
  id, title: `Song ${id}`, artist: `Artist ${id}`, artistId: id, year: 2026, genre: 'Pop',
}));

describe('mix refreshes', () => {
  it('shares a cold load between simultaneous games', async () => {
    const fetchPool = vi.fn().mockResolvedValue(pool);
    const cache = new MixCache(fetchPool);
    const results = await Promise.all([cache.load('today'), cache.load('today'), cache.load('today')]);
    expect(fetchPool).toHaveBeenCalledTimes(1);
    expect(results).toEqual([pool, pool, pool]);
  });

  it.each([{ tracks: [] }, { tracks: pool.slice(0, 19) }])('keeps the last good mix when a refresh is too thin (%#)', async ({ tracks: thin }) => {
    let now = 1000;
    const fetchPool = vi.fn().mockResolvedValueOnce(pool).mockResolvedValue(thin);
    const onFailure = vi.fn();
    const cache = new MixCache(fetchPool, () => now, onFailure);
    await cache.load('today');
    now += HOUR;
    expect(await cache.load('today')).toBe(pool);
    await vi.waitFor(() => expect(cache.status().today.refreshing).toBe(false));
    expect(cache.status().today).toMatchObject({ tracks: 30, loadedAt: 1000, ready: true });
    for (let i = 0; i < 10; i++) expect(await cache.load('today')).toBe(pool);
    expect(fetchPool).toHaveBeenCalledTimes(2);
    expect(onFailure).toHaveBeenCalledTimes(1);
  });

  it('retries after the backoff and replaces the old selection on success', async () => {
    let now = 1000;
    const replacement = pool.slice(0, 25);
    const fetchPool = vi.fn().mockResolvedValueOnce(pool).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(replacement);
    const cache = new MixCache(fetchPool, () => now, vi.fn());
    await cache.load('today');
    now += HOUR;
    await cache.load('today');
    await vi.waitFor(() => expect(cache.status().today.refreshing).toBe(false));
    now += 5 * 60 * 1000;
    await cache.load('today');
    await vi.waitFor(() => expect(cache.status().today.tracks).toBe(25));
    expect(await cache.load('today')).toBe(replacement);
    expect(cache.status().today.loadedAt).toBe(now);
  });

  it('does not serve a day-old mix as current when the source is unavailable', async () => {
    let now = 1000;
    const fetchPool = vi.fn().mockResolvedValueOnce(pool).mockRejectedValue(new Error('offline'));
    const cache = new MixCache(fetchPool, () => now, vi.fn());
    await cache.load('today');
    now += 24 * HOUR;
    await expect(cache.load('today')).rejects.toThrow('offline');
    expect(cache.status().today.ready).toBe(false);
    await expect(cache.load('today')).rejects.toThrow('temporarily unavailable');
    expect(fetchPool).toHaveBeenCalledTimes(2);
  });

  it('backs off a failed first load without caching an empty mix', async () => {
    const fetchPool = vi.fn().mockResolvedValue([]);
    const cache = new MixCache(fetchPool, () => 1000, vi.fn());
    await expect(cache.load('80s')).rejects.toThrow('Only 0 playable tracks');
    await expect(cache.load('80s')).rejects.toThrow('temporarily unavailable');
    expect(fetchPool).toHaveBeenCalledTimes(1);
    expect(cache.status()['80s']).toMatchObject({ tracks: 0, loadedAt: null, ready: false });
  });

  it('keeps independent mixes available during one source outage', async () => {
    const cache = new MixCache(async (mix) => {
      if (mix === 'today') throw new Error('chart unavailable');
      return pool;
    }, Date.now, vi.fn());
    await expect(cache.load('today')).rejects.toThrow('chart unavailable');
    expect(await cache.load('80s')).toBe(pool);
    expect(cache.status()['80s'].ready).toBe(true);
  });
});

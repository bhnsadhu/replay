// Minimal client for Deezer's public API (no key needed). Server-side only.

const API = 'https://api.deezer.com';
const TIMEOUT_MS = 8000;

export interface DeezerTrack {
  id: number;
  title_short: string;
  preview: string;
  /** Present on playlist tracks, missing on chart tracks. */
  readable?: boolean;
  explicit_lyrics: boolean;
  artist: { name: string };
}

export interface DeezerTrackDetail extends DeezerTrack {
  release_date?: string;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Deezer ${path} failed: HTTP ${res.status}`);
  const body = (await res.json()) as T & { error?: { message?: string } };
  if (body && typeof body === 'object' && 'error' in body && body.error) {
    throw new Error(`Deezer ${path} failed: ${body.error.message ?? 'unknown error'}`);
  }
  return body;
}

export async function playlistTracks(playlistId: number): Promise<DeezerTrack[]> {
  const body = await getJson<{ data: DeezerTrack[] }>(`/playlist/${playlistId}/tracks?limit=100`);
  return body.data;
}

export async function chartTracks(): Promise<DeezerTrack[]> {
  const body = await getJson<{ data: DeezerTrack[] }>(`/chart/0/tracks?limit=100`);
  return body.data;
}

/** Free-text or advanced search, e.g. `artist:"Toto" track:"Africa"`. */
export async function searchTracks(query: string): Promise<DeezerTrack[]> {
  const body = await getJson<{ data: DeezerTrack[] }>(`/search?q=${encodeURIComponent(query)}&limit=10`);
  return body.data;
}

/** Fetches a track fresh. Preview links expire after ~15 minutes, so call this right before each round. */
export function trackDetail(trackId: number): Promise<DeezerTrackDetail> {
  return getJson<DeezerTrackDetail>(`/track/${trackId}`);
}

export async function downloadPreview(url: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Preview download failed: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

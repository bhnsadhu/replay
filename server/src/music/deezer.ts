// Minimal client for Deezer's public API (no key needed). Server-side only.

const API = 'https://api.deezer.com';
const TIMEOUT_MS = 8000;
/**
 * Deezer allows ~50 requests per 5 seconds per IP. Background lookups start at most one per this gap, so a game's own
 * requests always have headroom.
 */
const BACKGROUND_GAP_MS = 170;

/** 'background' runs paced; 'idle' runs paced too, but only when no 'background' request is waiting. */
type Lane = 'background' | 'idle';

export interface DeezerTrack {
  id: number;
  title_short: string;
  preview: string;
  /** Present on playlist tracks, missing on chart tracks. */
  readable?: boolean;
  explicit_lyrics: boolean;
  /** E.g. "(Live)" or "(Radio Edit)". Present on artist top tracks and search results. */
  title_version?: string;
  artist: { id: number; name: string };
}

export interface DeezerTrackDetail extends DeezerTrack {
  release_date?: string;
}

const waiting: Record<Lane, (() => void)[]> = { background: [], idle: [] };
let pacing = false;

/** Lets the next waiting request go, then holds the lane for one gap. */
function pump(): void {
  if (pacing) return;
  const go = waiting.background.shift() ?? waiting.idle.shift();
  if (!go) return;
  pacing = true;
  go();
  setTimeout(() => {
    pacing = false;
    pump();
  }, BACKGROUND_GAP_MS);
}

function slot(lane: Lane): Promise<void> {
  return new Promise((resolve) => {
    waiting[lane].push(resolve);
    pump();
  });
}

async function getJson<T>(path: string, lane?: Lane): Promise<T> {
  if (lane) await slot(lane);
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

/** Free-text or advanced search, e.g. `artist:"Toto" track:"Africa"`. Paced in the background lane. */
export async function searchTracks(query: string): Promise<DeezerTrack[]> {
  const body = await getJson<{ data: DeezerTrack[] }>(`/search?q=${encodeURIComponent(query)}&limit=10`, 'background');
  return body.data;
}

/** Artists Deezer considers similar, most similar first. Waits in the idle lane: nice to have, never urgent. */
export async function relatedArtists(artistId: number): Promise<{ id: number; name: string }[]> {
  const body = await getJson<{ data: { id: number; name: string }[] }>(`/artist/${artistId}/related?limit=50`, 'idle');
  return body.data;
}

/** An artist's most played tracks. Waits in the idle lane. */
export async function artistTopTracks(artistId: number): Promise<DeezerTrack[]> {
  const body = await getJson<{ data: DeezerTrack[] }>(`/artist/${artistId}/top?limit=15`, 'idle');
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

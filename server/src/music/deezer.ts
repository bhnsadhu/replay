// Minimal client for Deezer's public API (no key needed). Server-side only.

const API = 'https://api.deezer.com';
const TIMEOUT_MS = 8000;
/** A 30-second MP3 preview fits comfortably below this, including at 320 kbps. */
const MAX_PREVIEW_BYTES = 2 * 1024 * 1024;
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
  /** Full title including recording labels, when supplied by the API. */
  title?: string;
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
  const type = res.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  const length = Number(res.headers.get('content-length'));
  if (!res.ok || (type && !['audio/mpeg', 'audio/mp3', 'application/octet-stream'].includes(type)) || length > MAX_PREVIEW_BYTES) {
    await res.body?.cancel();
    throw new Error(`Preview download rejected: HTTP ${res.status}, type ${type ?? 'unknown'}, length ${length}`);
  }
  if (!res.body) throw new Error('Preview download was empty');
  const reader = res.body.getReader();
  const chunks: Buffer[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_PREVIEW_BYTES) throw new Error('Preview download exceeded the size limit');
      chunks.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const audio = Buffer.concat(chunks, bytes);
  if (!hasMp3Header(audio)) throw new Error('Preview did not contain MP3 audio');
  return audio;
}

/** Check the first MPEG frame, allowing an ID3 tag before it. This is not a full audio decoder. */
function hasMp3Header(audio: Buffer): boolean {
  if (audio.length < 4096) return false;
  let offset = 0;
  if (audio.toString('ascii', 0, 3) === 'ID3') {
    const size = audio.subarray(6, 10);
    if (size.some((byte) => byte > 127)) return false;
    offset = 10 + size.reduce((total, byte) => total * 128 + byte, 0);
    if (audio[3] === 4 && (audio[5]! & 0x10)) offset += 10; // ID3v2.4 footer.
  }
  if (offset + 4 > audio.length) return false;
  const b1 = audio[offset + 1]!;
  const b2 = audio[offset + 2]!;
  return audio[offset] === 0xff && (b1 & 0xe0) === 0xe0 && (b1 & 0x18) !== 0x08 &&
    (b1 & 0x06) === 0x02 && (b2 >> 4) > 0 && (b2 >> 4) < 15 && (b2 & 0x0c) !== 0x0c;
}

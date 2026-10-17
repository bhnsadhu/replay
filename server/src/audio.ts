import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';

// Holds each round's clip in memory and serves it at /audio/<random id>.
// The random id means the URL says nothing about which song it is (PLAN.md §7).
// Range requests are supported because iPhone Safari requires them for audio.

const TTL_MS = 10 * 60 * 1000;
const clips = new Map<string, { data: Buffer; expiresAt: number }>();

export function newClipId(): string {
  return randomBytes(12).toString('base64url');
}

export function storeClip(id: string, data: Buffer): void {
  clips.set(id, { data, expiresAt: Date.now() + TTL_MS });
}

export function dropClip(id: string): void {
  clips.delete(id);
}

setInterval(() => {
  const now = Date.now();
  for (const [id, clip] of clips) if (clip.expiresAt < now) clips.delete(id);
}, 60_000).unref();

export function serveClip(id: string, req: IncomingMessage, res: ServerResponse): void {
  const clip = clips.get(id);
  if (!clip) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
    return;
  }

  const { data } = clip;
  const headers = {
    'content-type': 'audio/mpeg',
    'accept-ranges': 'bytes',
    'cache-control': 'private, max-age=600',
    'access-control-allow-origin': '*',
  };

  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
  if (!range) {
    res.writeHead(200, { ...headers, 'content-length': data.length });
    res.end(req.method === 'HEAD' ? undefined : data);
    return;
  }

  let start = range[1] ? Number(range[1]) : NaN;
  let end = range[2] ? Number(range[2]) : data.length - 1;
  if (Number.isNaN(start)) {
    // "bytes=-500" means the last 500 bytes.
    start = Math.max(0, data.length - end);
    end = data.length - 1;
  }
  end = Math.min(end, data.length - 1);
  if (start > end || start >= data.length) {
    res.writeHead(416, { ...headers, 'content-range': `bytes */${data.length}` });
    res.end();
    return;
  }

  res.writeHead(206, {
    ...headers,
    'content-length': end - start + 1,
    'content-range': `bytes ${start}-${end}/${data.length}`,
  });
  res.end(req.method === 'HEAD' ? undefined : data.subarray(start, end + 1));
}

// Basic abuse limits (PLAN.md §8, M8): connections per IP, messages per connection, and how often
// one IP can try room codes, open rooms or start solo games. Sized so a full party on one Wi-Fi
// (one IP: a TV and 8 phones, all reloading at once) never comes close.
import type { IncomingMessage } from 'node:http';

export const LIMITS = {
  /** Open WebSockets per IP at once. */
  connectionsPerIp: 40,
  /** New WebSockets per IP: burst, then one every N ms. */
  connectBurst: 60,
  connectEveryMs: 1000,
  /** Messages per connection: burst, then one every N ms (clients normally send ~1 every 3 s). */
  messageBurst: 40,
  messageEveryMs: 100,
  /** A connection that keeps flooding after being told is closed. */
  dropsBeforeClose: 200,
  /** Joining, resuming, creating rooms, starting solo games, per IP. */
  tryBurst: 30,
  tryEveryMs: 3000,
  /** Audio requests per IP (iPhone Safari makes several range requests per clip). */
  audioBurst: 150,
  audioEveryMs: 250,
};

/** Classic token bucket: holds up to `capacity` tokens, refills one every `everyMs`. */
export class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(
    private readonly capacity: number,
    private readonly everyMs: number,
    now = Date.now(),
  ) {
    this.tokens = capacity;
    this.last = now;
  }

  take(now = Date.now()): boolean {
    this.tokens = Math.min(this.capacity, this.tokens + (now - this.last) / this.everyMs);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }

  /** Full again: nothing to remember for this key. */
  isFull(now = Date.now()): boolean {
    return this.tokens + (now - this.last) / this.everyMs >= this.capacity;
  }
}

/** One bucket per key (an IP), forgetting keys that have been quiet long enough to refill. */
export class KeyedLimiter {
  private readonly buckets = new Map<string, TokenBucket>();

  constructor(
    private readonly capacity: number,
    private readonly everyMs: number,
  ) {
    setInterval(() => this.sweep(), 60_000).unref();
  }

  take(key: string, now = Date.now()): boolean {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = new TokenBucket(this.capacity, this.everyMs, now);
      this.buckets.set(key, bucket);
    }
    return bucket.take(now);
  }

  sweep(now = Date.now()): void {
    for (const [key, bucket] of this.buckets) if (bucket.isFull(now)) this.buckets.delete(key);
  }

  get size(): number {
    return this.buckets.size;
  }
}

/**
 * The visitor's IP. In production the server sits behind Render's Cloudflare proxy, which sets
 * cf-connecting-ip itself (a client can't fake it). Elsewhere it's the socket address.
 */
export function clientIp(req: IncomingMessage): { ip: string; source: string } {
  for (const header of ['cf-connecting-ip', 'true-client-ip'] as const) {
    const value = req.headers[header];
    if (typeof value === 'string' && value) return { ip: value.trim(), source: header };
  }
  return { ip: req.socket.remoteAddress ?? 'unknown', source: 'socket' };
}

export const connectLimiter = new KeyedLimiter(LIMITS.connectBurst, LIMITS.connectEveryMs);
export const tryLimiter = new KeyedLimiter(LIMITS.tryBurst, LIMITS.tryEveryMs);
export const audioLimiter = new KeyedLimiter(LIMITS.audioBurst, LIMITS.audioEveryMs);

const openPerIp = new Map<string, number>();

/** Counts an open connection; returns false (and counts nothing) if the IP already has too many. */
export function openConnection(ip: string): boolean {
  const open = openPerIp.get(ip) ?? 0;
  if (open >= LIMITS.connectionsPerIp) return false;
  openPerIp.set(ip, open + 1);
  return true;
}

export function closeConnection(ip: string): void {
  const open = (openPerIp.get(ip) ?? 1) - 1;
  if (open <= 0) openPerIp.delete(ip);
  else openPerIp.set(ip, open);
}

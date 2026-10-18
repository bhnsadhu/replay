import type { IncomingMessage } from 'node:http';
import { describe, expect, it } from 'vitest';
import { KeyedLimiter, TokenBucket, clientIp } from './limits';

describe('TokenBucket', () => {
  it('allows a burst, then one per interval', () => {
    const bucket = new TokenBucket(3, 1000, 0);
    expect([bucket.take(0), bucket.take(0), bucket.take(0), bucket.take(0)]).toEqual([true, true, true, false]);
    expect(bucket.take(500)).toBe(false);
    expect(bucket.take(1000)).toBe(true);
    expect(bucket.take(1000)).toBe(false);
  });

  it('never refills past its capacity', () => {
    const bucket = new TokenBucket(2, 100, 0);
    expect(bucket.isFull(0)).toBe(true);
    bucket.take(0);
    expect(bucket.isFull(50)).toBe(false);
    expect(bucket.isFull(100)).toBe(true);
    expect([bucket.take(10_000), bucket.take(10_000), bucket.take(10_000)]).toEqual([true, true, false]);
  });
});

describe('KeyedLimiter', () => {
  it('limits each key on its own and forgets refilled keys', () => {
    const limiter = new KeyedLimiter(1, 1000);
    expect(limiter.take('a', 0)).toBe(true);
    expect(limiter.take('a', 0)).toBe(false);
    expect(limiter.take('b', 0)).toBe(true);
    limiter.sweep(500);
    expect(limiter.size).toBe(2);
    limiter.sweep(1000);
    expect(limiter.size).toBe(0);
  });
});

describe('clientIp', () => {
  const req = (headers: Record<string, string>) => ({ headers, socket: { remoteAddress: '10.0.0.1' } }) as unknown as IncomingMessage;

  it("prefers Cloudflare's header, which clients can't set", () => {
    expect(clientIp(req({ 'cf-connecting-ip': '1.2.3.4', 'x-forwarded-for': '9.9.9.9' }))).toEqual({ ip: '1.2.3.4', source: 'cf-connecting-ip' });
  });

  it('ignores X-Forwarded-For and falls back to the socket', () => {
    expect(clientIp(req({ 'x-forwarded-for': '9.9.9.9' }))).toEqual({ ip: '10.0.0.1', source: 'socket' });
  });
});

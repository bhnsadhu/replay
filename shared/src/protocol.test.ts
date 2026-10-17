import { describe, expect, it } from 'vitest';
import { parseClientMessage } from './protocol';

describe('parseClientMessage', () => {
  it('accepts a valid ping', () => {
    expect(parseClientMessage('{"t":"ping","at":123}')).toEqual({ t: 'ping', at: 123 });
  });

  it('accepts a valid echo', () => {
    expect(parseClientMessage('{"t":"echo","text":"hi"}')).toEqual({ t: 'echo', text: 'hi' });
  });

  it('rejects malformed JSON', () => {
    expect(parseClientMessage('{nope')).toBeNull();
  });

  it('rejects unknown types', () => {
    expect(parseClientMessage('{"t":"hack"}')).toBeNull();
  });

  it('rejects wrong field types', () => {
    expect(parseClientMessage('{"t":"ping","at":"soon"}')).toBeNull();
    expect(parseClientMessage('{"t":"echo","text":5}')).toBeNull();
  });

  it('accepts solo:start only for known mixes', () => {
    expect(parseClientMessage('{"t":"solo:start","mix":"80s"}')).toEqual({ t: 'solo:start', mix: '80s' });
    expect(parseClientMessage('{"t":"solo:start","mix":"polka"}')).toBeNull();
  });

  it('validates guesses', () => {
    expect(parseClientMessage('{"t":"guess","roundId":"r1","choice":"B","elapsedMs":2100}')).toEqual({
      t: 'guess',
      roundId: 'r1',
      choice: 'B',
      elapsedMs: 2100,
    });
    expect(parseClientMessage('{"t":"guess","roundId":"r1","choice":"E","elapsedMs":2100}')).toBeNull();
    expect(parseClientMessage('{"t":"guess","roundId":"r1","choice":"A"}')).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'guess', roundId: 'x'.repeat(80), choice: 'A', elapsedMs: 1 }))).toBeNull();
  });

  it('rejects oversized messages', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'echo', text: 'x'.repeat(5000) }))).toBeNull();
  });
});

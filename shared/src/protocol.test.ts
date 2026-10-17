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

  it('rejects oversized messages', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'echo', text: 'x'.repeat(5000) }))).toBeNull();
  });
});

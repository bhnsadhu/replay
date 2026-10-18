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

  it('parses room messages and normalizes codes and initials to uppercase', () => {
    expect(parseClientMessage('{"t":"room:create","role":"tv"}')).toEqual({ t: 'room:create', role: 'tv' });
    expect(parseClientMessage('{"t":"room:create","role":"player","initials":"dev"}')).toEqual({
      t: 'room:create',
      role: 'player',
      initials: 'DEV',
    });
    expect(parseClientMessage('{"t":"room:join","code":"wxqk","initials":"may"}')).toEqual({ t: 'room:join', code: 'WXQK', initials: 'MAY' });
    expect(parseClientMessage('{"t":"room:start"}')).toEqual({ t: 'room:start' });
  });

  it('rejects bad codes, initials and rules', () => {
    expect(parseClientMessage('{"t":"room:join","code":"WXQ0","initials":"MAY"}')).toBeNull(); // 0 not allowed
    expect(parseClientMessage('{"t":"room:join","code":"WIQK","initials":"MAY"}')).toBeNull(); // I not allowed
    expect(parseClientMessage('{"t":"room:join","code":"WXQK","initials":"MA"}')).toBeNull();
    expect(parseClientMessage('{"t":"room:initials","initials":"D3V"}')).toBeNull();
    const rules = { rounds: 10, clipSeconds: 15, mix: '90s', sound: 'tv' };
    expect(parseClientMessage(JSON.stringify({ t: 'room:rules', rules }))).toEqual({ t: 'room:rules', rules });
    expect(parseClientMessage(JSON.stringify({ t: 'room:rules', rules: { ...rules, rounds: 7 } }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'room:rules', rules: { ...rules, sound: 'loud' } }))).toBeNull();
  });

  it('rejects oversized messages', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'echo', text: 'x'.repeat(5000) }))).toBeNull();
  });

  it('parses the host controls', () => {
    expect(parseClientMessage('{"t":"room:pause","paused":true}')).toEqual({ t: 'room:pause', paused: true });
    expect(parseClientMessage('{"t":"room:pause","paused":"yes"}')).toBeNull();
    expect(parseClientMessage('{"t":"room:skip"}')).toEqual({ t: 'room:skip' });
  });

  it('parses public initials, upper-casing them', () => {
    expect(parseClientMessage('{"t":"public:initials","initials":"zed"}')).toEqual({ t: 'public:initials', initials: 'ZED' });
    expect(parseClientMessage('{"t":"public:initials","initials":"Z3D"}')).toBeNull();
  });
});

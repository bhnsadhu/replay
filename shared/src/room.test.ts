import { describe, expect, it } from 'vitest';
import { isRoomCode, playsSound, replayWins } from './room';
import { parseClientMessage } from './protocol';

describe('replayWins', () => {
  it('needs more than half of connected players', () => {
    expect(replayWins(4, 6)).toBe(true);
    expect(replayWins(3, 6)).toBe(false); // a tie is not a majority
    expect(replayWins(1, 1)).toBe(true);
    expect(replayWins(0, 1)).toBe(false);
    expect(replayWins(2, 3)).toBe(true);
  });

  it('never replays an empty room', () => {
    expect(replayWins(0, 0)).toBe(false);
  });
});

describe('playsSound', () => {
  it('plays on the TV in TV mode and on phones in all-phones mode', () => {
    expect(playsSound('tv', 'tv')).toBe(true);
    expect(playsSound('player', 'tv')).toBe(false);
    expect(playsSound('tv', 'all')).toBe(false);
    expect(playsSound('player', 'all')).toBe(true);
  });
});

describe('room codes and votes', () => {
  it('accepts only 4 letters without I or O', () => {
    expect(isRoomCode('WXQK')).toBe(true);
    expect(isRoomCode('WXOK')).toBe(false);
    expect(isRoomCode('wxqk')).toBe(false);
  });

  it('parses vote messages', () => {
    expect(parseClientMessage('{"t":"vote","replay":true}')).toEqual({ t: 'vote', replay: true });
    expect(parseClientMessage('{"t":"vote","replay":"yes"}')).toBeNull();
  });
});

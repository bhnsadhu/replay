import type { BoardEntry, RoomView } from '@replay/shared';
import type { ScoreRow } from '../../ui/game';

/** Scoreboard rows for the TV's HI-SCORE box. */
export function boardRows(board: BoardEntry[], show: 'streak' | 'delta'): ScoreRow[] {
  return board.map((b) => {
    const row: ScoreRow = {
      rank: b.rank,
      initials: b.initials,
      score: b.score,
      tone: b.rank === 1 && b.score > 0 ? 'leader' : b.rank > 4 ? 'dim' : 'normal',
    };
    if (show === 'delta') {
      row.extra = `+${b.delta}`;
      row.extraTone = b.delta > 0 ? 'gain' : 'dim';
    } else if (b.streak >= 2) {
      row.extra = `x${b.streak}`;
      row.extraTone = 'streak';
    }
    return row;
  });
}

/** Before the first reveal there's no board yet: everyone at 0, in join order. */
export function startingBoard(room: RoomView): BoardEntry[] {
  return room.players.map((p, i) => ({ id: p.id, initials: p.initials, score: p.score, delta: 0, streak: 0, rank: i + 1 }));
}

export const ordinal = (n: number): string => {
  const suffix = n % 10 === 1 && n % 100 !== 11 ? 'ST' : n % 10 === 2 && n % 100 !== 12 ? 'ND' : n % 10 === 3 && n % 100 !== 13 ? 'RD' : 'TH';
  return `${n}${suffix}`;
};

export const inviteUrl = (code: string): string => `${window.location.origin}/${code}`;
export const inviteHost = (): string => window.location.host;

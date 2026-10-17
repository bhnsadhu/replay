// Sample data matching the canvas mockups (round 4 of a 10-round party game).
import type { AnswerOption } from '@replay/shared';
import type { ScoreRow } from '../ui/game';
import type { GameOver, Reveal, RoundStart } from '../game/useSoloGame';

export const SAMPLE_OPTIONS: AnswerOption[] = [
  { letter: 'A', title: 'Mr. Brightside', artist: 'The Killers' },
  { letter: 'B', title: 'Take On Me', artist: 'a-ha' },
  { letter: 'C', title: 'Dreams', artist: 'Fleetwood Mac' },
  { letter: 'D', title: 'September', artist: 'Earth, Wind & Fire' },
];

export const SAMPLE_BOARD: ScoreRow[] = [
  { rank: 1, initials: 'MAY', score: 6200, extra: 'x4', extraTone: 'streak', tone: 'leader' },
  { rank: 2, initials: 'DEV', score: 5900, extra: 'x3', extraTone: 'streak' },
  { rank: 3, initials: 'JOR', score: 4350 },
  { rank: 4, initials: 'PRI', score: 3800, extra: 'x2', extraTone: 'streak' },
  { rank: 5, initials: 'SAM', score: 2150, tone: 'dim' },
  { rank: 6, initials: 'LEO', score: 900, tone: 'dim' },
];

export const SAMPLE_ROUND = {
  roomCode: 'WXQK',
  roundIndex: 4,
  roundCount: 10,
  options: SAMPLE_OPTIONS,
  lockedIn: 4,
  playerCount: 6,
  secondsLeft: 12,
  clipSeconds: 15,
  board: SAMPLE_BOARD,
};

export const SAMPLE_PLAYER = { label: 'PLAYER 2', initials: 'DEV', score: 5900, streak: 3 };

export const SAMPLE_ROUND_START: RoundStart = {
  t: 'roundStart',
  roundId: 'sample',
  index: 4,
  total: 10,
  options: SAMPLE_OPTIONS,
  audioPath: '/audio/sample',
  startAt: 0,
  durationMs: 15_000,
};

export const SAMPLE_REVEAL: Reveal = {
  t: 'reveal',
  roundId: 'sample',
  correct: 'B',
  track: { title: 'Take On Me', artist: 'a-ha', year: null },
  picks: { A: ['PRI'], B: ['MAY', 'DEV', 'SAM'], C: ['JOR'], D: [] },
  board: [
    { id: 'p1', initials: 'MAY', score: 7500, delta: 1300, streak: 5, rank: 1 },
    { id: 'p2', initials: 'DEV', score: 7360, delta: 1460, streak: 4, rank: 2 },
    { id: 'p3', initials: 'JOR', score: 4350, delta: 0, streak: 0, rank: 3 },
    { id: 'p4', initials: 'PRI', score: 3800, delta: 0, streak: 0, rank: 4 },
    { id: 'p5', initials: 'SAM', score: 3300, delta: 1150, streak: 1, rank: 5 },
    { id: 'p6', initials: 'LEO', score: 900, delta: 0, streak: 0, rank: 6 },
  ],
  you: { choice: 'B', elapsedMs: 7200, points: 1460, base: 1000, speed: 260, streakBonus: 200, streak: 4, score: 7360 },
  nextAt: 1,
};

export const SAMPLE_GAME_OVER: GameOver = {
  t: 'gameOver',
  board: [
    { id: 'p1', initials: 'MAY', score: 14850, delta: 0, streak: 0, rank: 1 },
    { id: 'p2', initials: 'DEV', score: 14200, delta: 0, streak: 0, rank: 2 },
    { id: 'p3', initials: 'JOR', score: 9400, delta: 0, streak: 0, rank: 3 },
    { id: 'p4', initials: 'PRI', score: 8750, delta: 0, streak: 0, rank: 4 },
    { id: 'p5', initials: 'SAM', score: 6100, delta: 0, streak: 0, rank: 5 },
    { id: 'p6', initials: 'LEO', score: 2300, delta: 0, streak: 0, rank: 6 },
  ],
  awards: {
    bestStreak: { initials: 'MAY', value: 7 },
    fastest: { initials: 'DEV', ms: 1400 },
    mostCorrect: { initials: 'MAY', count: 9 },
    nobodyGot: { title: 'Dreams', artist: 'Fleetwood Mac' },
  },
  you: { score: 14200, correctCount: 8, total: 10, bestStreak: 5, fastestMs: 1400, rank: 2 },
};

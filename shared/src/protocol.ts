// Messages between clients (TV, phones, desktop) and the game server.
// Every message is JSON with a `t` (type) field. See PLAN.md §7.

import { isMixId, type MixId } from './constants';
import { LETTERS, type AnswerOption, type Letter } from './game';

export const WS_PATH = '/ws';
export const AUDIO_PATH = '/audio';
export const DEFAULT_SERVER_PORT = 8787;

export type ClientMessage =
  | { t: 'ping'; at: number }
  | { t: 'echo'; text: string }
  | { t: 'solo:start'; mix: MixId }
  | { t: 'solo:quit' }
  | { t: 'guess'; roundId: string; choice: Letter; elapsedMs: number };

export interface RevealedTrack {
  title: string;
  artist: string;
  year: number | null;
}

export interface YourResult {
  choice: Letter | null;
  elapsedMs: number | null;
  points: number;
  base: number;
  speed: number;
  streakBonus: number;
  /** Streak after this round. */
  streak: number;
  /** Total score after this round. */
  score: number;
}

export type ServerMessage =
  | { t: 'welcome'; serverTime: number }
  | { t: 'pong'; at: number; serverTime: number }
  | { t: 'echo'; text: string }
  | { t: 'error'; code: ErrorCode; message: string }
  | { t: 'solo:preparing'; mix: MixId }
  | {
      t: 'roundStart';
      roundId: string;
      index: number;
      total: number;
      options: AnswerOption[];
      /** Path on the game server, e.g. "/audio/abc123". Reveals nothing about the track. */
      audioPath: string;
      /** Server time (ms) when the clip starts playing. */
      startAt: number;
      durationMs: number;
    }
  | { t: 'guessAck'; roundId: string; choice: Letter }
  | {
      t: 'reveal';
      roundId: string;
      correct: Letter;
      track: RevealedTrack;
      you: YourResult;
      /** Server time when the next round (or game over) comes; null if it's the last. */
      nextAt: number | null;
    }
  | { t: 'gameOver'; score: number; correctCount: number; total: number; bestStreak: number; fastestMs: number | null };

export type ErrorCode = 'bad_message' | 'music_unavailable' | 'not_in_game';

const MAX_MESSAGE_BYTES = 4096;
const MAX_ECHO_LENGTH = 200;
const MAX_ROUND_ID_LENGTH = 64;

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isLetter = (v: unknown): v is Letter => typeof v === 'string' && (LETTERS as readonly string[]).includes(v);

/** Parses and validates a raw client message. Returns null for anything malformed. */
export function parseClientMessage(raw: string): ClientMessage | null {
  if (raw.length > MAX_MESSAGE_BYTES) return null;

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;

  const msg = data as Record<string, unknown>;
  switch (msg.t) {
    case 'ping':
      return isFiniteNumber(msg.at) ? { t: 'ping', at: msg.at } : null;
    case 'echo':
      return typeof msg.text === 'string' && msg.text.length <= MAX_ECHO_LENGTH ? { t: 'echo', text: msg.text } : null;
    case 'solo:start':
      return isMixId(msg.mix) ? { t: 'solo:start', mix: msg.mix } : null;
    case 'solo:quit':
      return { t: 'solo:quit' };
    case 'guess':
      return typeof msg.roundId === 'string' &&
        msg.roundId.length <= MAX_ROUND_ID_LENGTH &&
        isLetter(msg.choice) &&
        isFiniteNumber(msg.elapsedMs)
        ? { t: 'guess', roundId: msg.roundId, choice: msg.choice, elapsedMs: msg.elapsedMs }
        : null;
    default:
      return null;
  }
}

// Messages between clients (TV, phones, desktop) and the game server.
// Every message is JSON with a `t` (type) field. See PLAN.md §7.

import { isMixId, type MixId } from './constants';
import { LETTERS, type AnswerOption, type Letter } from './game';
import type { BestScore, PublicView } from './public';
import {
  CLIP_CHOICES,
  ROUND_CHOICES,
  isInitials,
  isRoomCode,
  type BoardEntry,
  type RoomRole,
  type RoomRules,
  type RoomView,
  type SoundMode,
} from './room';

export const WS_PATH = '/ws';
export const AUDIO_PATH = '/audio';
export const DEFAULT_SERVER_PORT = 8787;

export type ClientMessage =
  | { t: 'ping'; at: number }
  | { t: 'echo'; text: string }
  | { t: 'solo:start'; mix: MixId }
  | { t: 'solo:quit' }
  | { t: 'guess'; roundId: string; choice: Letter; elapsedMs: number }
  // Rooms
  | { t: 'room:create'; role: 'tv' }
  | { t: 'room:create'; role: 'player'; initials: string }
  | { t: 'room:join'; code: string; initials: string }
  | { t: 'room:initials'; initials: string }
  | { t: 'room:ready'; ready: boolean }
  | { t: 'room:rules'; rules: RoomRules }
  | { t: 'room:start' }
  | { t: 'room:kick'; playerId: string }
  | { t: 'room:end' }
  /** Host only, during a game. */
  | { t: 'room:pause'; paused: boolean }
  /** Host only: drop the current song and play a different one (or cut the reveal short). */
  | { t: 'room:skip' }
  | { t: 'room:leave' }
  /** The page is closing or reloading: keep the seat (PLAN.md §5), unlike room:leave. */
  | { t: 'room:away' }
  | { t: 'room:resume'; code: string; token: string }
  | { t: 'tv:soundOn' }
  | { t: 'vote'; replay: boolean }
  // Public room
  | { t: 'public:join'; initials: string }
  | { t: 'public:leave' }
  | { t: 'public:away' }
  | { t: 'public:resume'; token: string }
  | { t: 'public:initials'; initials: string }
  | { t: 'public:stats' };

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

export interface FinalStats {
  score: number;
  correctCount: number;
  total: number;
  bestStreak: number;
  fastestMs: number | null;
  rank: number;
}

export interface Awards {
  bestStreak: { initials: string; value: number } | null;
  fastest: { initials: string; ms: number } | null;
  mostCorrect: { initials: string; count: number } | null;
  nobodyGot: { title: string; artist: string } | null;
}

export type ServerMessage =
  | { t: 'welcome'; serverTime: number }
  | { t: 'pong'; at: number; serverTime: number }
  | { t: 'echo'; text: string }
  | { t: 'error'; code: ErrorCode; message: string }
  | { t: 'solo:preparing'; mix: MixId }
  | {
      t: 'room:state';
      room: RoomView;
      role: RoomRole;
      you: string | null;
      /** Secret for getting this seat back after a dropped connection or reload. */
      token: string;
    }
  | { t: 'room:closed'; reason: string }
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
  /** The host skipped this song before its reveal: nobody scores, another song follows. */
  | { t: 'roundSkipped'; roundId: string }
  | { t: 'lockedIn'; roundId: string; count: number; total: number }
  | {
      t: 'reveal';
      roundId: string;
      correct: Letter;
      track: RevealedTrack;
      /** Initials of who picked each letter. */
      picks: Record<Letter, string[]>;
      board: BoardEntry[];
      /** This player's result, or null for the TV. */
      you: YourResult | null;
      /** Server time when the next round (or game over) comes; null if it's the last. */
      nextAt: number | null;
    }
  | { t: 'gameOver'; board: BoardEntry[]; awards: Awards; you: FinalStats | null }
  /** `initials`: yours, after any renaming of duplicates (AAA → AA2). */
  | { t: 'public:state'; view: PublicView; you: string; initials: string; token: string }
  | { t: 'public:stats'; online: number; best: BestScore[] };

export type ErrorCode =
  | 'bad_message'
  | 'music_unavailable'
  | 'not_in_game'
  | 'room_not_found'
  | 'room_full'
  | 'game_in_progress'
  | 'not_host'
  | 'cannot_start'
  | 'resume_failed'
  | 'rate_limited';

const MAX_MESSAGE_BYTES = 4096;
const MAX_ECHO_LENGTH = 200;
const MAX_ID_LENGTH = 64;

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isLetter = (v: unknown): v is Letter => typeof v === 'string' && (LETTERS as readonly string[]).includes(v);
const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= MAX_ID_LENGTH;
const isSound = (v: unknown): v is SoundMode => v === 'tv' || v === 'all';
const upper = (v: unknown): unknown => (typeof v === 'string' ? v.toUpperCase() : v);

function parseRules(v: unknown): RoomRules | null {
  if (typeof v !== 'object' || v === null) return null;
  const r = v as Record<string, unknown>;
  const rounds = r.rounds;
  const clipSeconds = r.clipSeconds;
  if (!(ROUND_CHOICES as readonly unknown[]).includes(rounds) || !(CLIP_CHOICES as readonly unknown[]).includes(clipSeconds)) return null;
  if (!isMixId(r.mix) || !isSound(r.sound)) return null;
  return { rounds: rounds as number, clipSeconds: clipSeconds as number, mix: r.mix, sound: r.sound };
}

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
      return isId(msg.roundId) && isLetter(msg.choice) && isFiniteNumber(msg.elapsedMs)
        ? { t: 'guess', roundId: msg.roundId, choice: msg.choice, elapsedMs: msg.elapsedMs }
        : null;
    case 'room:create': {
      if (msg.role === 'tv') return { t: 'room:create', role: 'tv' };
      const initials = upper(msg.initials);
      return msg.role === 'player' && isInitials(initials) ? { t: 'room:create', role: 'player', initials } : null;
    }
    case 'room:join': {
      const code = upper(msg.code);
      const initials = upper(msg.initials);
      return isRoomCode(code) && isInitials(initials) ? { t: 'room:join', code, initials } : null;
    }
    case 'room:initials': {
      const initials = upper(msg.initials);
      return isInitials(initials) ? { t: 'room:initials', initials } : null;
    }
    case 'room:ready':
      return typeof msg.ready === 'boolean' ? { t: 'room:ready', ready: msg.ready } : null;
    case 'room:rules': {
      const rules = parseRules(msg.rules);
      return rules ? { t: 'room:rules', rules } : null;
    }
    case 'room:kick':
      return isId(msg.playerId) ? { t: 'room:kick', playerId: msg.playerId } : null;
    case 'room:start':
      return { t: 'room:start' };
    case 'room:end':
      return { t: 'room:end' };
    case 'room:pause':
      return typeof msg.paused === 'boolean' ? { t: 'room:pause', paused: msg.paused } : null;
    case 'room:skip':
      return { t: 'room:skip' };
    case 'room:away':
      return { t: 'room:away' };
    case 'room:resume': {
      const code = upper(msg.code);
      return isRoomCode(code) && isId(msg.token) ? { t: 'room:resume', code, token: msg.token } : null;
    }
    case 'public:away':
      return { t: 'public:away' };
    case 'public:resume':
      return isId(msg.token) ? { t: 'public:resume', token: msg.token } : null;
    case 'room:leave':
      return { t: 'room:leave' };
    case 'public:join': {
      const initials = upper(msg.initials);
      return isInitials(initials) ? { t: 'public:join', initials } : null;
    }
    case 'public:leave':
      return { t: 'public:leave' };
    case 'public:initials': {
      const initials = upper(msg.initials);
      return isInitials(initials) ? { t: 'public:initials', initials } : null;
    }
    case 'public:stats':
      return { t: 'public:stats' };
    case 'vote':
      return typeof msg.replay === 'boolean' ? { t: 'vote', replay: msg.replay } : null;
    case 'tv:soundOn':
      return { t: 'tv:soundOn' };
    default:
      return null;
  }
}

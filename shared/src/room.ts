// Rooms: private games with a code, a host, up to 8 players and optionally a TV (PLAN.md §2, §5).
import { CLIP_SECONDS, ROUNDS_PER_GAME, type MixId } from './constants';

export const MAX_PLAYERS = 8;
export const ROUND_CHOICES = [5, 10, 15] as const;
export const CLIP_CHOICES = [10, 15, 20] as const;

/** "tv": only the TV plays music. "all": every phone plays it (remote play, no TV). */
export type SoundMode = 'tv' | 'all';

export interface RoomRules {
  rounds: number;
  clipSeconds: number;
  mix: MixId;
  sound: SoundMode;
}

export const DEFAULT_RULES: Omit<RoomRules, 'sound'> = {
  rounds: ROUNDS_PER_GAME,
  clipSeconds: CLIP_SECONDS,
  mix: 'throwbacks',
};

export type RoomPhase = 'lobby' | 'playing' | 'over';
export type RoomRole = 'tv' | 'player';

export interface RoomPlayerView {
  id: string;
  /** P1..P8, by join order. */
  slot: number;
  initials: string;
  ready: boolean;
  connected: boolean;
  score: number;
}

export interface RoomView {
  code: string;
  phase: RoomPhase;
  hostId: string | null;
  tvConnected: boolean;
  /** The TV has pressed a key, so the browser will let it play sound. */
  tvReady: boolean;
  rules: RoomRules;
  players: RoomPlayerView[];
  /** The REPLAY? vote after a game, or null when none is running. */
  vote: RoomVote | null;
  /** The TV dropped mid-game in TV-sound mode: the round is on hold until it's back. */
  paused: boolean;
}

export interface RoomVote {
  /** Server time when the vote closes. */
  endsAt: number;
  /** Ids of players who voted to replay. */
  yes: string[];
  /** Connected players who can vote. */
  total: number;
}

/** A majority of connected players must vote yes (PLAN.md §5). */
export function replayWins(yes: number, connected: number): boolean {
  return connected > 0 && yes > connected / 2;
}

export interface BoardEntry {
  id: string;
  initials: string;
  score: number;
  /** Points gained in the round just revealed. */
  delta: number;
  streak: number;
  rank: number;
}

/** Room codes use 4 letters without I and O, which look like 1 and 0. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const isRoomCode = (s: unknown): s is string => typeof s === 'string' && /^[A-HJ-NP-Z]{4}$/.test(s);
export const isInitials = (s: unknown): s is string => typeof s === 'string' && /^[A-Z]{3}$/.test(s);

/** Whether this device should play the clip out loud. */
export function playsSound(role: RoomRole, sound: SoundMode): boolean {
  return role === 'tv' ? sound === 'tv' : sound === 'all';
}

import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { playsSound, type Letter, type RoomRole, type RoomRules, type RoomView, type ServerMessage } from '@replay/shared';
import { connection } from '../net/connection';
import { serverBaseUrl } from '../net/serverUrl';
import { ClipPlayer } from '../audio/clipPlayer';
import { announceServer } from '../ui/announce';
import { playRevealSfx, playSfx } from '../audio/sfx';
import { clearSeat, loadSeat, saveSeat } from '../net/seat';
import type { GameOver, Reveal, RoundStart } from './useSoloGame';

export interface RoomState {
  status: 'idle' | 'pending' | 'in' | 'closed';
  room: RoomView | null;
  role: RoomRole | null;
  you: string | null;
  round: { msg: RoundStart; localStartAt: number; picked: Letter | null; lockedIn: { count: number; total: number } } | null;
  reveal: { msg: Reveal; localNextAt: number | null; streakBefore: number } | null;
  over: GameOver | null;
  /** Your streak going into the current round. */
  streak: number;
  error: string | null;
  closedReason: string | null;
  /** Trying to get this tab's seat back after a reload or dropped connection. */
  resuming: boolean;
  /** The host skipped the last song; another one is loading. */
  skipped: boolean;
}

type Action =
  | { type: 'pending' }
  | { type: 'resuming' }
  | { type: 'pick'; letter: Letter }
  | { type: 'clearError' }
  | { type: 'server'; msg: ServerMessage; toLocal: (t: number) => number };

const INITIAL: RoomState = {
  status: 'idle',
  room: null,
  role: null,
  you: null,
  round: null,
  reveal: null,
  over: null,
  streak: 0,
  error: null,
  closedReason: null,
  resuming: false,
  skipped: false,
};

function reducer(state: RoomState, action: Action): RoomState {
  switch (action.type) {
    case 'pending':
      return { ...state, status: 'pending', error: null };
    case 'resuming':
      return { ...state, resuming: true, error: null };
    case 'clearError':
      return { ...state, error: null };
    case 'pick':
      return state.round && state.round.picked === null ? { ...state, round: { ...state.round, picked: action.letter } } : state;
    case 'server': {
      const { msg, toLocal } = action;
      switch (msg.t) {
        case 'room:state': {
          const startingFresh = msg.room.phase !== 'playing' || state.room?.phase !== 'playing';
          const next = { ...state, status: 'in' as const, room: msg.room, role: msg.role, you: msg.you, error: null, resuming: false };
          if (msg.room.phase === 'lobby') return { ...next, round: null, reveal: null, over: null, streak: 0, skipped: false };
          if (msg.room.phase === 'playing' && startingFresh) return { ...next, round: null, reveal: null, over: null, streak: 0 };
          return next;
        }
        case 'roundStart':
          return {
            ...state,
            round: { msg, localStartAt: toLocal(msg.startAt), picked: null, lockedIn: { count: 0, total: state.room?.players.length ?? 0 } },
            reveal: null,
            skipped: false,
          };
        case 'roundSkipped':
          if (!state.round || state.round.msg.roundId !== msg.roundId) return state;
          return { ...state, round: null, reveal: null, skipped: true };
        case 'lockedIn':
          if (!state.round || state.round.msg.roundId !== msg.roundId) return state;
          return { ...state, round: { ...state.round, lockedIn: { count: msg.count, total: msg.total } } };
        case 'guessAck':
          if (!state.round || state.round.msg.roundId !== msg.roundId) return state;
          return { ...state, round: { ...state.round, picked: msg.choice } };
        case 'reveal':
          return {
            ...state,
            reveal: { msg, localNextAt: msg.nextAt === null ? null : toLocal(msg.nextAt), streakBefore: state.streak },
            streak: msg.you?.streak ?? state.streak,
          };
        case 'gameOver':
          return { ...state, over: msg };
        case 'room:closed':
          return { ...INITIAL, status: 'closed', closedReason: msg.reason };
        case 'error':
          // The seat couldn't be resumed: back to joining, with a note on why.
          if (msg.code === 'resume_failed') return { ...INITIAL, error: msg.message };
          return { ...state, status: state.status === 'pending' ? 'idle' : state.status, error: msg.message, resuming: false };
        default:
          return state;
      }
    }
  }
}

/** Room state for a TV or a phone, kept in sync with the server. */
export function useRoom() {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const playerRef = useRef<ClipPlayer | null>(null);
  /** Whether this device has sound permission (it needs a tap after a reload). */
  const [soundOk, setSoundOk] = useState(false);
  const player = useCallback(() => (playerRef.current ??= new ClipPlayer(setSoundOk)), []);
  const latest = useRef(state);
  useLayoutEffect(() => {
    latest.current = state;
  }, [state]);

  useEffect(() => {
    connection.start();
    const off = connection.onMessage((msg) => {
      const { room, role } = latest.current;
      if (msg.t === 'roundStart') {
        const localStartAt = connection.toLocal(msg.startAt);
        if (room && role && playsSound(role, room.rules.sound)) {
          player().schedule(`${serverBaseUrl()}${msg.audioPath}`, localStartAt, msg.durationMs);
        } else {
          player().markStart(localStartAt);
        }
      }
      if (msg.t === 'reveal' || msg.t === 'gameOver' || msg.t === 'room:closed' || msg.t === 'roundSkipped') player().stop();
      // Paused, or back in the lobby (END): the music stops. A resume sends the round again.
      // (Only on that change: stopping mid-unlock would cancel the tap's sound permission.)
      const wasRunning = room?.phase === 'playing' && !room.paused;
      if (msg.t === 'room:state' && wasRunning && (msg.room.phase !== 'playing' || msg.room.paused)) player().stop();
      // Effects follow the music (PLAN.md §2): only the device playing the clip plays them.
      const loud = room !== null && role !== null && playsSound(role, room.rules.sound);
      if (loud && msg.t === 'reveal') playRevealSfx(msg.you);
      if (loud && msg.t === 'gameOver') playSfx('rewind');
      announceServer(msg);
      dispatch({ type: 'server', msg, toLocal: (t) => connection.toLocal(t) });
    });
    // Seats survive reloads and dropped connections (PLAN.md §5): remember ours, and ask for it back
    // whenever the connection comes (back) up.
    const offSeat = connection.onMessage((msg) => {
      if (msg.t === 'room:state') saveSeat({ kind: 'room', code: msg.room.code, token: msg.token, role: msg.role });
      if (msg.t === 'room:closed' || (msg.t === 'error' && msg.code === 'resume_failed')) clearSeat();
    });
    const tryResume = () => {
      const seat = loadSeat();
      if (seat?.kind !== 'room') return;
      if (connection.send({ t: 'room:resume', code: seat.code, token: seat.token })) dispatch({ type: 'resuming' });
    };
    if (connection.status === 'online') tryResume();
    const offStatus = connection.onStatus((s) => s === 'online' && tryResume());

    // Closing or reloading the page: tell the server right away (the proxy is slow to notice a
    // closed connection), but as "away" so the seat is held in case it's a reload.
    const onPageHide = () => {
      if (latest.current.status === 'in') connection.send({ t: 'room:away' });
    };
    window.addEventListener('pagehide', onPageHide);
    return () => {
      off();
      offSeat();
      offStatus();
      window.removeEventListener('pagehide', onPageHide);
      connection.clearQueued();
      playerRef.current?.dispose();
      playerRef.current = null;
      // Navigating away inside the app (BACK TO HOME) is leaving on purpose. (Only when actually in a
      // room: React's dev-mode double mount runs this cleanup before anything happened.)
      if (latest.current.status === 'in') {
        connection.send({ t: 'room:leave' });
        clearSeat();
      }
    };
  }, [player]);

  /** Must be called inside a tap or keypress so the browser allows sound later. */
  const unlockAudio = useCallback(() => player().unlock(), [player]);

  const send = useCallback((msg: Parameters<typeof connection.send>[0]) => {
    if (!connection.send(msg)) return false;
    return true;
  }, []);

  // Actions only use refs and dispatch, so they never change: safe to use in effect dependencies.
  const actions = useMemo(
    () => ({
      unlockAudio,
      /** Returns false if not connected yet, so the caller can retry. */
      createAsTv: (): boolean => {
        if (!send({ t: 'room:create', role: 'tv' })) return false;
        dispatch({ type: 'pending' });
        return true;
      },
      createAsPlayer: (initials: string) => {
        unlockAudio();
        connection.sendWhenOnline({ t: 'room:create', role: 'player', initials });
        dispatch({ type: 'pending' });
      },
      join: (code: string, initials: string) => {
        unlockAudio();
        connection.sendWhenOnline({ t: 'room:join', code, initials });
        dispatch({ type: 'pending' });
      },
      soundOn: () => {
        unlockAudio();
        send({ t: 'tv:soundOn' });
      },
      setInitials: (initials: string) => send({ t: 'room:initials', initials }),
      setReady: (ready: boolean) => {
        unlockAudio();
        send({ t: 'room:ready', ready });
      },
      setRules: (rules: RoomRules) => send({ t: 'room:rules', rules }),
      start: () => {
        unlockAudio();
        send({ t: 'room:start' });
      },
      end: () => send({ t: 'room:end' }),
      pause: (paused: boolean) => send({ t: 'room:pause', paused }),
      skip: () => send({ t: 'room:skip' }),
      vote: (replay: boolean) => send({ t: 'vote', replay }),
      kick: (playerId: string) => send({ t: 'room:kick', playerId }),
      leave: () => send({ t: 'room:leave' }),
      pick: (letter: Letter) => {
        const round = latest.current.round;
        // Answers count once the music starts, not during the get-ready moment before it.
        if (!round || round.picked !== null || Date.now() < round.localStartAt) return;
        send({ t: 'guess', roundId: round.msg.roundId, choice: letter, elapsedMs: Math.round(player().elapsedMs()) });
        const { room, role } = latest.current;
        if (room && role && playsSound(role, room.rules.sound)) playSfx('lock');
        dispatch({ type: 'pick', letter });
      },
      clearError: () => dispatch({ type: 'clearError' }),
    }),
    [unlockAudio, send, player],
  );

  const needsSoundTap =
    state.status === 'in' && state.room !== null && state.role !== null && playsSound(state.role, state.room.rules.sound) && !soundOk;

  return { state, needsSoundTap, ...actions };
}

export type RoomApi = ReturnType<typeof useRoom>;

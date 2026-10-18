import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef } from 'react';
import { playsSound, type Letter, type RoomRole, type RoomRules, type RoomView, type ServerMessage } from '@replay/shared';
import { connection } from '../net/connection';
import { serverBaseUrl } from '../net/serverUrl';
import { ClipPlayer } from '../audio/clipPlayer';
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
}

type Action =
  | { type: 'pending' }
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
};

function reducer(state: RoomState, action: Action): RoomState {
  switch (action.type) {
    case 'pending':
      return { ...state, status: 'pending', error: null };
    case 'clearError':
      return { ...state, error: null };
    case 'pick':
      return state.round && state.round.picked === null ? { ...state, round: { ...state.round, picked: action.letter } } : state;
    case 'server': {
      const { msg, toLocal } = action;
      switch (msg.t) {
        case 'room:state': {
          const startingFresh = msg.room.phase !== 'playing' || state.room?.phase !== 'playing';
          const next = { ...state, status: 'in' as const, room: msg.room, role: msg.role, you: msg.you, error: null };
          if (msg.room.phase === 'lobby') return { ...next, round: null, reveal: null, over: null, streak: 0 };
          if (msg.room.phase === 'playing' && startingFresh) return { ...next, round: null, reveal: null, over: null, streak: 0 };
          return next;
        }
        case 'roundStart':
          return {
            ...state,
            round: { msg, localStartAt: toLocal(msg.startAt), picked: null, lockedIn: { count: 0, total: state.room?.players.length ?? 0 } },
            reveal: null,
          };
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
          return { ...state, status: state.status === 'pending' ? 'idle' : state.status, error: msg.message };
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
  const player = useCallback(() => (playerRef.current ??= new ClipPlayer()), []);
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
      if (msg.t === 'reveal' || msg.t === 'gameOver' || msg.t === 'room:closed') player().stop();
      dispatch({ type: 'server', msg, toLocal: (t) => connection.toLocal(t) });
    });
    // Tell the server right away when the page closes. Through the hosting proxy a closed
    // connection is only noticed after 10–20 s, which would leave a ghost player in the room.
    const onPageHide = () => {
      if (latest.current.status === 'in') connection.send({ t: 'room:leave' });
    };
    window.addEventListener('pagehide', onPageHide);
    return () => {
      off();
      window.removeEventListener('pagehide', onPageHide);
      playerRef.current?.stop();
      if (latest.current.status === 'in') connection.send({ t: 'room:leave' });
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
        if (send({ t: 'room:create', role: 'player', initials })) dispatch({ type: 'pending' });
      },
      join: (code: string, initials: string) => {
        unlockAudio();
        if (send({ t: 'room:join', code, initials })) dispatch({ type: 'pending' });
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
      kick: (playerId: string) => send({ t: 'room:kick', playerId }),
      leave: () => send({ t: 'room:leave' }),
      pick: (letter: Letter) => {
        const round = latest.current.round;
        if (!round || round.picked !== null) return;
        send({ t: 'guess', roundId: round.msg.roundId, choice: letter, elapsedMs: Math.round(player().elapsedMs()) });
        dispatch({ type: 'pick', letter });
      },
      clearError: () => dispatch({ type: 'clearError' }),
    }),
    [unlockAudio, send, player],
  );

  return { state, ...actions };
}

export type RoomApi = ReturnType<typeof useRoom>;

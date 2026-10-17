import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { Letter, MixId, ServerMessage } from '@replay/shared';
import { connection } from '../net/connection';
import { serverBaseUrl } from '../net/serverUrl';
import { ClipPlayer } from '../audio/clipPlayer';

export type RoundStart = Extract<ServerMessage, { t: 'roundStart' }>;
export type Reveal = Extract<ServerMessage, { t: 'reveal' }>;
export type GameOver = Extract<ServerMessage, { t: 'gameOver' }>;

export type SoloState =
  | { phase: 'menu' }
  | { phase: 'preparing'; mix: MixId }
  | { phase: 'round'; mix: MixId; round: RoundStart; localStartAt: number; picked: Letter | null; score: number; streak: number }
  | { phase: 'reveal'; mix: MixId; round: RoundStart; reveal: Reveal; localNextAt: number | null; streakBefore: number }
  | { phase: 'over'; mix: MixId; over: GameOver }
  | { phase: 'error'; mix: MixId | null; message: string };

type Action =
  | { type: 'start'; mix: MixId }
  | { type: 'menu' }
  | { type: 'pick'; letter: Letter }
  | { type: 'server'; msg: ServerMessage; toLocal: (serverTime: number) => number };

const INITIAL: SoloState = { phase: 'menu' };

function reducer(state: SoloState, action: Action): SoloState {
  switch (action.type) {
    case 'start':
      return { phase: 'preparing', mix: action.mix };
    case 'menu':
      return INITIAL;
    case 'pick':
      return state.phase === 'round' && state.picked === null ? { ...state, picked: action.letter } : state;
    case 'server': {
      const { msg, toLocal } = action;
      const mix = 'mix' in state ? state.mix : null;
      if (msg.t === 'error' && state.phase !== 'menu') return { phase: 'error', mix, message: msg.message };
      if (!mix) return state;
      switch (msg.t) {
        case 'roundStart': {
          const prev = state.phase === 'reveal' ? state.reveal.you : null;
          return {
            phase: 'round',
            mix,
            round: msg,
            localStartAt: toLocal(msg.startAt),
            picked: null,
            score: prev?.score ?? 0,
            streak: prev?.streak ?? 0,
          };
        }
        case 'reveal':
          if (state.phase !== 'round' || state.round.roundId !== msg.roundId) return state;
          return {
            phase: 'reveal',
            mix,
            round: state.round,
            reveal: msg,
            localNextAt: msg.nextAt === null ? null : toLocal(msg.nextAt),
            streakBefore: state.streak,
          };
        case 'gameOver':
          return { phase: 'over', mix, over: msg };
        default:
          return state;
      }
    }
  }
}

/** Single-player game: one device, server-timed rounds (M2). */
export function useSoloGame() {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const playerRef = useRef<ClipPlayer | null>(null);
  const player = () => (playerRef.current ??= new ClipPlayer());

  useEffect(() => {
    connection.start();
    return connection.onMessage((msg) => {
      if (msg.t === 'roundStart') {
        player().schedule(`${serverBaseUrl()}${msg.audioPath}`, connection.toLocal(msg.startAt), msg.durationMs);
      }
      if (msg.t === 'reveal' || msg.t === 'gameOver' || msg.t === 'error') player().stop();
      dispatch({ type: 'server', msg, toLocal: (t) => connection.toLocal(t) });
    });
  }, []);

  useEffect(() => () => playerRef.current?.stop(), []);

  const start = useCallback((mix: MixId) => {
    player().unlock(); // Must happen inside the tap.
    if (connection.send({ t: 'solo:start', mix })) dispatch({ type: 'start', mix });
  }, []);

  const pick = useCallback(
    (letter: Letter) => {
      if (state.phase !== 'round' || state.picked !== null) return;
      connection.send({ t: 'guess', roundId: state.round.roundId, choice: letter, elapsedMs: Math.round(player().elapsedMs()) });
      dispatch({ type: 'pick', letter });
    },
    [state],
  );

  const quit = useCallback(() => {
    connection.send({ t: 'solo:quit' });
    player().stop();
    dispatch({ type: 'menu' });
  }, []);

  return { state, start, pick, quit };
}

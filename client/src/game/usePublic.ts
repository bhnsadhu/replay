import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { BestScore, Letter, PublicView, ServerMessage } from '@replay/shared';
import { connection } from '../net/connection';
import { serverBaseUrl } from '../net/serverUrl';
import { ClipPlayer } from '../audio/clipPlayer';
import { announceServer } from '../ui/announce';
import { playRevealSfx, playSfx } from '../audio/sfx';
import { clearSeat, loadSeat, saveSeat } from '../net/seat';
import type { GameOver, Reveal, RoundStart } from './useSoloGame';

export interface PublicState {
  status: 'idle' | 'pending' | 'in';
  view: PublicView | null;
  you: string | null;
  /** Your initials as the server has them. */
  initials: string | null;
  round: { msg: RoundStart; localStartAt: number; picked: Letter | null } | null;
  reveal: { msg: Reveal; localNextAt: number | null; streakBefore: number } | null;
  over: GameOver | null;
  streak: number;
  error: string | null;
  resuming: boolean;
}

type Action =
  | { type: 'pending' }
  | { type: 'resuming' }
  | { type: 'pick'; letter: Letter }
  | { type: 'server'; msg: ServerMessage; toLocal: (t: number) => number };

const INITIAL: PublicState = { status: 'idle', view: null, you: null, initials: null, round: null, reveal: null, over: null, streak: 0, error: null, resuming: false };

function reducer(state: PublicState, action: Action): PublicState {
  switch (action.type) {
    case 'pending':
      return { ...state, status: 'pending', error: null };
    case 'resuming':
      return { ...state, resuming: true, error: null };
    case 'pick':
      return state.round && state.round.picked === null ? { ...state, round: { ...state.round, picked: action.letter } } : state;
    case 'server': {
      const { msg, toLocal } = action;
      switch (msg.t) {
        case 'public:state': {
          const newSet = msg.view.phase === 'playing' && state.view !== null && msg.view.set !== state.view.set;
          const next = { ...state, status: 'in' as const, view: msg.view, you: msg.you, initials: msg.initials, error: null, resuming: false };
          return newSet ? { ...next, round: null, reveal: null, over: null, streak: 0 } : next;
        }
        case 'roundStart':
          return { ...state, round: { msg, localStartAt: toLocal(msg.startAt), picked: null }, reveal: null, over: null };
        case 'guessAck':
          if (!state.round || state.round.msg.roundId !== msg.roundId) return state;
          return { ...state, round: { ...state.round, picked: msg.choice } };
        case 'reveal':
          return {
            ...state,
            reveal: { msg, localNextAt: msg.nextAt === null ? null : toLocal(msg.nextAt), streakBefore: state.streak },
            streak: msg.you?.streak ?? 0,
          };
        case 'gameOver':
          return { ...state, over: msg, round: null };
        case 'error':
          if (msg.code === 'resume_failed') return { ...INITIAL };
          return { ...state, status: state.status === 'pending' ? 'idle' : state.status, error: msg.message, resuming: false };
        default:
          return state;
      }
    }
  }
}

/** The always-on public room. Every device plays its own sound (PLAN.md §2). */
export function usePublic() {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const playerRef = useRef<ClipPlayer | null>(null);
  const [soundOk, setSoundOk] = useState(false);
  const player = useCallback(() => (playerRef.current ??= new ClipPlayer(setSoundOk)), []);
  const latest = useRef(state);
  useLayoutEffect(() => {
    latest.current = state;
  }, [state]);

  useEffect(() => {
    connection.start();
    const off = connection.onMessage((msg) => {
      if (msg.t === 'roundStart') {
        player().schedule(`${serverBaseUrl()}${msg.audioPath}`, connection.toLocal(msg.startAt), msg.durationMs);
      }
      if (msg.t === 'reveal' || msg.t === 'gameOver') player().stop();
      if (msg.t === 'reveal' && msg.you) playRevealSfx(msg.you);
      if (msg.t === 'gameOver') playSfx('rewind');
      announceServer(msg);
      dispatch({ type: 'server', msg, toLocal: (t) => connection.toLocal(t) });
    });
    // Keep this tab's seat across reloads and dropped connections (PLAN.md §5).
    const offSeat = connection.onMessage((msg) => {
      if (msg.t === 'public:state') saveSeat({ kind: 'public', token: msg.token });
      if (msg.t === 'error' && msg.code === 'resume_failed') clearSeat();
    });
    const tryResume = () => {
      const seat = loadSeat();
      if (seat?.kind !== 'public') return;
      if (connection.send({ t: 'public:resume', token: seat.token })) dispatch({ type: 'resuming' });
    };
    if (connection.status === 'online') tryResume();
    const offStatus = connection.onStatus((st) => st === 'online' && tryResume());
    const away = () => {
      if (latest.current.status === 'in') connection.send({ t: 'public:away' });
    };
    window.addEventListener('pagehide', away);
    return () => {
      off();
      offSeat();
      offStatus();
      window.removeEventListener('pagehide', away);
      connection.clearQueued();
      playerRef.current?.dispose();
      playerRef.current = null;
      if (latest.current.status === 'in') {
        connection.send({ t: 'public:leave' });
        clearSeat();
      }
    };
  }, [player]);

  const actions = useMemo(
    () => ({
      /** Must be called from a tap: it also unlocks sound for the session. */
      unlockAudio: () => player().unlock(),
      join: (initials: string) => {
        player().unlock();
        connection.sendWhenOnline({ t: 'public:join', initials });
        playSfx('coin');
        dispatch({ type: 'pending' });
      },
      setInitials: (initials: string) => connection.send({ t: 'public:initials', initials }),
      pick: (letter: Letter) => {
        const round = latest.current.round;
        if (!round || round.picked !== null) return;
        connection.send({ t: 'guess', roundId: round.msg.roundId, choice: letter, elapsedMs: Math.round(player().elapsedMs()) });
        playSfx('lock');
        dispatch({ type: 'pick', letter });
      },
    }),
    [player],
  );

  return { state, needsSoundTap: state.status === 'in' && !soundOk, ...actions };
}

/** Live public-room numbers for the home screen. */
export function usePublicStats(): { online: number | null; best: BestScore[] } {
  const [stats, setStats] = useState<{ online: number | null; best: BestScore[] }>({ online: null, best: [] });
  useEffect(() => {
    connection.start();
    const off = connection.onMessage((msg) => {
      if (msg.t === 'public:stats') setStats({ online: msg.online, best: msg.best });
    });
    const ask = () => connection.send({ t: 'public:stats' });
    ask();
    const offStatus = connection.onStatus((s) => s === 'online' && ask());
    const timer = window.setInterval(ask, 10_000);
    return () => {
      off();
      offStatus();
      window.clearInterval(timer);
    };
  }, []);
  return stats;
}

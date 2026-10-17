import { useEffect, useRef } from 'react';
import { REVEAL_MS } from '@replay/shared';
import { useRoom } from '../../game/useRoom';
import { useNow, secondsUntil } from '../../game/clock';
import { navigate } from '../../router';
import { RoundTv } from '../RoundTv';
import { RoundPhone } from '../RoundPhone';
import { pad2 } from '../format';
import { SoloRevealPhone } from '../solo/SoloReveal';
import { NO_RESULT } from '../solo/breakdown';
import { GameOverTv, LobbyTv, RevealTv, SoundGateTv, TvMessage } from './TvScreens';
import { GameOverPhone, HostPhone, JoinPhone, LobbyPhone, PhoneMessage } from './PhoneScreens';
import { boardRows, startingBoard } from './board';

const revealSeconds = REVEAL_MS / 1000;

/** This screen hosts a room and shows the game (PLAN.md §2, party mode). */
export function TvRoomApp() {
  const api = useRoom();
  const { state } = api;
  const now = useNow(200);
  const created = useRef(false);

  const { createAsTv } = api;
  useEffect(() => {
    // Create the room once the connection is up. (A ref survives React's dev-mode double effects.)
    const timer = window.setInterval(() => {
      if (!created.current && createAsTv()) created.current = true;
    }, 300);
    return () => window.clearInterval(timer);
  }, [createAsTv]);

  const { room, round, reveal, over } = state;
  const home = (
    <button type="button" className="secondary-button" onClick={() => navigate('/')}>
      BACK TO HOME
    </button>
  );

  if (state.status === 'closed') return <TvMessage title="ROOM CLOSED" sub={state.closedReason ?? ''} footer={home} />;
  if (!room) return <TvMessage title="CONNECTING…" sub="Opening a room for this screen." />;
  if (room.phase === 'lobby') return room.tvReady ? <LobbyTv room={room} /> : <SoundGateTv room={room} onSoundOn={api.soundOn} />;
  if (room.phase === 'over' && over) return <GameOverTv room={room} over={over} />;

  if (reveal && round && reveal.msg.roundId === round.msg.roundId) {
    const secondsToNext = reveal.localNextAt === null ? 0 : secondsUntil(reveal.localNextAt, now, revealSeconds);
    return <RevealTv room={room} round={round.msg} reveal={reveal.msg} secondsToNext={secondsToNext} />;
  }
  if (round) {
    const clipSeconds = round.msg.durationMs / 1000;
    const secondsLeft = now < round.localStartAt ? clipSeconds : secondsUntil(round.localStartAt + round.msg.durationMs, now, clipSeconds);
    const board = reveal?.msg.board ?? startingBoard(room);
    return (
      <RoundTv
        roomCode={room.code}
        roundIndex={round.msg.index}
        roundCount={round.msg.total}
        options={round.msg.options}
        lockedIn={round.lockedIn.count}
        playerCount={round.lockedIn.total}
        secondsLeft={secondsLeft}
        clipSeconds={clipSeconds}
        board={boardRows(board, 'streak')}
      />
    );
  }
  return <TvMessage title="GET READY" sub="Loading the first song…" code={room.code} />;
}

/** A phone in a room: joining, lobby, rounds and results. */
export function PhoneRoomApp({ mode, code }: { mode: 'join' | 'create'; code?: string }) {
  const api = useRoom();
  const { state } = api;
  const now = useNow(200);
  const { room, round, reveal, over, you } = state;
  const home = (
    <button type="button" className="primary-button display" onClick={() => navigate('/')}>
      BACK TO HOME
    </button>
  );

  // Once a phone-hosted room exists, give it a shareable URL.
  useEffect(() => {
    if (mode === 'create' && room && window.location.pathname !== `/${room.code}`) navigate(`/${room.code}`, { replace: true });
  }, [mode, room]);

  if (state.status === 'closed') {
    return (
      <PhoneMessage context="REPLAY" title="GAME OVER" action={home}>
        <p>{state.closedReason}</p>
      </PhoneMessage>
    );
  }

  if (!room || !you) {
    return (
      <JoinPhone
        mode={mode}
        code={code}
        pending={state.status === 'pending'}
        error={state.error}
        onSubmit={(initials) => (mode === 'join' && code ? api.join(code, initials) : api.createAsPlayer(initials))}
      />
    );
  }

  const me = room.players.find((p) => p.id === you);
  const label = `PLAYER ${me?.slot ?? '-'}`;
  const initials = me?.initials ?? '???';
  const noTv = room.rules.sound === 'all';

  if (room.phase === 'lobby') {
    return room.hostId === you ? (
      <HostPhone room={room} you={you} error={state.error} onRules={api.setRules} onKick={api.kick} onStart={api.start} />
    ) : (
      <LobbyPhone room={room} you={you} onInitials={api.setInitials} onReady={api.setReady} />
    );
  }

  if (room.phase === 'over' && over) {
    return <GameOverPhone room={room} you={you} over={over} onPlayAgain={api.start} onBackToLobby={api.end} />;
  }

  if (reveal && round && reveal.msg.roundId === round.msg.roundId) {
    const secondsToNext = reveal.localNextAt === null ? 0 : secondsUntil(reveal.localNextAt, now, revealSeconds);
    return (
      <SoloRevealPhone
        round={round.msg}
        reveal={{ ...reveal.msg, you: reveal.msg.you ?? NO_RESULT }}
        streakBefore={reveal.streakBefore}
        secondsToNext={secondsToNext}
        context={`${room.code} · RND ${pad2(round.msg.index)}`}
        player={{ label, initials }}
        board={noTv ? reveal.msg.board : undefined}
      />
    );
  }

  if (round) {
    const clipSeconds = round.msg.durationMs / 1000;
    const secondsLeft = now < round.localStartAt ? clipSeconds : secondsUntil(round.localStartAt + round.msg.durationMs, now, clipSeconds);
    const score = reveal?.msg.you?.score ?? 0;
    return (
      <RoundPhone
        context={`${room.code} · RND ${pad2(round.msg.index)}`}
        player={{ label, initials, score, streak: state.streak }}
        options={round.msg.options}
        picked={round.picked}
        secondsLeft={secondsLeft}
        clipSeconds={clipSeconds}
        onPick={api.pick}
      />
    );
  }

  return (
    <PhoneMessage context={`${room.code} · GAME`} title="GET READY">
      <p>{noTv ? 'The music plays on this phone. Turn the volume up.' : 'Watch the TV. Your answers go here.'}</p>
    </PhoneMessage>
  );
}

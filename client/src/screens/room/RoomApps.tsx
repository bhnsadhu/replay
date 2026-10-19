import { useEffect, useRef } from 'react';
import { REVEAL_MS, VOTE_MS, type RoomView } from '@replay/shared';
import { connection } from '../../net/connection';
import { loadSeat } from '../../net/seat';
import { useRoom, type RoomApi } from '../../game/useRoom';
import { useNow, secondsUntil } from '../../game/clock';
import { navigate } from '../../router';
import { ConnectionBanners } from '../../ui/banners';
import { OptionsHost, type OptionsConfig } from '../../ui/options';
import { RoundTv } from '../RoundTv';
import { RoundPhone } from '../RoundPhone';
import { pad2 } from '../format';
import { SoloRevealPhone } from '../solo/SoloReveal';
import { NO_RESULT } from '../solo/breakdown';
import { GameOverTv, LobbyTv, RevealTv, SoundGateTv, TvMessage } from './TvScreens';
import { GameOverPhone, HostPhone, JoinPhone, LobbyPhone, PhoneMessage, saveInitials } from './PhoneScreens';
import { boardRows, startingBoard } from './board';

const revealSeconds = REVEAL_MS / 1000;

const voteSecondsLeft = (room: RoomView, now: number): number =>
  room.vote ? secondsUntil(connection.toLocal(room.vote.endsAt), now, VOTE_MS / 1000) : 0;

/** This screen hosts a room and shows the game (PLAN.md §2, party mode). */
export function TvRoomApp() {
  const api = useRoom();
  const now = useNow(200);
  const created = useRef(false);

  const { createAsTv } = api;
  useEffect(() => {
    // Create the room once the connection is up, unless this tab is getting its TV seat back
    // after a reload. (A ref survives React's dev-mode double effects.)
    const timer = window.setInterval(() => {
      if (created.current || loadSeat()?.kind === 'room') return;
      if (createAsTv()) created.current = true;
    }, 300);
    return () => window.clearInterval(timer);
  }, [createAsTv]);

  const room = api.state.room;
  const options: OptionsConfig = { context: room?.code ?? 'REPLAY', leave: { label: 'CLOSE ROOM', onLeave: () => navigate('/') } };

  return (
    <>
      <OptionsHost config={options} floatingGear>
        <TvRoomScreen api={api} now={now} />
      </OptionsHost>
      <ConnectionBanners inGame={api.state.status === 'in'} needsSoundTap={api.needsSoundTap} onTapSound={api.unlockAudio} />
    </>
  );
}

function TvRoomScreen({ api, now }: { api: RoomApi; now: number }) {
  const { state } = api;
  const { room, round, reveal, over } = state;
  const home = (
    <button type="button" className="secondary-button" onClick={() => navigate('/')}>
      BACK TO HOME
    </button>
  );

  if (state.status === 'closed') return <TvMessage title="ROOM CLOSED" sub={state.closedReason ?? ''} footer={home} />;
  if (!room) return <TvMessage title={state.resuming ? 'REJOINING…' : 'CONNECTING…'} sub="Opening a room for this screen." />;
  if (room.phase === 'lobby') return room.tvReady ? <LobbyTv room={room} /> : <SoundGateTv room={room} onSoundOn={api.soundOn} />;
  if (room.phase === 'over' && over) return <GameOverTv room={room} over={over} voteSecondsLeft={voteSecondsLeft(room, now)} />;
  if (room.phase === 'playing' && room.paused === 'host') return <TvMessage title="PAUSED" status="pause" sub="The host paused the game. The round starts over when they resume." code={room.code} />;

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
  return <TvMessage status="play" title={state.skipped ? '▶▶ SKIPPED' : 'GET READY'} sub={state.skipped ? 'Loading a different song…' : 'Loading the next song…'} code={room.code} />;
}

/** A phone in a room: joining, lobby, rounds and results. */
export function PhoneRoomApp({ mode, code }: { mode: 'join' | 'create'; code?: string }) {
  const api = useRoom();
  const now = useNow(200);
  const { room } = api.state;

  // Once a phone-hosted room exists, give it a shareable URL.
  useEffect(() => {
    if (mode === 'create' && room && window.location.pathname !== `/${room.code}`) navigate(`/${room.code}`, { replace: true });
  }, [mode, room]);

  const options = phoneOptions(api);
  const screen = <PhoneRoomScreen api={api} now={now} mode={mode} code={code} />;

  return (
    <>
      {options ? <OptionsHost config={options}>{screen}</OptionsHost> : screen}
      <ConnectionBanners inGame={api.state.status === 'in'} needsSoundTap={api.needsSoundTap} onTapSound={api.unlockAudio} />
    </>
  );
}

/** Options for a phone in a room; none before it has a seat. */
function phoneOptions(api: RoomApi): OptionsConfig | null {
  const { room, you } = api.state;
  const me = room?.players.find((p) => p.id === you);
  if (!room || !me) return null;
  const isHost = room.hostId === me.id;
  return {
    context: room.code,
    initials: {
      value: me.initials,
      lockedReason: room.phase === 'lobby' ? null : 'You can change them in the lobby, between games.',
      onSave: (initials) => {
        saveInitials(initials);
        api.setInitials(initials);
      },
    },
    host:
      isHost && room.phase === 'playing'
        ? { paused: room.paused === 'host', onPause: api.pause, onSkip: api.skip, onEnd: api.end }
        : undefined,
    leave: { label: 'LEAVE ROOM', onLeave: () => navigate('/') },
  };
}

function PhoneRoomScreen({ api, now, mode, code }: { api: RoomApi; now: number; mode: 'join' | 'create'; code?: string }) {
  const { state } = api;
  const { room, round, reveal, over, you } = state;
  const home = (
    <button type="button" className="primary-button display" onClick={() => navigate('/')}>
      BACK TO HOME
    </button>
  );

  if (state.status === 'closed') {
    return (
      <PhoneMessage context="REPLAY" title="GAME OVER" action={home}>
        <p>{state.closedReason}</p>
      </PhoneMessage>
    );
  }

  if (!room || !you) {
    if (state.resuming) {
      return (
        <PhoneMessage context={code ? `JOIN ${code}` : 'REPLAY'} title="REJOINING…">
          <p>Getting your seat back.</p>
        </PhoneMessage>
      );
    }
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

  if (room.phase === 'playing' && room.paused) {
    const isHost = room.hostId === you;
    const byHost = room.paused === 'host';
    return (
      <PhoneMessage
        context={`${room.code} · PAUSED`}
        status="pause"
        title="PAUSED"
        action={
          byHost && isHost ? (
            <button type="button" className="primary-button display" onClick={() => api.pause(false)}>
              ▶ RESUME
            </button>
          ) : undefined
        }
      >
        <p>
          {byHost
            ? isHost
              ? 'Everyone is waiting on you. The round starts over when you resume.'
              : 'The host paused the game. The round starts over when they resume.'
            : "The TV lost its connection. The round will start over when it's back."}
        </p>
      </PhoneMessage>
    );
  }

  if (room.phase === 'over' && over) {
    return (
      <GameOverPhone
        room={room}
        you={you}
        over={over}
        voteSecondsLeft={voteSecondsLeft(room, now)}
        onVote={api.vote}
        onBackToLobby={api.end}
      />
    );
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
    // After a reload there's no reveal yet, so fall back to the score the room kept for this seat.
    const score = reveal?.msg.you?.score ?? me?.score ?? 0;
    return (
      <RoundPhone
        context={`${room.code} · RND ${pad2(round.msg.index)}`}
        waiting={now < round.localStartAt}
        player={{ label, initials, score, streak: state.streak }}
        options={round.msg.options}
        picked={round.picked}
        secondsLeft={secondsLeft}
        clipSeconds={clipSeconds}
        onPick={api.pick}
      />
    );
  }

  if (state.skipped) {
    return (
      <PhoneMessage context={`${room.code} · GAME`} status="play" title="▶▶ SKIPPED">
        <p>The host skipped that song. Loading a different one…</p>
      </PhoneMessage>
    );
  }

  return (
    <PhoneMessage context={`${room.code} · GAME`} title="GET READY">
      <p>{noTv ? 'The music plays on this phone. Turn the volume up.' : 'Watch the TV. Your answers go here.'}</p>
    </PhoneMessage>
  );
}

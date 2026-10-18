import { useState } from 'react';
import { MIXES, PUBLIC_INTERMISSION_MS, PUBLIC_MIX_ORDER, type BoardEntry, type MixId, type PublicView } from '@replay/shared';
import { usePublic, usePublicStats } from '../../game/usePublic';
import { secondsUntil, useIsPhone, useNow } from '../../game/clock';
import { connection } from '../../net/connection';
import { Logo, Phone, PhoneTopRow, PlayerCard, StatusLine, TvHeader, TvStage } from '../../ui/frames';
import { InitialsPicker } from '../../ui/controls';
import { HiScoreBox, SegmentTimer, type ScoreRow } from '../../ui/game';
import type { GameOver } from '../../game/useSoloGame';
import { RoundPhone } from '../RoundPhone';
import { SoloRoundDesktop } from '../solo/SoloRoundDesktop';
import { SoloRevealDesktop, SoloRevealPhone, TopThree } from '../solo/SoloReveal';
import { FinalStatGrid } from '../solo/SoloOver';
import { NO_RESULT } from '../solo/breakdown';
import { hasSavedInitials, saveInitials, savedInitials } from '../room/PhoneScreens';
import { boardRows, ordinal } from '../room/board';
import { pad2, timerSegments } from '../format';
import { ConnectionBanners } from '../../ui/banners';

const mixLabel = (id: MixId) => MIXES.find((m) => m.id === id)?.label ?? id;
const nextMix = (view: PublicView) => PUBLIC_MIX_ORDER[(PUBLIC_MIX_ORDER.indexOf(view.mix) + (view.phase === 'intermission' ? 0 : 1)) % PUBLIC_MIX_ORDER.length]!;

/** Top 10 rows, plus your own row underneath if you're outside it. */
function publicBoard(board: BoardEntry[], you: string): { rows: ScoreRow[]; footer?: ScoreRow } {
  const rows = boardRows(board, 'streak').map((r, i) => (board[i]?.id === you ? { ...r, tone: 'you' as const } : r));
  const mine = board.find((b) => b.id === you);
  if (!mine || mine.rank <= 10) return { rows: rows.slice(0, 10) };
  return { rows: rows.slice(0, 10), footer: { rank: mine.rank, initials: mine.initials, score: mine.score } };
}

export function PublicApp() {
  const api = usePublic();
  return (
    <>
      <PublicScreen api={api} />
      <ConnectionBanners inGame={api.state.status === 'in'} needsSoundTap={api.needsSoundTap} onTapSound={api.unlockAudio} />
    </>
  );
}

function PublicScreen({ api }: { api: ReturnType<typeof usePublic> }) {
  const { state } = api;
  const isPhone = useIsPhone();
  const now = useNow(200);
  const [initials, setInitials] = useState(savedInitials);
  const { view, round, reveal, over, you } = state;

  if (state.status !== 'in' || !view || !you) {
    if (state.resuming) {
      return (
        <Phone>
          <PhoneTopRow context="PUBLIC" status="stop" />
          <div className="error-box">
            <p className="error-box__title display">REJOINING…</p>
            <p>Getting your seat back.</p>
          </div>
        </Phone>
      );
    }
    return (
      <PublicJoin
        initials={initials}
        onInitials={setInitials}
        pending={state.status === 'pending'}
        error={state.error}
        onJoin={() => {
          saveInitials(initials);
          api.join(initials);
        }}
      />
    );
  }

  const lastBoard = reveal?.msg.board ?? over?.board ?? null;
  const mine = lastBoard?.find((b) => b.id === you);
  // The server may rename duplicates (AAA → AA2); show its version once known.
  const shownInitials = mine?.initials ?? initials;
  const rankLabel = mine ? `#${mine.rank} OF ${view.online}` : `${view.online} PLAYING`;
  const score = reveal?.msg.you?.score ?? 0;
  const secondsToSet = view.nextAt === null ? 0 : secondsUntil(connection.toLocal(view.nextAt), now, 99);

  if (over) {
    return isPhone ? (
      <PublicResultsPhone view={view} you={you} initials={shownInitials} over={over} secondsToSet={secondsToSet} />
    ) : (
      <PublicResultsDesktop view={view} you={you} over={over} secondsToSet={secondsToSet} />
    );
  }

  if (reveal && round && reveal.msg.roundId === round.msg.roundId) {
    const secondsToNext = reveal.localNextAt === null ? 0 : secondsUntil(reveal.localNextAt, now, 5);
    const props = { round: round.msg, reveal: { ...reveal.msg, you: reveal.msg.you ?? NO_RESULT }, streakBefore: reveal.streakBefore, secondsToNext };
    return isPhone ? (
      <SoloRevealPhone {...props} context={`PUBLIC · RND ${pad2(round.msg.index)}`} player={{ label: rankLabel, initials: shownInitials }} board={reveal.msg.board} />
    ) : (
      <SoloRevealDesktop {...props} />
    );
  }

  if (round) {
    const clipSeconds = round.msg.durationMs / 1000;
    const secondsLeft = now < round.localStartAt ? clipSeconds : secondsUntil(round.localStartAt + round.msg.durationMs, now, clipSeconds);
    if (isPhone) {
      return (
        <RoundPhone
          context={`PUBLIC · RND ${pad2(round.msg.index)}`}
          player={{ label: rankLabel, initials: shownInitials, score, streak: state.streak }}
          options={round.msg.options}
          picked={round.picked}
          secondsLeft={secondsLeft}
          clipSeconds={clipSeconds}
          onPick={api.pick}
          footer={lastBoard ? <TopThree board={lastBoard} /> : <p className="sound-note">♪ Playing on this phone</p>}
        />
      );
    }
    const board = publicBoard(lastBoard ?? [], you);
    return (
      <SoloRoundDesktop
        round={round.msg}
        picked={round.picked}
        secondsLeft={secondsLeft}
        progress={Math.min(1, Math.max(0, (now - round.localStartAt) / round.msg.durationMs))}
        score={score}
        streak={state.streak}
        onPick={api.pick}
        right={{ label: 'PLAYING', value: String(view.online) }}
        aside={
          lastBoard ? (
            <HiScoreBox title={`TOP 10 · ${view.online}`} rows={board.rows} footer={board.footer} />
          ) : (
            <HiScoreBox title={`SET ${view.set} · ${mixLabel(view.mix)}`} rows={[]} />
          )
        }
      />
    );
  }

  return (
    <PublicWaiting
      view={view}
      seconds={secondsToSet}
      isPhone={isPhone}
      title={view.phase === 'playing' ? 'LOADING SONGS…' : `NEXT SET IN ${pad2(secondsToSet)}`}
    />
  );
}

function PublicJoin(props: { initials: string; onInitials: (v: string) => void; pending: boolean; error: string | null; onJoin: () => void }) {
  const { online } = usePublicStats();
  const returning = hasSavedInitials();
  return (
    <Phone>
      <PhoneTopRow context="PUBLIC" status="play" />
      <PlayerCard label="PLAYING NOW" initials={online === null ? '…' : String(online)} rightLabel="FORMAT" rightValue="10 ROUNDS" />
      <div className="menu-hero">
        <Logo size="phone" />
        <span className="menu-hero__coin display">{returning ? `WELCOME BACK, ${props.initials}` : 'NEW PLAYER'}</span>
      </div>
      <div className="join-body">
        <span className="menu-list__legend display">{returning ? 'YOUR INITIALS' : 'ENTER YOUR INITIALS'}</span>
        <InitialsPicker value={props.initials} onChange={props.onInitials} />
        <p className="join-body__hint">Your initials go on the public HI-SCORE board. The music plays on this device.</p>
      </div>
      {props.error && (
        <p className="form-error" role="alert">
          {props.error}
        </p>
      )}
      <button type="button" className="primary-button display" disabled={props.pending} onClick={props.onJoin}>
        {props.pending ? 'JOINING…' : 'PRESS START'}
      </button>
      <StatusLine>NONSTOP SETS · CLEAN SONGS</StatusLine>
    </Phone>
  );
}

function PublicWaiting({ view, seconds, isPhone, title }: { view: PublicView; seconds: number; isPhone: boolean; title: string }) {
  const sub = `${view.online} playing · next mix: ${mixLabel(nextMix(view))}`;
  if (isPhone) {
    return (
      <Phone>
        <PhoneTopRow context={`PUBLIC · SET ${view.set + (view.phase === 'playing' ? 0 : 1)}`} status="stop" />
        <div className="error-box">
          <p className="error-box__title display">{title}</p>
          <p>{sub}</p>
          <p className="sound-note">♪ Turn your volume up. The music plays on this phone.</p>
        </div>
        <StatusLine>NONSTOP SETS · CLEAN SONGS</StatusLine>
      </Phone>
    );
  }
  return (
    <TvStage>
      <TvHeader status="stop" context="PUBLIC" rightLabel="PLAYING" rightValue={String(view.online)} />
      <div className="tv-center">
        <p className="tv-center__title display">{title}</p>
        <p className="tv-center__sub">{sub}</p>
      </div>
      <SegmentTimer size="tv" label="SET" lit={timerSegments(seconds, 3)} value={pad2(seconds)} />
    </TvStage>
  );
}

function PublicResultsPhone({ view, you, initials, over, secondsToSet }: { view: PublicView; you: string; initials: string; over: GameOver; secondsToSet: number }) {
  const stats = over.you;
  const board = over.board;
  return (
    <Phone>
      <PhoneTopRow context={`PUBLIC · SET ${view.set}`} status="rew" />
      <PlayerCard label={`${view.online} PLAYING`} initials={initials} rightLabel="SET SCORE" rightValue={String(stats?.score ?? 0)} />
      {stats && (
        <div className="over-hero">
          <span className="over-hero__label">YOU PLACED</span>
          <span className="over-hero__rank display">{ordinal(stats.rank)}</span>
          <span className="over-hero__label">OF {view.online}</span>
        </div>
      )}
      {stats && <FinalStatGrid stats={stats} />}
      <ol className="final-board num" aria-label="Top of the board">
        {board.map((b) => (
          <li key={b.id} className={b.id === you ? 'final-board__row final-board__row--you' : 'final-board__row'}>
            <span>{b.rank}</span>
            <span>{b.initials}</span>
            <span>{b.score}</span>
          </li>
        ))}
      </ol>
      <StatusLine tone="time">
        NEXT SET IN {pad2(secondsToSet)} · {mixLabel(nextMix(view))}
      </StatusLine>
    </Phone>
  );
}

function PublicResultsDesktop({ view, you, over, secondsToSet }: { view: PublicView; you: string; over: GameOver; secondsToSet: number }) {
  const stats = over.you;
  const board = publicBoard(over.board, you);
  return (
    <TvStage>
      <TvHeader status="rew" context={`SET ${view.set}`} rightLabel="PLAYING" rightValue={String(view.online)} />
      <div className="tv-body">
        <div className="tv-main">
          <h1 className="over-tv__title display">SET OVER</h1>
          <p className="over-tv__summary">
            {stats ? `You placed ${ordinal(stats.rank)} of ${view.online} with ${stats.score}.` : 'Thanks for playing.'} Next up: {mixLabel(nextMix(view))}.
          </p>
          {stats && <FinalStatGrid stats={stats} />}
        </div>
        <HiScoreBox title="TOP 10" rows={board.rows} footer={board.footer} />
      </div>
      <SegmentTimer size="tv" label="NEXT SET" lit={timerSegments(secondsToSet, PUBLIC_INTERMISSION_MS / 1000)} value={pad2(secondsToSet)} />
    </TvStage>
  );
}

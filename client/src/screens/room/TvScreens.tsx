import { useEffect, type ReactNode } from 'react';
import { MIXES, MAX_PLAYERS, REVEAL_MS, type RoomView } from '@replay/shared';
import { TvHeader, TvStage } from '../../ui/frames';
import { AnswerTile, HiScoreBox, SegmentTimer, type AnswerState } from '../../ui/game';
import { pad2, timerSegments } from '../format';
import { RevealHero } from '../solo/SoloReveal';
import type { GameOver as GameOverMsg, Reveal, RoundStart } from '../../game/useSoloGame';
import { boardRows, inviteHost } from './board';

const mixLabel = (room: RoomView) => MIXES.find((m) => m.id === room.rules.mix)?.label ?? room.rules.mix;

/** Generic full-screen TV message: connecting, loading songs, room closed. */
export function TvMessage({ title, sub, code, footer }: { title: string; sub?: string; code?: string; footer?: ReactNode }) {
  return (
    <TvStage>
      <TvHeader status="stop" context="REPLAY" rightLabel={code ? 'ROOM CODE' : ''} rightValue={code ?? ''} />
      <div className="tv-center">
        <p className="tv-center__title display">{title}</p>
        {sub && <p className="tv-center__sub">{sub}</p>}
      </div>
      <div className="tv-footer">{footer}</div>
    </TvStage>
  );
}

/** Browsers block sound until a click or keypress, so the TV asks for one (PLAN.md §2). */
export function SoundGateTv({ room, onSoundOn }: { room: RoomView; onSoundOn: () => void }) {
  useEffect(() => {
    const go = () => onSoundOn();
    window.addEventListener('keydown', go);
    window.addEventListener('pointerdown', go);
    return () => {
      window.removeEventListener('keydown', go);
      window.removeEventListener('pointerdown', go);
    };
  }, [onSoundOn]);

  const steps = [
    { n: 1, text: 'Put this screen on the TV or laptop everyone can see', done: true },
    { n: 2, text: 'Connect a speaker and turn the volume up', done: true },
    { n: 3, text: 'Press any key to turn sound on and open the lobby', done: false },
  ];

  return (
    <TvStage>
      <TvHeader status="stop" context="SETUP" rightLabel="ROOM CODE" rightValue={room.code} />
      <div className="tv-body">
        <div className="tv-main tv-main--center">
          <div className="gate-hero">
            <svg aria-hidden="true" width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="var(--cyan)" strokeWidth="1.6" strokeLinecap="square">
              <path d="M4 9v6h4l5 4V5L8 9H4z" />
              <path d="M16.5 8.5a5 5 0 0 1 0 7" />
              <path d="M19 6a8.5 8.5 0 0 1 0 12" />
            </svg>
            <div className="gate-hero__text">
              <h1 className="gate-hero__title display">PRESS ANY KEY</h1>
              <p className="gate-hero__sub">This screen plays the music. Browsers need one click before sound can start.</p>
            </div>
          </div>
          <ol className="gate-steps">
            {steps.map((s) => (
              <li key={s.n} className={s.done ? 'gate-steps__item' : 'gate-steps__item gate-steps__item--now'}>
                <span className="display">{s.n}</span>
                {s.text}
              </li>
            ))}
          </ol>
        </div>
        <aside className="hiscore">
          <h2 className="hiscore__title display">PHONES</h2>
          <p className="tv-aside">Phones stay silent. They are the buttons.</p>
          <p className="tv-aside tv-aside--dim">Players join at</p>
          <p className="tv-aside tv-aside--link">{inviteHost()}</p>
          <p className="tv-aside tv-aside--dim">with code</p>
          <p className="tv-aside__code display">{room.code}</p>
          <p className="tv-aside tv-aside--dim">{room.players.length} joined so far</p>
        </aside>
      </div>
      <div className="tv-footer">
        <span>SOUND: OFF</span>
        <span className="tv-footer__cta display">CLICK OR PRESS ANY KEY</span>
      </div>
    </TvStage>
  );
}

export function LobbyTv({ room }: { room: RoomView }) {
  const slots = Array.from({ length: MAX_PLAYERS }, (_, i) => room.players.find((p) => p.slot === i + 1) ?? null);
  const open = MAX_PLAYERS - room.players.length;
  const rules = [
    { label: 'ROUNDS', value: String(room.rules.rounds) },
    { label: 'CLIP', value: `${room.rules.clipSeconds} SEC` },
    { label: 'MIX', value: mixLabel(room) },
    { label: 'SOUND', value: room.rules.sound === 'tv' ? 'TV' : 'PHONES' },
  ];

  return (
    <TvStage>
      <TvHeader status="stop" context="LOBBY" rightLabel="ROOM CODE" rightValue={room.code} />
      <div className="tv-body">
        <div className="tv-main tv-main--center">
          <div className="lobby-join">
            <span className="lobby-join__label">JOIN ON YOUR PHONE AT</span>
            <span className="lobby-join__url">{inviteHost()}</span>
          </div>
          <div className="lobby-code display">{room.code}</div>
          <div className="lobby-rules">
            {rules.map((r) => (
              <div className="lobby-rules__item" key={r.label}>
                <span>{r.label}</span>
                <span className="display">{r.value}</span>
              </div>
            ))}
          </div>
        </div>
        <section className="hiscore" aria-label="Players">
          <h2 className="hiscore__title display">
            PLAYERS {room.players.length}/{MAX_PLAYERS}
          </h2>
          <ol className="slots">
            {slots.map((p, i) => (
              <li key={i} className={p ? 'slots__row' : 'slots__row slots__row--empty'}>
                <span className="slots__slot">P{i + 1}</span>
                <span>{p ? p.initials : 'PRESS START'}</span>
                <span className={p?.id === room.hostId ? 'slots__tag slots__tag--host' : 'slots__tag slots__tag--ready'}>
                  {p?.id === room.hostId ? 'HOST' : p?.ready ? 'READY' : ''}
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>
      <div className="tv-footer">
        <span>{open > 0 ? `WAITING FOR PLAYERS · ${open} SLOT${open === 1 ? '' : 'S'} OPEN` : 'ROOM FULL'}</span>
        <span className="tv-footer__cta display">{room.hostId ? 'HOST: PRESS START' : 'FIRST PHONE IN IS THE HOST'}</span>
      </div>
    </TvStage>
  );
}

export function RevealTv({ room, round, reveal, secondsToNext }: { room: RoomView; round: RoundStart; reveal: Reveal; secondsToNext: number }) {
  const picked = new Set(Object.values(reveal.picks).flat());
  const noAnswer = reveal.board.map((b) => b.initials).filter((i) => !picked.has(i));
  const isLast = reveal.nextAt === null || round.index >= round.total;
  const stateFor = (letter: string): AnswerState => (letter === reveal.correct ? 'correct' : 'dimmed');

  return (
    <TvStage>
      <TvHeader status="pause" context={`ROUND ${pad2(round.index)} / ${round.total}`} rightLabel="ROOM CODE" rightValue={room.code} />
      <div className="tv-body">
        <div className="tv-main">
          <RevealHero reveal={reveal} />
          <div className="answer-grid answer-grid--compact">
            {round.options.map((option) => (
              <AnswerTile
                key={option.letter}
                option={option}
                state={stateFor(option.letter)}
                picks={reveal.picks[option.letter]}
                tag={option.letter === reveal.correct ? 'CORRECT' : undefined}
              />
            ))}
          </div>
          {noAnswer.length > 0 && <p className="tv-note">NO ANSWER: {noAnswer.join(' ')}</p>}
        </div>
        <HiScoreBox title="HI-SCORE" rows={boardRows(reveal.board, 'delta')} />
      </div>
      <SegmentTimer
        size="tv"
        label={isLast ? 'RESULTS' : 'NEXT'}
        lit={timerSegments(secondsToNext, REVEAL_MS / 1000)}
        value={pad2(secondsToNext)}
      />
    </TvStage>
  );
}

export function GameOverTv({ room, over }: { room: RoomView; over: GameOverMsg }) {
  const [first, second] = over.board;
  let summary: string;
  if (!first) summary = 'Nobody played.';
  else if (first.score === 0) summary = 'Nobody scored this time. Try another mix?';
  else if (second && second.score === first.score) summary = `${first.initials} and ${second.initials} tie at ${first.score}.`;
  else if (second) summary = `${first.initials} takes it with ${first.score}. ${second.initials} ${first.score - second.score} behind.`;
  else summary = `${first.initials} finishes with ${first.score}.`;
  const awards = [
    { label: 'BEST STREAK', who: over.awards.bestStreak?.initials, what: over.awards.bestStreak ? `x${over.awards.bestStreak.value} in a row` : null, tone: 'streak' },
    { label: 'FASTEST BUZZ', who: over.awards.fastest?.initials, what: over.awards.fastest ? `${(over.awards.fastest.ms / 1000).toFixed(1)} sec` : null, tone: 'code' },
    { label: 'MOST CORRECT', who: over.awards.mostCorrect?.initials, what: over.awards.mostCorrect ? `${over.awards.mostCorrect.count} of ${room.rules.rounds}` : null, tone: 'good' },
    { label: 'NOBODY GOT', who: null, what: over.awards.nobodyGot ? `${over.awards.nobodyGot.title} · ${over.awards.nobodyGot.artist}` : 'Every song got guessed', tone: 'time' },
  ];

  return (
    <TvStage>
      <TvHeader status="rew" context="FINAL" rightLabel="ROOM CODE" rightValue={room.code} />
      <div className="tv-body">
        <div className="tv-main">
          <h1 className="over-tv__title display">GAME OVER</h1>
          <p className="over-tv__summary">{summary}</p>
          <div className="awards">
            {awards.map((a) => (
              <div className="awards__item" key={a.label}>
                <span className="awards__label">{a.label}</span>
                <span className="awards__line">
                  {a.who && <span className={`display awards__who awards__who--${a.tone}`}>{a.who}</span>}
                  <span>{a.what ?? '–'}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
        <HiScoreBox title="HI-SCORE" rows={boardRows(over.board, 'streak').map((r) => ({ ...r, extra: undefined }))} />
      </div>
      <div className="tv-footer">
        <span>THANKS FOR PLAYING</span>
        <span className="tv-footer__cta display">HOST: PLAY AGAIN ON YOUR PHONE</span>
      </div>
    </TvStage>
  );
}

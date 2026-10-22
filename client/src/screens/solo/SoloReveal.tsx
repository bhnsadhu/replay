import { REVEAL_MS, type BoardEntry, type Letter, type YourResult } from '@replay/shared';
import { Phone, PhoneTopRow, PlayerCard, StatusLine, TvHeader, TvStage } from '../../ui/frames';
import { AnswerTile, SegmentTimer, type AnswerState } from '../../ui/game';
import { TrackCard } from '../../ui/controls';
import { Breakdown, Verdict } from '../../ui/result';
import { pad2, timerSegments } from '../format';
import type { Reveal, RoundStart } from '../../game/useSoloGame';
import { NO_RESULT, describeResult } from './breakdown';

interface Props {
  round: RoundStart;
  reveal: Reveal;
  streakBefore: number;
  secondsToNext: number;
}

interface PhoneProps extends Props {
  /** Top-left context. Defaults to solo. */
  context?: string;
  player?: { label: string; initials: string };
  /** Without a TV, phones show the top of the board (PLAN.md §2). */
  board?: BoardEntry[];
}

const revealSeconds = REVEAL_MS / 1000;

function tileState(letter: Letter, reveal: Reveal, you: YourResult): AnswerState {
  if (letter === reveal.correct) return 'correct';
  // Not 'picked': a picked D glows green, which would read as correct.
  if (letter === you.choice) return 'wrong';
  return 'dimmed';
}

export function SoloRevealDesktop({ round, reveal, streakBefore, secondsToNext }: Props) {
  const you = reveal.you ?? NO_RESULT;
  const { kind, rows, note } = describeResult(you, reveal.correct, round.options, streakBefore);
  const isLast = reveal.nextAt === null || round.index >= round.total;

  return (
    <TvStage>
      <TvHeader status="ff" context={`ROUND ${pad2(round.index)} / ${round.total}`} rightLabel="SCORE" rightValue={String(you.score)} />
      <div className="tv-body">
        <div className="tv-main">
          <RevealHero reveal={reveal} />
          <div className="answer-grid answer-grid--compact">
            {round.options.map((option) => (
              <AnswerTile
                key={option.letter}
                option={option}
                state={tileState(option.letter, reveal, you)}
                tag={option.letter === reveal.correct ? 'CORRECT' : option.letter === you.choice ? 'YOUR PICK' : undefined}
              />
            ))}
          </div>
        </div>
        <section className="hiscore result-box" aria-label="Your round">
          <h2 className="hiscore__title display">YOUR ROUND</h2>
          <Verdict kind={kind} points={you.points} />
          <Breakdown rows={rows} note={note} />
        </section>
      </div>
      <SegmentTimer size="tv" label={isLast ? 'RESULTS' : 'NEXT'} lit={timerSegments(secondsToNext, revealSeconds)} value={pad2(secondsToNext)} />
    </TvStage>
  );
}

export function RevealHero({ reveal }: { reveal: Reveal }) {
  return (
    <div className="reveal-hero glitch-in" data-letter={reveal.correct}>
      <span className="reveal-hero__letter display">{reveal.correct}</span>
      <div className="reveal-hero__text">
        <span className="reveal-hero__eyebrow">IT WAS</span>
        <span className="reveal-hero__title">{reveal.track.title}</span>
        <span className="reveal-hero__artist">
          {reveal.track.artist}
          {reveal.track.year ? ` · ${reveal.track.year}` : ''}
        </span>
      </div>
      <div className="reveal-hero__tracking" aria-hidden="true" />
    </div>
  );
}

export function SoloRevealPhone(props: PhoneProps) {
  const { round, reveal, streakBefore, secondsToNext, board } = props;
  const context = props.context ?? `SOLO · RND ${pad2(round.index)}`;
  const player = props.player ?? { label: 'SOLO', initials: 'YOU' };
  const you = reveal.you ?? NO_RESULT;
  const { kind, rows, note } = describeResult(you, reveal.correct, round.options, streakBefore);
  const isLast = reveal.nextAt === null || round.index >= round.total;

  return (
    <Phone>
      <PhoneTopRow context={context} status="ff" />
      <PlayerCard
        label={player.label}
        initials={player.initials}
        rightLabel={you.streak > 0 ? `STREAK x${you.streak}` : 'NO STREAK'}
        rightLabelTone={you.streak > 0 ? 'streak' : 'dim'}
        rightValue={String(you.score)}
      />
      <Verdict kind={kind} points={you.points} />
      <Breakdown rows={rows} note={note} />
      <div className="push-bottom">
        <TrackCard letter={reveal.correct} title={reveal.track.title} artist={reveal.track.artist} year={reveal.track.year ?? undefined} />
      </div>
      {board && <TopThree board={board} />}
      <StatusLine>{isLast ? `RESULTS IN ${pad2(secondsToNext)}` : `NEXT ROUND IN ${pad2(secondsToNext)}`}</StatusLine>
    </Phone>
  );
}

export function TopThree({ board }: { board: BoardEntry[] }) {
  return (
    <ol className="top-three num" aria-label="Top 3">
      {board.slice(0, 3).map((b) => (
        <li key={b.id} className={b.rank === 1 ? 'top-three__item top-three__item--leader' : 'top-three__item'}>
          {b.rank} {b.initials} {b.score}
        </li>
      ))}
    </ol>
  );
}

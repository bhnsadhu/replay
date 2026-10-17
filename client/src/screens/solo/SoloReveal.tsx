import { REVEAL_MS, type Letter } from '@replay/shared';
import { Phone, PhoneTopRow, PlayerCard, StatusLine, TvHeader, TvStage } from '../../ui/frames';
import { AnswerTile, SegmentTimer, type AnswerState } from '../../ui/game';
import { TrackCard } from '../../ui/controls';
import { Breakdown, Verdict } from '../../ui/result';
import { pad2, timerSegments } from '../format';
import type { Reveal, RoundStart } from '../../game/useSoloGame';
import { describeResult } from './breakdown';

interface Props {
  round: RoundStart;
  reveal: Reveal;
  streakBefore: number;
  secondsToNext: number;
}

const revealSeconds = REVEAL_MS / 1000;

function tileState(letter: Letter, reveal: Reveal): AnswerState {
  if (letter === reveal.correct) return 'correct';
  if (letter === reveal.you.choice) return 'picked';
  return 'dimmed';
}

export function SoloRevealDesktop({ round, reveal, streakBefore, secondsToNext }: Props) {
  const { kind, rows, note } = describeResult(reveal, round.options, streakBefore);
  const isLast = reveal.nextAt === null || round.index >= round.total;

  return (
    <TvStage>
      <TvHeader status="pause" context={`ROUND ${pad2(round.index)} / ${round.total}`} rightLabel="SCORE" rightValue={String(reveal.you.score)} />
      <div className="tv-body">
        <div className="tv-main">
          <div className="reveal-hero" data-letter={reveal.correct}>
            <span className="reveal-hero__letter display">{reveal.correct}</span>
            <div className="reveal-hero__text">
              <span className="reveal-hero__eyebrow">IT WAS</span>
              <span className="reveal-hero__title">{reveal.track.title}</span>
              <span className="reveal-hero__artist">{reveal.track.artist}</span>
            </div>
            <div className="reveal-hero__tracking" aria-hidden="true" />
          </div>
          <div className="answer-grid answer-grid--compact">
            {round.options.map((option) => (
              <AnswerTile key={option.letter} option={option} state={tileState(option.letter, reveal)} />
            ))}
          </div>
        </div>
        <section className="hiscore result-box" aria-label="Your round">
          <h2 className="hiscore__title display">YOUR ROUND</h2>
          <Verdict kind={kind} points={reveal.you.points} />
          <Breakdown rows={rows} note={note} />
        </section>
      </div>
      <SegmentTimer
        size="tv"
        label={isLast ? 'RESULTS' : 'NEXT'}
        lit={timerSegments(secondsToNext, revealSeconds)}
        value={pad2(secondsToNext)}
      />
    </TvStage>
  );
}

export function SoloRevealPhone({ round, reveal, streakBefore, secondsToNext }: Props) {
  const { kind, rows, note } = describeResult(reveal, round.options, streakBefore);
  const isLast = reveal.nextAt === null || round.index >= round.total;

  return (
    <Phone>
      <PhoneTopRow context={`SOLO · RND ${pad2(round.index)}`} status="pause" />
      <PlayerCard
        label="SOLO"
        initials="YOU"
        rightLabel={reveal.you.streak > 0 ? `STREAK x${reveal.you.streak}` : 'NO STREAK'}
        rightLabelTone={reveal.you.streak > 0 ? 'streak' : 'dim'}
        rightValue={String(reveal.you.score)}
      />
      <Verdict kind={kind} points={reveal.you.points} />
      <Breakdown rows={rows} note={note} />
      <div className="push-bottom">
        <TrackCard letter={reveal.correct} title={reveal.track.title} artist={reveal.track.artist} year={reveal.track.year ?? undefined} />
      </div>
      <StatusLine>{isLast ? `RESULTS IN ${pad2(secondsToNext)}` : `NEXT ROUND IN ${pad2(secondsToNext)}`}</StatusLine>
    </Phone>
  );
}

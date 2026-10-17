import type { AnswerOption } from '@replay/shared';
import { TvHeader, TvStage } from '../ui/frames';
import { AnswerTile, HiScoreBox, SegmentTimer, Waveform, waveformBars, type ScoreRow } from '../ui/game';
import { pad2, timerSegments } from './format';

export interface RoundTvProps {
  roomCode: string;
  roundIndex: number;
  roundCount: number;
  options: AnswerOption[];
  lockedIn: number;
  playerCount: number;
  secondsLeft: number;
  clipSeconds: number;
  board: ScoreRow[];
}

const BARS = waveformBars(56);

export function RoundTv(props: RoundTvProps) {
  const { roomCode, roundIndex, roundCount, options, lockedIn, playerCount, secondsLeft, clipSeconds, board } = props;
  const progress = 1 - secondsLeft / clipSeconds;

  return (
    <TvStage>
      <TvHeader status="play" context={`ROUND ${pad2(roundIndex)} / ${roundCount}`} rightLabel="ROOM CODE" rightValue={roomCode} />
      <div className="tv-body">
        <div className="tv-main">
          <Waveform bars={BARS} progress={progress} />
          <div className="tv-question">
            <h1 className="display">WHAT'S THIS TRACK?</h1>
            <span className="tv-question__count">
              {lockedIn} / {playerCount} LOCKED IN
            </span>
          </div>
          <div className="answer-grid">
            {options.map((option) => (
              <AnswerTile key={option.letter} option={option} state="idle" />
            ))}
          </div>
        </div>
        <HiScoreBox title="HI-SCORE" rows={board} />
      </div>
      <SegmentTimer size="tv" label="TIME" lit={timerSegments(secondsLeft, clipSeconds)} value={pad2(secondsLeft)} />
    </TvStage>
  );
}

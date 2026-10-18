import { useEffect, type ReactNode } from 'react';
import { LETTERS, type Letter } from '@replay/shared';
import { TvHeader, TvStage } from '../../ui/frames';
import { AnswerTile, SegmentTimer, Waveform, waveformBars, type AnswerState } from '../../ui/game';
import { StatBox } from '../../ui/result';
import { pad2, timerSegments } from '../format';
import type { RoundStart } from '../../game/useSoloGame';

const BARS = waveformBars(56);
const KEYS: Record<string, Letter> = { '1': 'A', '2': 'B', '3': 'C', '4': 'D', a: 'A', b: 'B', c: 'C', d: 'D' };

interface Props {
  round: RoundStart;
  picked: Letter | null;
  secondsLeft: number;
  progress: number;
  score: number;
  streak: number;
  onPick: (letter: Letter) => void;
  /** Header right side. Defaults to the score. */
  right?: { label: string; value: string };
  /** Side panel. Defaults to the solo stats box. */
  aside?: ReactNode;
}

export function SoloRoundDesktop({ round, picked, secondsLeft, progress, score, streak, onPick, right, aside }: Props) {
  const clipSeconds = round.durationMs / 1000;

  useEffect(() => {
    if (picked) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const letter = KEYS[e.key.toLowerCase()];
      if (letter) onPick(letter);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [picked, onPick]);

  const stateFor = (letter: Letter): AnswerState => (picked === null ? 'idle' : picked === letter ? 'picked' : 'dimmed');

  return (
    <TvStage>
      <TvHeader status="play" context={`ROUND ${pad2(round.index)} / ${round.total}`} rightLabel={right?.label ?? 'SCORE'} rightValue={right?.value ?? String(score)} />
      <div className="tv-body">
        <div className="tv-main">
          <Waveform bars={BARS} progress={progress} />
          <div className="tv-question">
            <h1 className="display">WHAT'S THIS TRACK?</h1>
            <span className="tv-question__count">{picked ? `LOCKED IN: ${picked}` : 'CLICK OR PRESS 1-4'}</span>
          </div>
          <div className="answer-grid">
            {round.options.map((option, i) => (
              <AnswerTile
                key={option.letter}
                option={option}
                state={stateFor(option.letter)}
                keyHint={String(i + 1)}
                onPick={picked ? undefined : onPick}
              />
            ))}
          </div>
        </div>
        {aside ?? (
        <StatBox
          title="SOLO"
          rows={[
            { label: 'SCORE', value: String(score), tone: 'score' },
            { label: 'STREAK', value: streak > 0 ? `x${streak}` : '-', tone: 'streak' },
            { label: 'ROUND', value: `${round.index} / ${round.total}` },
            { label: 'KEYS', value: LETTERS.map((l, i) => `${i + 1}=${l}`).join(' ') },
          ]}
        />
        )}
      </div>
      <SegmentTimer size="tv" label="TIME" lit={timerSegments(secondsLeft, clipSeconds)} value={pad2(secondsLeft)} />
    </TvStage>
  );
}

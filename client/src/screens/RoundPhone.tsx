import type { ReactNode } from 'react';
import type { AnswerOption, Letter } from '@replay/shared';
import { Phone, PhoneTopRow, PlayerCard, StatusLine } from '../ui/frames';
import { AnswerButton, SegmentTimer, type AnswerState } from '../ui/game';
import { isUrgent, timerSegments } from './format';

export interface RoundPhoneProps {
  /** Top-left context, e.g. "WXQK · RND 04" or "SOLO · RND 04". */
  context: string;
  player: { label: string; initials: string; score: number; streak: number };
  options: AnswerOption[];
  picked: Letter | null;
  secondsLeft: number;
  clipSeconds: number;
  onPick: (letter: Letter) => void;
  onOptions?: () => void;
  /** The clip hasn't started yet: answers are locked for a moment. */
  waiting?: boolean;
  /** Extra content under the answers, e.g. the public top-3 strip. */
  footer?: ReactNode;
}

export function RoundPhone(props: RoundPhoneProps) {
  const { context, player, options, picked, secondsLeft, clipSeconds, onPick, onOptions, waiting = false, footer } = props;

  const stateFor = (letter: Letter): AnswerState => {
    if (picked === null) return 'idle';
    return picked === letter ? 'picked' : 'dimmed';
  };

  return (
    <Phone>
      <PhoneTopRow context={context} status="play" statusText={`${secondsLeft}s`} onOptions={onOptions} />
      <PlayerCard
        label={player.label}
        initials={player.initials}
        rightLabel={player.streak > 0 ? `STREAK x${player.streak}` : 'NO STREAK'}
        rightLabelTone={player.streak > 0 ? 'streak' : 'dim'}
        rightValue={String(player.score)}
      />
      <SegmentTimer size="phone" lit={timerSegments(secondsLeft, clipSeconds)} urgent={!picked && isUrgent(secondsLeft)} />
      <div className="answer-list deal-in">
        {options.map((option) => (
          <AnswerButton key={option.letter} option={option} state={stateFor(option.letter)} onPick={picked || waiting ? undefined : onPick} />
        ))}
      </div>
      {footer}
      <StatusLine tone={picked ? 'good' : waiting ? 'time' : 'dim'}>{picked ? `LOCKED IN: ${picked}` : waiting ? 'GET READY…' : 'PRESS A BUTTON'}</StatusLine>
    </Phone>
  );
}

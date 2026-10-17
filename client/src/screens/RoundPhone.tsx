import type { AnswerOption, Letter } from '@replay/shared';
import { Phone, PhoneTopRow, PlayerCard, StatusLine } from '../ui/frames';
import { AnswerButton, SegmentTimer, type AnswerState } from '../ui/game';
import { timerSegments } from './format';

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
}

export function RoundPhone(props: RoundPhoneProps) {
  const { context, player, options, picked, secondsLeft, clipSeconds, onPick, onOptions } = props;

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
      <SegmentTimer size="phone" lit={timerSegments(secondsLeft, clipSeconds)} />
      <div className="answer-list">
        {options.map((option) => (
          <AnswerButton key={option.letter} option={option} state={stateFor(option.letter)} onPick={picked ? undefined : onPick} />
        ))}
      </div>
      <StatusLine tone={picked ? 'good' : 'dim'}>{picked ? `LOCKED IN: ${picked}` : 'PRESS A BUTTON'}</StatusLine>
    </Phone>
  );
}

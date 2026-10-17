import type { AnswerOption, Letter } from '@replay/shared';
import { Phone, PhoneTopRow, PlayerCard, StatusLine } from '../ui/frames';
import { AnswerButton, SegmentTimer, type AnswerState } from '../ui/game';
import { pad2, timerSegments } from './format';

export interface RoundPhoneProps {
  roomCode: string;
  roundIndex: number;
  player: { slot: number; initials: string; score: number; streak: number };
  options: AnswerOption[];
  picked: Letter | null;
  secondsLeft: number;
  clipSeconds: number;
  onPick: (letter: Letter) => void;
  onOptions?: () => void;
}

export function RoundPhone(props: RoundPhoneProps) {
  const { roomCode, roundIndex, player, options, picked, secondsLeft, clipSeconds, onPick, onOptions } = props;

  const stateFor = (letter: Letter): AnswerState => {
    if (picked === null) return 'idle';
    return picked === letter ? 'picked' : 'dimmed';
  };

  return (
    <Phone>
      <PhoneTopRow context={`${roomCode} · RND ${pad2(roundIndex)}`} status="play" statusText={`${secondsLeft}s`} onOptions={onOptions} />
      <PlayerCard
        label={`PLAYER ${player.slot}`}
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

import { MIXES, type MixId } from '@replay/shared';
import { Phone, PhoneTopRow, StatusLine } from '../../ui/frames';
import type { GameOver } from '../../game/useSoloGame';

interface Props {
  over: GameOver;
  mix: MixId;
  onReplay: () => void;
  onMenu: () => void;
}

export function SoloOver({ over, mix, onReplay, onMenu }: Props) {
  const mixLabel = MIXES.find((m) => m.id === mix)?.label ?? mix;
  const stats = [
    { label: 'CORRECT', value: `${over.correctCount}/${over.total}`, tone: 'good' },
    { label: 'BEST STREAK', value: over.bestStreak > 0 ? `x${over.bestStreak}` : '-', tone: 'streak' },
    { label: 'FASTEST', value: over.fastestMs === null ? '-' : `${(over.fastestMs / 1000).toFixed(1)}s`, tone: 'time' },
    { label: 'MIX', value: mixLabel, tone: 'code' },
  ];

  return (
    <Phone>
      <PhoneTopRow context="SOLO · FINAL" status="rew" />
      <div className="over-hero">
        <h1 className="over-hero__title display">GAME OVER</h1>
        <span className="over-hero__label">FINAL SCORE</span>
        <span className="over-hero__score display num">{over.score}</span>
      </div>
      <dl className="over-stats">
        {stats.map((s) => (
          <div className="over-stats__item" key={s.label}>
            <dt>{s.label}</dt>
            <dd className={`display over-stats__value--${s.tone}`}>{s.value}</dd>
          </div>
        ))}
      </dl>
      <div className="over-actions">
        <button type="button" className="primary-button display" onClick={onReplay}>
          REPLAY?
        </button>
        <button type="button" className="secondary-button" onClick={onMenu}>
          CHANGE MIX
        </button>
      </div>
      <StatusLine>MAX POSSIBLE 17500</StatusLine>
    </Phone>
  );
}

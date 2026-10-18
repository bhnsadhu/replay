import { MIXES, type FinalStats, type MixId } from '@replay/shared';
import { Phone, PhoneTopRow, StatusLine, RewindSweep } from '../../ui/frames';
import { ShareButton } from '../../ui/share';

interface Props {
  stats: FinalStats;
  mix: MixId;
  onReplay: () => void;
  onMenu: () => void;
}

export function FinalStatGrid({ stats, mix }: { stats: FinalStats; mix?: MixId }) {
  const mixLabel = mix ? (MIXES.find((m) => m.id === mix)?.label ?? mix) : null;
  const items = [
    { label: 'CORRECT', value: `${stats.correctCount}/${stats.total}`, tone: 'good' },
    { label: 'BEST STREAK', value: stats.bestStreak > 0 ? `x${stats.bestStreak}` : '-', tone: 'streak' },
    { label: 'FASTEST', value: stats.fastestMs === null ? '-' : `${(stats.fastestMs / 1000).toFixed(1)}s`, tone: 'time' },
    mixLabel ? { label: 'MIX', value: mixLabel, tone: 'code' } : { label: 'RANK', value: `#${stats.rank}`, tone: 'code' },
  ];
  return (
    <dl className="over-stats">
      {items.map((s) => (
        <div className="over-stats__item" key={s.label}>
          <dt>{s.label}</dt>
          <dd className={`display over-stats__value--${s.tone}`}>{s.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SoloOver({ stats, mix, onReplay, onMenu }: Props) {
  return (
    <Phone>
      <PhoneTopRow context="SOLO · FINAL" status="rew" />
      <RewindSweep />
      <div className="over-hero">
        <h1 className="over-hero__title display">GAME OVER</h1>
        <span className="over-hero__label">FINAL SCORE</span>
        <span className="over-hero__score display num">{stats.score}</span>
      </div>
      <FinalStatGrid stats={stats} mix={mix} />
      <div className="over-actions">
        <button type="button" className="primary-button display" onClick={onReplay}>
          REPLAY?
        </button>
        <button type="button" className="secondary-button" onClick={onMenu}>
          CHANGE MIX
        </button>
        <ShareButton card={{ context: `SOLO · ${MIXES.find((m) => m.id === mix)?.label ?? mix}`, initials: 'YOU', stats }} />
      </div>
      <StatusLine>MAX POSSIBLE 17500</StatusLine>
    </Phone>
  );
}

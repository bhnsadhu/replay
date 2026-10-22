import type { ReactNode } from 'react';
import { useCountUp } from './motion';

export type VerdictKind = 'correct' | 'wrong' | 'none';

const WORDS: Record<VerdictKind, string> = {
  correct: 'CORRECT!',
  wrong: 'MISSED',
  none: "TIME'S UP",
};

/** Big result word plus the points gained this round. */
export function Verdict({ kind, points }: { kind: VerdictKind; points: number }) {
  const shown = useCountUp(points);
  return (
    <div className="verdict">
      <span className={`verdict__word verdict__word--${kind} display`}>{WORDS[kind]}</span>
      <span className={points > 0 ? 'verdict__points display num' : 'verdict__points verdict__points--zero display num'}>
        +{shown}
      </span>
    </div>
  );
}

export interface BreakdownRow {
  label: ReactNode;
  value: ReactNode;
  tone?: 'normal' | 'streak';
}

/** Label/value rows explaining the points (base, speed, streak) or what went wrong. */
export function Breakdown({ rows, note }: { rows: BreakdownRow[]; note?: string }) {
  return (
    <div className="breakdown">
      <dl className="breakdown__rows num">
        {rows.map((row, i) => (
          <div className="breakdown__row" key={i}>
            <dt>{row.label}</dt>
            <dd className={row.tone === 'streak' ? 'breakdown__value--streak' : undefined}>{row.value}</dd>
          </div>
        ))}
      </dl>
      {note && <p className="breakdown__note">{note}</p>}
    </div>
  );
}

/** Small boxed list of label/value pairs, styled like the HI-SCORE box. */
export function StatBox({ title, rows }: { title: string; rows: { label: string; value: string; tone?: 'score' | 'streak' | 'good' }[] }) {
  return (
    <section className="hiscore" aria-label={title}>
      <h2 className="hiscore__title display">{title}</h2>
      <dl className="stat-box num">
        {rows.map((row) => (
          <div className="stat-box__row" key={row.label}>
            <dt>{row.label}</dt>
            <dd className={row.tone ? `stat-box__value--${row.tone}` : undefined}>{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

import type { AnswerOption, Letter } from '@replay/shared';

export type AnswerState = 'idle' | 'picked' | 'dimmed' | 'correct';

interface AnswerButtonProps {
  option: AnswerOption;
  state: AnswerState;
  onPick?: (letter: Letter) => void;
}

/** Phone / desktop answer: a big arcade button with the letter in a round cap. */
export function AnswerButton({ option, state, onPick }: AnswerButtonProps) {
  return (
    <button
      type="button"
      className={`answer-button answer-button--${state}`}
      data-letter={option.letter}
      aria-pressed={state === 'picked'}
      onClick={() => onPick?.(option.letter)}
    >
      <span className="answer-button__cap display">{option.letter}</span>
      <span className="answer-button__text">
        <span className="answer-button__title">{option.title}</span>
        <span className="answer-button__artist">{option.artist}</span>
      </span>
    </button>
  );
}

interface AnswerTileProps {
  option: AnswerOption;
  state: AnswerState;
  /** Desktop only: keyboard shortcut shown on the tile. */
  keyHint?: string;
  /** Reveal on the TV: initials of who picked this, shown instead of the artist. */
  picks?: string[];
  /** Short label on the right, e.g. "CORRECT". */
  tag?: string;
  onPick?: (letter: Letter) => void;
}

/** TV / desktop answer tile with a neon border in the answer color. */
export function AnswerTile({ option, state, keyHint, picks, tag, onPick }: AnswerTileProps) {
  const content = (
    <>
      <span className="answer-tile__letter display">{option.letter}</span>
      <span className="answer-tile__text">
        <span className="answer-tile__title">{option.title}</span>
        {picks ? (
          <span className="answer-tile__picks">{picks.length > 0 ? picks.join('  ') : '–'}</span>
        ) : (
          <span className="answer-tile__artist">{option.artist}</span>
        )}
      </span>
      {keyHint && <span className="answer-tile__key">{keyHint}</span>}
      {tag && <span className="answer-tile__tag">{tag}</span>}
    </>
  );

  const className = `answer-tile answer-tile--${state}`;
  if (!onPick) {
    return (
      <div className={className} data-letter={option.letter}>
        {content}
      </div>
    );
  }
  return (
    <button
      type="button"
      className={className}
      data-letter={option.letter}
      aria-pressed={state === 'picked'}
      onClick={() => onPick(option.letter)}
    >
      {content}
    </button>
  );
}

interface SegmentTimerProps {
  /** Seconds (or segments) remaining, out of `total`. */
  lit: number;
  total?: number;
  size: 'tv' | 'phone';
  label?: string;
  value?: string;
}

export function SegmentTimer({ lit, total = 20, size, label, value }: SegmentTimerProps) {
  return (
    <div className={`timer timer--${size}`} role="timer" aria-label={value ? `${value} seconds left` : undefined}>
      {label && <span className="timer__label">{label}</span>}
      <div className="timer__bar">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={i < lit ? 'timer__seg timer__seg--on' : 'timer__seg'} />
        ))}
      </div>
      {value && <span className="timer__value display num">{value}</span>}
    </div>
  );
}

/** Fake but stable waveform heights for the "now playing" visual. */
export function waveformBars(count: number): number[] {
  return Array.from({ length: count }, (_, i) =>
    10 + Math.round(Math.abs(Math.sin(i * 0.61) * Math.cos(i * 0.19)) * 80),
  );
}

export function Waveform({ bars, progress }: { bars: number[]; progress: number }) {
  const played = Math.round(bars.length * progress);
  return (
    <div className="waveform" aria-hidden="true">
      {bars.map((h, i) => (
        <span key={i} className={i < played ? 'waveform__bar waveform__bar--on' : 'waveform__bar'} style={{ height: h }} />
      ))}
    </div>
  );
}

export interface ScoreRow {
  rank: number;
  initials: string;
  score: number;
  /** Streak ("x4") or score change ("+1460"). */
  extra?: string;
  extraTone?: 'streak' | 'gain' | 'dim';
  tone?: 'leader' | 'normal' | 'dim' | 'you';
}

export function HiScoreBox({ title, rows, footer }: { title: string; rows: ScoreRow[]; footer?: ScoreRow }) {
  return (
    <section className="hiscore" aria-label={title}>
      <h2 className="hiscore__title display">{title}</h2>
      <ol className="hiscore__rows">
        {rows.map((row) => (
          <HiScoreRow key={row.rank} row={row} />
        ))}
      </ol>
      {footer && (
        <ol className="hiscore__rows hiscore__rows--footer" start={footer.rank}>
          <HiScoreRow row={{ ...footer, tone: 'you' }} />
        </ol>
      )}
    </section>
  );
}

function HiScoreRow({ row }: { row: ScoreRow }) {
  return (
    <li className={`hiscore__row hiscore__row--${row.tone ?? 'normal'} num`}>
      <span>{row.rank}</span>
      <span>{row.initials}</span>
      <span className="hiscore__score">{row.score}</span>
      <span className={`hiscore__extra hiscore__extra--${row.extraTone ?? 'dim'}`}>{row.extra ?? ''}</span>
    </li>
  );
}

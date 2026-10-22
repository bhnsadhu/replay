import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { vhsGlyph, vhsWord, type VhsStatus } from './vhs';
import { useOpenOptions } from './optionsContext';

export function Scanlines() {
  return <div className="scanlines" aria-hidden="true" />;
}

export function Logo({ size = 'tv' }: { size?: 'tv' | 'phone' }) {
  return <div className={`logo logo--${size} display`}>REPLAY</div>;
}

/** Scales the fixed 1280×720 TV layout to fit its container, letterboxed. */
export function TvStage({ children }: { children: ReactNode }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const fit = () => setScale(Math.min(el.clientWidth / 1280, el.clientHeight / 720));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="tv-stage" ref={stageRef}>
      <div className="tv" style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
        <Scanlines />
        {children}
      </div>
    </div>
  );
}

interface TvHeaderProps {
  status: VhsStatus;
  /** Second line under the status, e.g. "ROUND 04 / 10". */
  context: string;
  rightLabel: string;
  rightValue: string;
}

export function TvHeader({ status, context, rightLabel, rightValue }: TvHeaderProps) {
  return (
    <header className="tv-header">
      <div className="tv-header__side">
        <span className="tv-header__status">
          {vhsGlyph(status)} {vhsWord(status)} &nbsp;SP
        </span>
        <span>{context}</span>
      </div>
      <Logo />
      <div className="tv-header__side tv-header__side--right">
        <span>{rightLabel}</span>
        <span className="tv-header__code display">{rightValue}</span>
      </div>
    </header>
  );
}

export function Phone({ children }: { children: ReactNode }) {
  return (
    <div className="phone">
      <Scanlines />
      {children}
    </div>
  );
}

interface PhoneTopRowProps {
  context: string;
  status: VhsStatus;
  /** Replaces the status word, e.g. "12s" during a round. */
  statusText?: string;
  onOptions?: () => void;
}

export function PhoneTopRow({ context, status, statusText, onOptions }: PhoneTopRowProps) {
  const openOptions = useOpenOptions();
  const onGear = onOptions ?? openOptions ?? undefined;
  return (
    <div className="phone-top">
      <span>{context}</span>
      <span className="phone-top__right">
        <span className="phone-top__status">
          {vhsGlyph(status)} {statusText ?? vhsWord(status)}
        </span>
        {onGear && <OptionsButton onClick={onGear} />}
      </span>
    </div>
  );
}

export function OptionsButton({ onClick }: { onClick?: () => void }) {
  return (
    <button type="button" className="icon-button" aria-label="Options" onClick={onClick}>
      <GearIcon />
    </button>
  );
}

/** A pixel-art gear on a 16×16 grid: 8 teeth around a hole, so it can't be mistaken for a sun. */
export function GearIcon({ size = 20 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" fill="currentColor" shapeRendering="crispEdges">
      <path d="M6 0h4v3h-4zM2 2h2v1h-2zM12 2h2v1h-2zM2 3h12v1h-12zM3 4h10v1h-10zM3 5h3v1h-3zM10 5h3v1h-3zM0 6h5v4h-5zM11 6h5v4h-5zM3 10h3v1h-3zM10 10h3v1h-3zM3 11h10v1h-10zM2 12h12v1h-12zM2 13h2v1h-2zM12 13h2v1h-2zM6 13h4v3h-4z" />
    </svg>
  );
}

interface PlayerCardProps {
  label: string;
  initials: string;
  rightLabel: string;
  rightValue: string;
  /** Pink when the right label is a streak. */
  rightLabelTone?: 'dim' | 'streak' | 'host';
}

export function PlayerCard({ label, initials, rightLabel, rightValue, rightLabelTone = 'dim' }: PlayerCardProps) {
  return (
    <div className="player-card">
      <div className="player-card__col">
        <span className="player-card__label">{label}</span>
        <span className="display player-card__value">{initials}</span>
      </div>
      <div className="player-card__col player-card__col--right">
        <span className={`player-card__label player-card__label--${rightLabelTone}`}>{rightLabel}</span>
        <span className="display player-card__value player-card__value--score num">{rightValue}</span>
      </div>
    </div>
  );
}

export function StatusLine({ children, tone = 'dim' }: { children: ReactNode; tone?: 'dim' | 'good' | 'time' }) {
  return (
    // Not a live region: these often count down every second. Events are read out by ui/announce.ts.
    <p className={`status-line display status-line--${tone}`}>
      {children}
    </p>
  );
}

/** The ◀◀ REW sweep shown as a game ends (PLAN.md §8, M7). Hidden under Reduce effects. */
export function RewindSweep() {
  return (
    <div className="rewind" aria-hidden="true">
      <div className="rewind__band" />
      <span className="rewind__label display">◀◀ REW</span>
    </div>
  );
}

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
          {vhsGlyph(status)} {vhsWord(status)}
        </span>
        <span>{context}</span>
      </div>
      <Logo />
      <div className="tv-header__side tv-header__side--right">
        <span>{rightLabel}</span>
        {/* Keyed by value so a new score bumps. */}
        <span key={rightValue} className="tv-header__code display">
          {rightValue}
        </span>
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
  /** Shows the repository button beside the gear (home only). */
  repo?: boolean;
}

export function PhoneTopRow({ context, status, statusText, onOptions, repo = false }: PhoneTopRowProps) {
  const openOptions = useOpenOptions();
  const onGear = onOptions ?? openOptions ?? undefined;
  return (
    <div className="phone-top">
      <span>{context}</span>
      <span className="phone-top__right">
        <span className="phone-top__status">
          {vhsGlyph(status)} {statusText ?? vhsWord(status)}
        </span>
        {repo && <RepoButton />}
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

export const REPO_URL = 'https://github.com/bhnsadhu/replay';

/** The code behind the cabinet, beside the gear on the home screen. */
export function RepoButton({ className = '' }: { className?: string }) {
  return (
    <a className={`icon-button ${className}`.trim()} href={REPO_URL} target="_blank" rel="noreferrer" aria-label="Repository on GitHub" title="Repository on GitHub">
      <GitHubIcon />
    </a>
  );
}

/** GitHub's mark, in the gear's dim ink. */
export function GitHubIcon({ size = 18 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8" />
    </svg>
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
        {/* Keyed by text so a new streak or score bumps. */}
        <span key={rightLabel} className={`player-card__label player-card__label--${rightLabelTone}`}>
          {rightLabel}
        </span>
        <span key={rightValue} className="display player-card__value player-card__value--score num">
          {rightValue}
        </span>
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

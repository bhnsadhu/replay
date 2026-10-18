import type { Letter } from '@replay/shared';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Arcade-style three-letter initials entry with up/down arrows per slot. */
export function InitialsPicker({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const letters = value.padEnd(3, 'A').slice(0, 3).split('');

  const shift = (slot: number, delta: number) => {
    const current = ALPHABET.indexOf(letters[slot] ?? 'A');
    const next = letters.slice();
    next[slot] = ALPHABET[(current + delta + 26) % 26] ?? 'A';
    onChange(next.join(''));
  };

  return (
    <div className="initials" role="group" aria-label="Your initials">
      {letters.map((ch, slot) => (
        <div className="initials__slot" key={slot}>
          <button type="button" className="initials__arrow" aria-label={`Letter ${slot + 1} up`} onClick={() => shift(slot, -1)}>
            ▲
          </button>
          <span className="initials__letter display" aria-live="polite">
            {ch}
          </span>
          <button type="button" className="initials__arrow" aria-label={`Letter ${slot + 1} down`} onClick={() => shift(slot, 1)}>
            ▼
          </button>
        </div>
      ))}
    </div>
  );
}

interface StepperProps {
  label: string;
  value: string;
  onPrev: () => void;
  onNext: () => void;
}

export function Stepper({ label, value, onPrev, onNext }: StepperProps) {
  return (
    <div className="stepper">
      <span className="stepper__label">{label}</span>
      <button type="button" className="stepper__arrow" aria-label={`${label} previous`} onClick={onPrev}>
        ◀
      </button>
      <span className="stepper__value" aria-live="polite">
        {value}
      </span>
      <button type="button" className="stepper__arrow" aria-label={`${label} next`} onClick={onNext}>
        ▶
      </button>
    </div>
  );
}

interface ToggleProps {
  label: string;
  sub: string;
  on: boolean;
  onToggle: () => void;
}

export function Toggle({ label, sub, on, onToggle }: ToggleProps) {
  return (
    <button type="button" className="toggle" aria-pressed={on} onClick={onToggle}>
      <span className="toggle__text">
        <span className="toggle__label display">{label}</span>
        <span className="toggle__sub">{sub}</span>
      </span>
      <span className={on ? 'toggle__state toggle__state--on display' : 'toggle__state display'}>{on ? 'ON' : 'OFF'}</span>
    </button>
  );
}

interface TrackCardProps {
  letter: Letter;
  title: string;
  artist: string;
  year?: number;
}

/** The revealed song, with links to save it. */
export function TrackCard({ letter, title, artist, year }: TrackCardProps) {
  const query = encodeURIComponent(`${title} ${artist}`);
  return (
    <section className="track-card glitch-in" data-letter={letter} aria-label="The answer">
      <div className="track-card__head">
        <span className="track-card__cap display">{letter}</span>
        <span className="track-card__text">
          <span className="track-card__eyebrow">IT WAS</span>
          <span className="track-card__title">{title}</span>
          <span className="track-card__artist">
            {artist}
            {year ? ` · ${year}` : ''}
          </span>
        </span>
      </div>
      <div className="track-card__links">
        <a href={`https://open.spotify.com/search/${query}`} target="_blank" rel="noreferrer">
          + SPOTIFY
        </a>
        <a href={`https://music.apple.com/search?term=${query}`} target="_blank" rel="noreferrer">
          + APPLE MUSIC
        </a>
      </div>
    </section>
  );
}

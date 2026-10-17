import { useState } from 'react';
import type { Letter } from '@replay/shared';
import { RoundTv } from '../screens/RoundTv';
import { RoundPhone } from '../screens/RoundPhone';
import { SAMPLE_PLAYER, SAMPLE_ROUND } from './fixtures';

// Dev-only screen gallery. /dev shows every screen side by side;
// /dev/round-tv and /dev/round-phone render one screen full size (open those on a real TV or phone).

function RoundPhoneDemo() {
  const [picked, setPicked] = useState<Letter | null>(null);
  return (
    <RoundPhone
      roomCode={SAMPLE_ROUND.roomCode}
      roundIndex={SAMPLE_ROUND.roundIndex}
      player={SAMPLE_PLAYER}
      options={SAMPLE_ROUND.options}
      picked={picked}
      secondsLeft={SAMPLE_ROUND.secondsLeft}
      clipSeconds={SAMPLE_ROUND.clipSeconds}
      onPick={setPicked}
      onOptions={() => setPicked(null)}
    />
  );
}

const SCREENS = {
  'round-tv': { label: 'Round · TV', kind: 'tv', render: () => <RoundTv {...SAMPLE_ROUND} /> },
  'round-phone': { label: 'Round · Phone', kind: 'phone', render: () => <RoundPhoneDemo /> },
} as const;

type ScreenId = keyof typeof SCREENS;

export function Gallery({ path }: { path: string }) {
  const single = path.replace(/^\/dev\/?/, '') as ScreenId;
  const screen = SCREENS[single];
  if (screen) return screen.render();

  return (
    <div className="gallery">
      <header className="gallery__head">
        <span className="display">REPLAY · SCREENS</span>
        <EffectsToggle />
      </header>
      <div className="gallery__grid">
        {(Object.keys(SCREENS) as ScreenId[]).map((id) => {
          const { label, kind, render } = SCREENS[id];
          return (
            <figure key={id} className={`gallery__item gallery__item--${kind}`}>
              <figcaption>
                <a href={`/dev/${id}`}>{label} ↗</a>
              </figcaption>
              <div className="gallery__frame">{render()}</div>
            </figure>
          );
        })}
      </div>
    </div>
  );
}

function EffectsToggle() {
  const [off, setOff] = useState(false);
  const toggle = () => {
    const next = !off;
    setOff(next);
    document.documentElement.dataset.effects = next ? 'off' : 'on';
  };
  return (
    <button type="button" className="gallery__toggle" aria-pressed={off} onClick={toggle}>
      REDUCE EFFECTS: {off ? 'ON' : 'OFF'}
    </button>
  );
}

import { useState } from 'react';
import type { Letter } from '@replay/shared';
import { RoundTv } from '../screens/RoundTv';
import { RoundPhone } from '../screens/RoundPhone';
import { SoloRevealDesktop, SoloRevealPhone } from '../screens/solo/SoloReveal';
import { SoloOver } from '../screens/solo/SoloOver';
import { SAMPLE_GAME_OVER, SAMPLE_PLAYER, SAMPLE_REVEAL, SAMPLE_ROUND, SAMPLE_ROUND_START } from './fixtures';

// Dev-only screen gallery. /dev shows every screen side by side;
// /dev/round-tv and /dev/round-phone render one screen full size (open those on a real TV or phone).

function RoundPhoneDemo() {
  const [picked, setPicked] = useState<Letter | null>(null);
  return (
    <RoundPhone
      context={`${SAMPLE_ROUND.roomCode} · RND 04`}
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

const revealProps = { round: SAMPLE_ROUND_START, reveal: SAMPLE_REVEAL, streakBefore: 3, secondsToNext: 4 };
const missProps = {
  ...revealProps,
  reveal: {
    ...SAMPLE_REVEAL,
    you: { choice: 'A' as const, elapsedMs: 2100, points: 0, base: 0, speed: 0, streakBonus: 0, streak: 0, score: 5900 },
  },
};

const SCREENS = {
  'round-tv': { label: 'Round · TV', kind: 'tv', render: () => <RoundTv {...SAMPLE_ROUND} /> },
  'round-phone': { label: 'Round · Phone', kind: 'phone', render: () => <RoundPhoneDemo /> },
  'solo-reveal-desktop': { label: 'Solo reveal · Desktop', kind: 'tv', render: () => <SoloRevealDesktop {...revealProps} /> },
  'solo-reveal-phone': { label: 'Solo reveal · Phone', kind: 'phone', render: () => <SoloRevealPhone {...revealProps} /> },
  'solo-miss-phone': { label: 'Solo miss · Phone', kind: 'phone', render: () => <SoloRevealPhone {...missProps} /> },
  'solo-over': {
    label: 'Solo game over',
    kind: 'phone',
    render: () => <SoloOver stats={SAMPLE_GAME_OVER.you!} mix="80s" onReplay={() => undefined} onMenu={() => undefined} />,
  },
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

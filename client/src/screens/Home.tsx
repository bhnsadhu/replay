import { useState, type FormEvent } from 'react';
import { ROOM_CODE_ALPHABET } from '@replay/shared';
import { Logo, Phone, PhoneTopRow, StatusLine, TvHeader, TvStage } from '../ui/frames';
import { HiScoreBox } from '../ui/game';
import { useIsPhone } from '../game/clock';
import { useConnection } from '../net/useConnection';
import { navigate } from '../router';
import { usePublicStats } from '../game/usePublic';

const cleanCode = (raw: string): string =>
  raw
    .toUpperCase()
    .split('')
    .filter((ch) => ROOM_CODE_ALPHABET.includes(ch))
    .join('')
    .slice(0, 4);

function JoinForm({ size }: { size: 'tv' | 'phone' }) {
  const [code, setCode] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (code.length === 4) navigate(`/${code}`);
  };
  return (
    <form className={`join-form join-form--${size}`} onSubmit={submit}>
      <label htmlFor={`code-${size}`} className="sr-only">
        Room code
      </label>
      <input
        id={`code-${size}`}
        className="code-input display"
        value={code}
        onChange={(e) => setCode(cleanCode(e.target.value))}
        placeholder="____"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        inputMode="text"
      />
      <button type="submit" className="code-go display" disabled={code.length !== 4}>
        GO
      </button>
    </form>
  );
}

function useStatusText() {
  const { status, warmingUp } = useConnection();
  if (status === 'online') return { text: 'FREE PLAY', tone: 'good' as const };
  return warmingUp ? { text: 'WARMING UP THE CABINET…', tone: 'time' as const } : { text: 'CONNECTING…', tone: 'dim' as const };
}

function publicSub(online: number | null): string {
  if (online === null || online === 0) return 'Nobody on yet · start a set, others drop in';
  return `${online} playing now · nonstop sets of 10`;
}

function HomeTv() {
  const status = useStatusText();
  const { online, best } = usePublicStats();
  const steps = ['Host on a TV or laptop', 'Friends join on their phones', 'Guess the song before they do'];
  return (
    <TvStage>
      <TvHeader status="play" context="HOME" rightLabel="CABINET" rightValue="OPEN" />
      <div className="tv-body">
        <div className="tv-main">
          <div className="home-intro">
            <span className="home-intro__coin display">INSERT COIN</span>
            <span className="home-intro__sub">Guess the song before your friends do.</span>
          </div>
          <div className="tv-menu">
            <button type="button" className="tv-menu__item tv-menu__item--primary" onClick={() => navigate('/play')}>
              <span className="tv-menu__cursor display">▶</span>
              <span className="tv-menu__text">
                <span className="display">PLAY PUBLIC</span>
                <span className="tv-menu__sub">{publicSub(online)}</span>
              </span>
            </button>
            <button type="button" className="tv-menu__item" onClick={() => navigate('/host')}>
              <span className="tv-menu__cursor display">▶</span>
              <span className="tv-menu__text">
                <span className="display">HOST A ROOM HERE</span>
                <span className="tv-menu__sub">This screen shows the game and plays the music</span>
              </span>
            </button>
            <button type="button" className="tv-menu__item" onClick={() => navigate('/solo')}>
              <span className="tv-menu__cursor display">▶</span>
              <span className="tv-menu__text">
                <span className="display">PLAY SOLO</span>
                <span className="tv-menu__sub">10 rounds on your own</span>
              </span>
            </button>
            <div className="tv-menu__item tv-menu__item--static">
              <span className="tv-menu__cursor display">▶</span>
              <span className="tv-menu__text">
                <span className="display">JOIN WITH CODE</span>
                <span className="tv-menu__sub">Got a code from a friend?</span>
              </span>
              <JoinForm size="tv" />
            </div>
          </div>
        </div>
        {best.length > 0 ? (
          <HiScoreBox
            title="TODAY'S BEST"
            rows={best.map((b, i) => ({ rank: i + 1, initials: b.initials, score: b.score, tone: i === 0 ? 'leader' : i < 4 ? 'normal' : 'dim' }))}
          />
        ) : (
          <aside className="hiscore" aria-label="How it works">
            <h2 className="hiscore__title display">HOW TO PLAY</h2>
            <ol className="how-steps">
              {steps.map((s, i) => (
                <li key={s}>
                  <span className="display how-steps__n">{i + 1}</span>
                  {s}
                </li>
              ))}
            </ol>
          </aside>
        )}
      </div>
      <div className="tv-footer">
        <span>CLICK TO SELECT</span>
        <span className={`tv-footer__status tv-footer__status--${status.tone} display`}>{status.text}</span>
      </div>
    </TvStage>
  );
}

function HomePhone() {
  const status = useStatusText();
  const { online } = usePublicStats();
  const [joining, setJoining] = useState(false);
  return (
    <Phone>
      <PhoneTopRow context="HOME" status="play" />
      <div className="menu-hero">
        <Logo size="phone" />
        <span className="menu-hero__coin display">INSERT COIN</span>
      </div>
      <div className="menu-list">
        <button type="button" className="menu-item menu-item--two menu-item--on" onClick={() => navigate('/play')}>
          <span className="menu-item__cursor display">▶</span>
          <span className="menu-item__text">
            <span className="display">PLAY PUBLIC</span>
            <span className="menu-item__sub">{publicSub(online)}</span>
          </span>
        </button>
        <button type="button" className="menu-item menu-item--two" onClick={() => navigate('/solo')}>
          <span className="menu-item__cursor display">▶</span>
          <span className="menu-item__text">
            <span className="display">PLAY SOLO</span>
            <span className="menu-item__sub">10 rounds on your own</span>
          </span>
        </button>
        <button type="button" className="menu-item menu-item--two" onClick={() => navigate('/new')}>
          <span className="menu-item__cursor display">▶</span>
          <span className="menu-item__text">
            <span className="display">HOST A ROOM</span>
            <span className="menu-item__sub">Friends join on their phones · no TV needed</span>
          </span>
        </button>
        <button type="button" className={joining ? 'menu-item menu-item--two menu-item--on' : 'menu-item menu-item--two'} aria-expanded={joining} onClick={() => setJoining(true)}>
          <span className="menu-item__cursor display">▶</span>
          <span className="menu-item__text">
            <span className="display">JOIN WITH CODE</span>
            <span className="menu-item__sub">The code is on the TV or in the invite link</span>
          </span>
        </button>
        {joining && <JoinForm size="phone" />}
      </div>
      <StatusLine tone={status.tone}>{status.text}</StatusLine>
    </Phone>
  );
}

export function Home() {
  return useIsPhone() ? <HomePhone /> : <HomeTv />;
}

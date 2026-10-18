import { useRef, useState, type ReactNode } from 'react';
import { CLIP_CHOICES, MAX_PLAYERS, MIXES, ROUND_CHOICES, type MixId, type RoomRules, type RoomView } from '@replay/shared';
import { Logo, Phone, PhoneTopRow, PlayerCard, StatusLine } from '../../ui/frames';
import { InitialsPicker, Stepper } from '../../ui/controls';
import type { GameOver } from '../../game/useSoloGame';
import { FinalStatGrid } from '../solo/SoloOver';
import { inviteUrl, ordinal } from './board';
import { pad2 } from '../format';

const INITIALS_KEY = 'replay.initials';

export function savedInitials(): string {
  try {
    const v = window.localStorage.getItem(INITIALS_KEY);
    return v && /^[A-Z]{3}$/.test(v) ? v : 'AAA';
  } catch {
    return 'AAA';
  }
}

export function hasSavedInitials(): boolean {
  try {
    return /^[A-Z]{3}$/.test(window.localStorage.getItem(INITIALS_KEY) ?? '');
  } catch {
    return false;
  }
}

export function saveInitials(v: string): void {
  try {
    window.localStorage.setItem(INITIALS_KEY, v);
  } catch {
    // Private mode: initials just won't be remembered.
  }
}

/** Full-screen phone message: connecting, loading songs, removed from room. */
export function PhoneMessage({ context, title, children, action }: { context: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <Phone>
      <PhoneTopRow context={context} status="stop" />
      <div className="error-box">
        <p className="error-box__title display">{title}</p>
        {children}
      </div>
      {action}
    </Phone>
  );
}

interface JoinProps {
  /** Join an existing room, or create one from this phone. */
  mode: 'join' | 'create';
  code?: string;
  pending: boolean;
  error: string | null;
  onSubmit: (initials: string) => void;
}

export function JoinPhone({ mode, code, pending, error, onSubmit }: JoinProps) {
  const [initials, setInitials] = useState(savedInitials);
  const submit = () => {
    saveInitials(initials);
    onSubmit(initials);
  };

  return (
    <Phone>
      <PhoneTopRow context={mode === 'join' ? `JOIN ${code}` : 'NEW ROOM'} status="stop" />
      <div className="menu-hero">
        <Logo size="phone" />
        <span className="menu-hero__coin display">{mode === 'join' ? `ROOM ${code}` : 'HOST A ROOM'}</span>
      </div>
      <div className="join-body">
        <span className="menu-list__legend display">ENTER YOUR INITIALS</span>
        <InitialsPicker value={initials} onChange={setInitials} />
        <p className="join-body__hint">
          {mode === 'join' ? 'Your initials show on the TV and the HI-SCORE board.' : 'Friends join on their phones. No TV needed: every phone plays the music.'}
        </p>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button type="button" className="primary-button display" disabled={pending} onClick={submit}>
        {pending ? 'CONNECTING…' : mode === 'join' ? 'PRESS START' : 'OPEN ROOM'}
      </button>
      <StatusLine>{mode === 'join' ? 'JOINS THE LOBBY' : 'YOU WILL BE THE HOST'}</StatusLine>
    </Phone>
  );
}

interface LobbyProps {
  room: RoomView;
  you: string;
  onInitials: (v: string) => void;
  onReady: (ready: boolean) => void;
}

export function LobbyPhone({ room, you, onInitials, onReady }: LobbyProps) {
  const me = room.players.find((p) => p.id === you);
  const [initials, setInitials] = useState(me?.initials ?? savedInitials());
  if (!me) return null;

  const change = (v: string) => {
    setInitials(v);
    saveInitials(v);
    onInitials(v);
  };

  return (
    <Phone>
      <PhoneTopRow context={`${room.code} · LOBBY`} status="stop" />
      <PlayerCard label={`PLAYER ${me.slot}`} initials={me.initials} rightLabel="IN ROOM" rightValue={`${room.players.length}/${MAX_PLAYERS}`} />
      <div className="join-body">
        <span className="menu-list__legend display">YOUR INITIALS</span>
        <InitialsPicker value={initials} onChange={change} />
        <p className="join-body__hint">
          {me.initials !== initials ? `Taken, so you're ${me.initials} on the board.` : 'Your initials show on the TV and the HI-SCORE board.'}
        </p>
      </div>
      <button
        type="button"
        className={me.ready ? 'primary-button primary-button--done display' : 'primary-button display'}
        aria-pressed={me.ready}
        onClick={() => onReady(!me.ready)}
      >
        {me.ready ? 'READY!' : 'PRESS START'}
      </button>
      <StatusLine tone={me.ready ? 'good' : 'dim'}>{me.ready ? 'WAITING FOR THE HOST' : 'TAP WHEN READY'}</StatusLine>
    </Phone>
  );
}

interface HostProps {
  room: RoomView;
  you: string;
  error: string | null;
  onRules: (rules: RoomRules) => void;
  onKick: (playerId: string) => void;
  onStart: () => void;
}

function cycle<T>(list: readonly T[], current: T, dir: 1 | -1): T {
  const i = list.indexOf(current);
  return list[(i + dir + list.length) % list.length] ?? current;
}

export function HostPhone({ room, you, error, onRules, onKick, onStart }: HostProps) {
  const [copied, setCopied] = useState(false);
  const me = room.players.find((p) => p.id === you);
  const others = room.players.filter((p) => p.id !== you);
  // Only the host edits rules, so the last rules this phone sent are the truth. Building each
  // change on those (not on room.rules, which lags a round trip) keeps fast taps from undoing each other.
  const sentRules = useRef<RoomRules | null>(null);
  const [draft, setDraft] = useState<RoomRules | null>(null);
  const rules = draft ?? room.rules;
  const mixIds = MIXES.map((m) => m.id) as MixId[];
  const sounds = room.tvConnected ? (['tv', 'all'] as const) : (['all'] as const);
  const set = (patch: Partial<RoomRules>) => {
    const next = { ...(sentRules.current ?? room.rules), ...patch };
    sentRules.current = next;
    setDraft(next);
    onRules(next);
  };

  const needsTv = rules.sound === 'tv' && !room.tvReady;
  const ready = others.filter((p) => p.ready).length;

  const copy = () => {
    const url = inviteUrl(room.code);
    navigator.clipboard
      ?.writeText(url)
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  };

  return (
    <Phone>
      <PhoneTopRow context={`${room.code} · LOBBY`} status="stop" />
      <div className="player-card">
        <div className="player-card__col">
          <span className="player-card__label player-card__label--host">PLAYER {me?.slot ?? 1} · HOST</span>
          <span className="display player-card__value">{me?.initials}</span>
        </div>
        <button type="button" className="invite-button" aria-label={`Copy invite link for room ${room.code}`} onClick={copy}>
          <span className={copied ? 'player-card__label invite-button__done' : 'player-card__label'}>{copied ? 'COPIED' : 'INVITE'}</span>
          <span className="display invite-button__code">{room.code}</span>
        </button>
      </div>

      <div className="host-section">
        <span className="menu-list__legend display">RULES</span>
        <Stepper
          label="ROUNDS"
          value={String(rules.rounds)}
          onPrev={() => set({ rounds: cycle<number>(ROUND_CHOICES, rules.rounds, -1) })}
          onNext={() => set({ rounds: cycle<number>(ROUND_CHOICES, rules.rounds, 1) })}
        />
        <Stepper
          label="CLIP"
          value={`${rules.clipSeconds} SEC`}
          onPrev={() => set({ clipSeconds: cycle<number>(CLIP_CHOICES, rules.clipSeconds, -1) })}
          onNext={() => set({ clipSeconds: cycle<number>(CLIP_CHOICES, rules.clipSeconds, 1) })}
        />
        <Stepper
          label="MIX"
          value={MIXES.find((m) => m.id === rules.mix)?.label ?? rules.mix}
          onPrev={() => set({ mix: cycle(mixIds, rules.mix, -1) })}
          onNext={() => set({ mix: cycle(mixIds, rules.mix, 1) })}
        />
        <Stepper
          label="SOUND"
          value={rules.sound === 'tv' ? 'TV' : 'ALL PHONES'}
          onPrev={() => set({ sound: cycle(sounds, rules.sound, -1) })}
          onNext={() => set({ sound: cycle(sounds, rules.sound, 1) })}
        />
      </div>

      <div className="host-section host-section--grow">
        <span className="menu-list__legend display">
          PLAYERS {room.players.length}/{MAX_PLAYERS}
        </span>
        {others.length === 0 && <p className="join-body__hint">Nobody else yet. Tap the code above to share an invite link.</p>}
        <ul className="host-players">
          {others.map((p) => (
            <li key={p.id} className="host-players__row">
              <span className="host-players__slot">P{p.slot}</span>
              <span>{p.initials}</span>
              <span className={p.ready ? 'host-players__tag host-players__tag--ready' : 'host-players__tag'}>{p.ready ? 'READY' : 'NOT READY'}</span>
              <button type="button" className="host-players__kick" aria-label={`Remove ${p.initials}`} onClick={() => onKick(p.id)}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button type="button" className="primary-button display" disabled={needsTv} onClick={onStart}>
        {needsTv ? 'WAITING FOR TV' : 'START GAME'}
      </button>
      <StatusLine tone={needsTv ? 'time' : 'dim'}>
        {needsTv ? 'PRESS ANY KEY ON THE TV' : others.length === 0 ? 'YOU CAN ALSO PLAY ALONE' : `${ready} OF ${others.length} READY`}
      </StatusLine>
    </Phone>
  );
}

interface OverProps {
  room: RoomView;
  you: string;
  over: GameOver;
  voteSecondsLeft: number;
  onVote: (replay: boolean) => void;
  onBackToLobby: () => void;
}

export function GameOverPhone({ room, you, over, voteSecondsLeft, onVote, onBackToLobby }: OverProps) {
  const me = room.players.find((p) => p.id === you);
  const isHost = room.hostId === you;
  const voted = room.vote?.yes.includes(you) ?? false;
  const stats = over.you;
  const [first] = over.board;
  const tiedForLead = stats !== null && first !== undefined && stats.score === first.score;
  const rank = tiedForLead ? 1 : (stats?.rank ?? 1);
  let standing = 'TOP OF THE BOARD';
  if (stats && first && first.score === 0) standing = 'NOBODY SCORED THIS TIME';
  else if (tiedForLead && first?.id !== you) standing = `TIED WITH ${first?.initials}`;
  else if (stats && first && !tiedForLead) standing = `${first.score - stats.score} behind ${first.initials}`;

  return (
    <Phone>
      <PhoneTopRow context={`${room.code} · FINAL`} status="rew" />
      <PlayerCard label={`PLAYER ${me?.slot ?? '-'}`} initials={me?.initials ?? '???'} rightLabel="FINAL SCORE" rightValue={String(stats?.score ?? 0)} />
      {stats && (
        <div className="over-hero">
          <span className="over-hero__label">YOU PLACED</span>
          <span className="over-hero__rank display">{ordinal(rank)}</span>
          <span className="over-hero__label">{standing}</span>
        </div>
      )}
      {stats && <FinalStatGrid stats={stats} />}
      {room.rules.sound === 'all' && (
        <ol className="final-board num" aria-label="Final board">
          {over.board.map((b) => (
            <li key={b.id} className={b.id === you ? 'final-board__row final-board__row--you' : 'final-board__row'}>
              <span>{b.rank}</span>
              <span>{b.initials}</span>
              <span>{b.score}</span>
            </li>
          ))}
        </ol>
      )}
      <div className="over-actions">
        {room.vote ? (
          <>
            <button
              type="button"
              className={voted ? 'primary-button primary-button--done display' : 'primary-button display'}
              aria-pressed={voted}
              onClick={() => onVote(!voted)}
            >
              {voted ? 'VOTED!' : 'REPLAY?'}
            </button>
            <StatusLine tone={voted ? 'good' : 'time'}>
              {room.vote.yes.length}/{room.vote.total} VOTED · {pad2(voteSecondsLeft)}
            </StatusLine>
          </>
        ) : (
          <StatusLine>WAITING FOR THE HOST</StatusLine>
        )}
        {isHost && (
          <button type="button" className="secondary-button" onClick={onBackToLobby}>
            BACK TO LOBBY
          </button>
        )}
      </div>
    </Phone>
  );
}

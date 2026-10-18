import { useConnection } from '../net/useConnection';

interface Props {
  /** Only nag about the connection once the player is actually in a game or room. */
  inGame: boolean;
  /** The browser blocked sound (e.g. after a reload): one tap brings it back. */
  needsSoundTap: boolean;
  onTapSound: () => void;
}

/** Fixed banners over any game screen: RECONNECTING… and TAP FOR SOUND (PLAN.md §5). */
export function ConnectionBanners({ inGame, needsSoundTap, onTapSound }: Props) {
  const { status } = useConnection();
  const reconnecting = inGame && status !== 'online';
  if (!reconnecting && !needsSoundTap) return null;
  return (
    <div className="banners" role="status">
      {reconnecting && <p className="banner banner--warn display">RECONNECTING…</p>}
      {needsSoundTap && !reconnecting && (
        <button type="button" className="banner banner--action display" onClick={onTapSound}>
          ♪ TAP FOR SOUND
        </button>
      )}
    </div>
  );
}

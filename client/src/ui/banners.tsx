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
  const { status, warmingUp } = useConnection();
  const reconnecting = inGame && status !== 'online';
  // Before joining: the free server naps when nobody's around and takes up to a minute to wake.
  const waking = !inGame && warmingUp;
  if (!reconnecting && !waking && !needsSoundTap) return null;
  return (
    <div className="banners" role="status">
      {reconnecting && <p className="banner banner--warn display">RECONNECTING…</p>}
      {waking && <p className="banner banner--warn display">WAKING THE SERVER · UP TO A MINUTE</p>}
      {needsSoundTap && !reconnecting && !waking && (
        <button type="button" className="banner banner--action display" onClick={onTapSound}>
          ♪ TAP FOR SOUND
        </button>
      )}
    </div>
  );
}

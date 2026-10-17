import { useEffect, useSyncExternalStore } from 'react';
import { useNow } from '../game/clock';
import { connection, type ConnectionStatus } from './connection';

/** How long to wait before telling the player the server is waking up. */
const WARM_UP_AFTER_MS = 1500;

/** Connection status, plus whether we've been waiting long enough to call it "warming up". */
export function useConnection(): { status: ConnectionStatus; warmingUp: boolean } {
  useEffect(() => connection.start(), []);
  const status = useSyncExternalStore(
    (onChange) => connection.onStatus(onChange),
    () => connection.status,
  );
  const now = useNow(500);
  // The free server sleeps when idle and takes up to a minute to wake.
  const warmingUp = status !== 'online' && now - connection.statusSince > WARM_UP_AFTER_MS;
  return { status, warmingUp };
}

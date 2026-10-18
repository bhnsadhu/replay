import type { RoomRole } from '@replay/shared';

// This tab's seat, so a reload or dropped connection can get it back (PLAN.md §5).
// sessionStorage is per tab: two tabs on one laptop are two different players.

export type Seat = { kind: 'room'; code: string; token: string; role: RoomRole } | { kind: 'public'; token: string };

const KEY = 'replay.seat';

export function loadSeat(): Seat | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Seat) : null;
  } catch {
    return null;
  }
}

export function saveSeat(seat: Seat): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(seat));
  } catch {
    // Private mode or storage blocked: a reload just means joining again.
  }
}

export function clearSeat(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}

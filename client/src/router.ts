import { useSyncExternalStore } from 'react';

// A tiny router: the app only has a handful of paths (PLAN.md §3).
//   /         home
//   /solo     single-player
//   /host     this screen hosts a room (TV mode)
//   /new      this phone hosts a room (remote play)
//   /WXQK     join room WXQK (invite links)

const listeners = new Set<() => void>();
window.addEventListener('popstate', () => listeners.forEach((fn) => fn()));

export function navigate(path: string, { replace = false } = {}): void {
  if (replace) window.history.replaceState(null, '', path);
  else window.history.pushState(null, '', path);
  listeners.forEach((fn) => fn());
}

export function usePath(): string {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => window.location.pathname,
  );
}

/** "/wxqk" → "WXQK" if it looks like a room code, else null. */
export function roomCodeFromPath(path: string): string | null {
  const match = /^\/([a-hj-np-z]{4})\/?$/i.exec(path);
  return match ? match[1]!.toUpperCase() : null;
}

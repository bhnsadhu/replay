import { useEffect, useState } from 'react';

/** Re-renders every `everyMs` and returns Date.now(). Drives countdowns. */
export function useNow(everyMs = 200): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), everyMs);
    return () => window.clearInterval(timer);
  }, [everyMs]);
  return now;
}

/** Whole seconds left until `localEndAt`, clamped to [0, max]. */
export function secondsUntil(localEndAt: number, now: number, max: number): number {
  return Math.min(max, Math.max(0, Math.ceil((localEndAt - now) / 1000)));
}

/** True on phone-sized screens, where the phone layouts are used. */
export function useIsPhone(): boolean {
  const query = '(max-width: 720px)';
  const [isPhone, setIsPhone] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setIsPhone(mq.matches);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return isPhone;
}

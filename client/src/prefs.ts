// Device preferences from the options screen (PLAN.md §3, screen 9), kept in localStorage.
import { useSyncExternalStore } from 'react';

export interface Prefs {
  /** Music and sound effects on this device. */
  sound: boolean;
  /** Scanlines, glow, glitches and transitions (PLAN.md §4). */
  effects: boolean;
}

const KEY = 'replay.prefs';
const DEFAULTS: Prefs = { sound: true, effects: true };

function load(): Prefs {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? '{}') as Partial<Prefs>;
    return {
      sound: typeof raw.sound === 'boolean' ? raw.sound : DEFAULTS.sound,
      effects: typeof raw.effects === 'boolean' ? raw.effects : DEFAULTS.effects,
    };
  } catch {
    return DEFAULTS;
  }
}

let prefs = load();
const listeners = new Set<() => void>();

function apply(): void {
  document.documentElement.dataset.effects = prefs.effects ? 'on' : 'off';
}
apply();

export const getPrefs = (): Prefs => prefs;

export function setPrefs(patch: Partial<Prefs>): void {
  prefs = { ...prefs, ...patch };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Private mode: the choice lasts until the tab closes.
  }
  apply();
  for (const fn of listeners) fn();
}

export function onPrefs(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(onPrefs, getPrefs);
}

/** Effects are off when the player turned them off or the OS asks for less motion. */
export function effectsOn(): boolean {
  return prefs.effects && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

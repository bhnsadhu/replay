// Arcade sound effects, synthesized with Web Audio (no files to download).
// They follow the music: only a device that plays the clip plays effects (PLAN.md §2), and
// the SOUND option mutes both.
import type { YourResult } from '@replay/shared';
import { getPrefs } from '../prefs';

export type Sfx = 'coin' | 'lock' | 'correct' | 'wrong' | 'rewind';

let ctx: AudioContext | null = null;

/** Call from a tap (with ClipPlayer.unlock): browsers only start audio after one. */
export function unlockSfx(): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null; // No Web Audio: effects stay silent.
  }
}

interface Note {
  freq: number;
  /** Slides to this frequency over the note. */
  to?: number;
  at: number;
  dur: number;
  wave?: OscillatorType;
  gain?: number;
}

const NOTES: Record<Sfx, Note[]> = {
  coin: [
    { freq: 988, at: 0, dur: 0.07 },
    { freq: 1319, at: 0.07, dur: 0.22 },
  ],
  lock: [{ freq: 880, at: 0, dur: 0.06 }],
  correct: [523, 659, 784, 1047].map((freq, i) => ({ freq, at: i * 0.07, dur: i === 3 ? 0.24 : 0.07 })),
  wrong: [
    { freq: 220, at: 0, dur: 0.14, wave: 'sawtooth', gain: 0.6 },
    { freq: 165, at: 0.15, dur: 0.3, wave: 'sawtooth', gain: 0.6 },
  ],
  rewind: [{ freq: 1400, to: 160, at: 0, dur: 0.6, wave: 'sawtooth', gain: 0.35 }],
};

export function playSfx(name: Sfx): void {
  if (!ctx || ctx.state !== 'running' || !getPrefs().sound) return;
  const now = ctx.currentTime + 0.01;
  for (const note of NOTES[name]) {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = note.wave ?? 'square';
    osc.frequency.setValueAtTime(note.freq, now + note.at);
    if (note.to) osc.frequency.exponentialRampToValueAtTime(note.to, now + note.at + note.dur);
    const peak = 0.07 * (note.gain ?? 1);
    amp.gain.setValueAtTime(peak, now + note.at);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + note.at + note.dur);
    osc.connect(amp).connect(ctx.destination);
    osc.start(now + note.at);
    osc.stop(now + note.at + note.dur + 0.02);
  }
}

/** The reveal sting: your own result on a player's device, a fanfare on the TV. */
export function playRevealSfx(you: YourResult | null): void {
  playSfx(you === null || you.points > 0 ? 'correct' : 'wrong');
}

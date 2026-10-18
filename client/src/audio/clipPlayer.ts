// Plays each round's clip from one shared <audio> element.
// Browsers (iPhone Safari especially) only allow sound after a tap, and that permission
// sticks to the element that was played during the tap. So we "unlock" one element on
// PRESS START and reuse it for every clip.
import { getPrefs, onPrefs } from '../prefs';
import { unlockSfx } from './sfx';

function silentWavUrl(): string {
  const samples = 800; // 0.1 s at 8 kHz, 8-bit mono.
  const buffer = new ArrayBuffer(44 + samples);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => [...s].forEach((ch, i) => view.setUint8(offset + i, ch.charCodeAt(0)));
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 8000, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  writeStr(36, 'data');
  view.setUint32(40, samples, true);
  for (let i = 0; i < samples; i++) view.setUint8(44 + i, 128);
  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}

export class ClipPlayer {
  private readonly el: HTMLAudioElement;
  private startTimer: number | undefined;
  private stopTimer: number | undefined;
  private localStartAt = 0;
  /** performance.now() when sound actually started, or null if it hasn't (yet). */
  private playingAt: number | null = null;
  private readonly offPrefs: () => void;
  blocked = false;

  /** `onSound(ok)` reports whether this device may play sound (false until a tap unlocks it). */
  constructor(private readonly onSound: (ok: boolean) => void = () => undefined) {
    this.el = new Audio();
    this.el.preload = 'auto';
    // The SOUND option mutes rather than stops, so the timing stays the same either way.
    this.el.muted = !getPrefs().sound;
    this.offPrefs = onPrefs(() => {
      this.el.muted = !getPrefs().sound;
    });
  }

  private reportPlayError(err: unknown): void {
    // NotAllowedError means the browser wants a tap first. AbortError just means a newer clip replaced this one.
    if (err instanceof DOMException && err.name === 'NotAllowedError') {
      this.blocked = true;
      this.onSound(false);
    }
  }

  /** Call from a tap/click handler. */
  unlock(): void {
    unlockSfx();
    this.el.src = silentWavUrl();
    this.el
      .play()
      .then(() => {
        this.el.pause();
        this.blocked = false;
        this.onSound(true);
      })
      .catch((err) => this.reportPlayError(err));
  }

  /** Starts downloading a clip and schedules it to play at `localStartAt` (Date.now() timeline). */
  schedule(url: string, localStartAt: number, durationMs: number): void {
    this.stop();
    this.playingAt = null;
    this.localStartAt = localStartAt;
    this.el.src = url;
    this.el.load();

    // If the round already started (someone joining mid-round), skip ahead so the music
    // lines up with the countdown and ends with the round.
    let offsetMs = 0;

    this.el.onplaying = () => {
      if (this.playingAt !== null) return;
      this.onSound(true);
      // Timed from the round's start, not from when this device began playing.
      this.playingAt = performance.now() - offsetMs;
      this.stopTimer = window.setTimeout(() => this.el.pause(), durationMs - offsetMs);
    };

    const begin = () => {
      offsetMs = Math.max(0, Date.now() - localStartAt);
      if (offsetMs >= durationMs) return;
      const seekAndPlay = () => {
        this.el.currentTime = offsetMs / 1000;
        this.el.play().catch((err) => this.reportPlayError(err));
      };
      // iPhone Safari ignores seeking before the clip's metadata has loaded.
      if (offsetMs > 250 && this.el.readyState < HTMLMediaElement.HAVE_METADATA) {
        this.el.addEventListener('loadedmetadata', seekAndPlay, { once: true });
      } else {
        seekAndPlay();
      }
    };

    this.startTimer = window.setTimeout(begin, Math.max(0, localStartAt - Date.now()));
  }

  /** For devices that don't play the clip (phones in TV mode): just track when it starts. */
  markStart(localStartAt: number): void {
    this.stop();
    this.playingAt = null;
    this.localStartAt = localStartAt;
  }

  /** Time since the clip started, measured on this device (PLAN.md §7). */
  elapsedMs(): number {
    if (this.playingAt !== null) return performance.now() - this.playingAt;
    return Math.max(0, Date.now() - this.localStartAt);
  }

  stop(): void {
    window.clearTimeout(this.startTimer);
    window.clearTimeout(this.stopTimer);
    this.el.pause();
  }

  dispose(): void {
    this.stop();
    this.offPrefs();
  }
}

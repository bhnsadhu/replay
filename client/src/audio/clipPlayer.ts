// Plays each round's clip from one shared <audio> element.
// Browsers (iPhone Safari especially) only allow sound after a tap, and that permission
// sticks to the element that was played during the tap. So we "unlock" one element on
// PRESS START and reuse it for every clip.

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
  blocked = false;

  constructor() {
    this.el = new Audio();
    this.el.preload = 'auto';
  }

  /** Call from a tap/click handler. */
  unlock(): void {
    this.el.src = silentWavUrl();
    this.el
      .play()
      .then(() => {
        this.el.pause();
        this.blocked = false;
      })
      .catch(() => {
        this.blocked = true;
      });
  }

  /** Starts downloading a clip and schedules it to play at `localStartAt` (Date.now() timeline). */
  schedule(url: string, localStartAt: number, durationMs: number): void {
    this.stop();
    this.playingAt = null;
    this.localStartAt = localStartAt;
    this.el.src = url;
    this.el.load();

    this.el.onplaying = () => {
      if (this.playingAt !== null) return;
      this.playingAt = performance.now();
      this.stopTimer = window.setTimeout(() => this.el.pause(), durationMs);
    };

    this.startTimer = window.setTimeout(
      () => {
        this.el.currentTime = 0;
        this.el.play().catch(() => {
          this.blocked = true;
        });
      },
      Math.max(0, localStartAt - Date.now()),
    );
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
}

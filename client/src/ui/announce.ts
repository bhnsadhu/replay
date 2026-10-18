// Screen-reader announcements for game events (PLAN.md §8, M7 a11y pass). One polite live region,
// so countdowns on screen stay quiet and only what matters gets read out.
import type { ServerMessage } from '@replay/shared';
import { ordinal } from '../screens/room/board';

let region: HTMLElement | null = null;

export function announce(text: string): void {
  if (!region) {
    region = document.createElement('div');
    region.className = 'sr-only';
    region.setAttribute('aria-live', 'polite');
    region.setAttribute('role', 'status');
    document.body.appendChild(region);
  }
  // Clear first so the same text twice is still read.
  region.textContent = '';
  const el = region;
  window.setTimeout(() => {
    el.textContent = text;
  }, 50);
}

/** What to read out for a server message, if anything. */
export function spoken(msg: ServerMessage): string | null {
  switch (msg.t) {
    case 'roundStart':
      return `Round ${msg.index} of ${msg.total}. ${msg.options.map((o) => `${o.letter}: ${o.title} by ${o.artist}.`).join(' ')}`;
    case 'roundSkipped':
      return 'Song skipped. Loading a different one.';
    case 'reveal': {
      const answer = `It was ${msg.correct}: ${msg.track.title} by ${msg.track.artist}.`;
      if (!msg.you) return answer;
      const verdict = msg.you.choice === null ? "Time's up." : msg.you.points > 0 ? 'Correct!' : 'Missed.';
      return `${verdict} ${answer} Plus ${msg.you.points}. Score ${msg.you.score}.`;
    }
    case 'gameOver':
      return msg.you ? `Game over. You placed ${ordinal(msg.you.rank)} with ${msg.you.score} points.` : 'Game over.';
    default:
      return null;
  }
}

export function announceServer(msg: ServerMessage): void {
  const text = spoken(msg);
  if (text) announce(text);
}

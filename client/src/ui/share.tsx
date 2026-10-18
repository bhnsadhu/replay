// Share score card (PLAN.md §3, screen 8): draws the final result as an image and hands it to the
// phone's share sheet, or downloads it where sharing files isn't supported.
import { useState } from 'react';
import type { FinalStats } from '@replay/shared';
import { ordinal } from '../screens/room/board';

export interface ScoreCard {
  /** e.g. "ROOM WXQK · 90s", "PUBLIC · SET 12", "SOLO · 80s". */
  context: string;
  initials: string;
  stats: FinalStats;
  /** How many played, for "1ST OF 6". Omit for solo. */
  players?: number;
}

const W = 1080;
const H = 1350;
const SITE = 'replay.bhanusadhu.com';
const COLORS = { bg: '#07060f', ink: '#e9e6ff', dim: '#9b97c9', line: '#2a2850', pink: '#ff3ea5', cyan: '#2de2e6', yellow: '#f9f871', green: '#7cff6b', white: '#ffffff' };
const DISPLAY = '"Press Start 2P", monospace';
const BODY = '"VT323", monospace';

export async function drawCard(card: ScoreCard): Promise<Blob> {
  await Promise.all([document.fonts.load(`40px ${DISPLAY}`), document.fonts.load(`40px ${BODY}`)]);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('No canvas');

  g.fillStyle = COLORS.bg;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = COLORS.line;
  g.lineWidth = 8;
  g.strokeRect(40, 40, W - 80, H - 80);
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';

  const split = (text: string, x: number, y: number, font: string, color: string, offset: number) => {
    g.font = font;
    g.fillStyle = COLORS.pink;
    g.fillText(text, x - offset, y);
    g.fillStyle = COLORS.cyan;
    g.fillText(text, x + offset, y);
    g.fillStyle = color;
    g.fillText(text, x, y);
  };

  g.font = `40px ${BODY}`;
  g.fillStyle = COLORS.yellow;
  g.fillText('◀◀ REW  ·  GAME OVER', W / 2, 140);
  split('REPLAY', W / 2, 260, `84px ${DISPLAY}`, COLORS.white, 6);
  g.font = `44px ${BODY}`;
  g.fillStyle = COLORS.dim;
  g.fillText(card.context.toUpperCase(), W / 2, 340);

  g.font = `120px ${DISPLAY}`;
  g.fillStyle = COLORS.ink;
  g.fillText(card.initials, W / 2, 530);

  g.font = `44px ${BODY}`;
  g.fillStyle = COLORS.dim;
  g.fillText('FINAL SCORE', W / 2, 640);
  split(String(card.stats.score), W / 2, 790, `120px ${DISPLAY}`, COLORS.yellow, 5);

  if (card.players !== undefined && card.players > 1) {
    g.font = `48px ${DISPLAY}`;
    g.fillStyle = card.stats.rank === 1 ? COLORS.yellow : COLORS.ink;
    g.fillText(`${ordinal(card.stats.rank)} OF ${card.players}`, W / 2, 900);
  }

  const { correctCount, total, bestStreak, fastestMs } = card.stats;
  const rows: [string, string, string][] = [
    ['CORRECT', `${correctCount}/${total}`, COLORS.green],
    ['BEST STREAK', bestStreak > 0 ? `x${bestStreak}` : '-', COLORS.pink],
    ['FASTEST', fastestMs === null ? '-' : `${(fastestMs / 1000).toFixed(1)}s`, COLORS.cyan],
  ];
  const colW = (W - 160) / 3;
  rows.forEach(([label, value, color], i) => {
    const x = 80 + colW * i + colW / 2;
    g.font = `36px ${BODY}`;
    g.fillStyle = COLORS.dim;
    g.fillText(label, x, 1030);
    g.font = `48px ${DISPLAY}`;
    g.fillStyle = color;
    g.fillText(value, x, 1110);
  });

  g.font = `44px ${BODY}`;
  g.fillStyle = COLORS.cyan;
  g.fillText(SITE, W / 2, 1240);

  // Scanlines, like the screen.
  g.fillStyle = 'rgba(255, 255, 255, 0.035)';
  for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 1);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No image'))), 'image/png'));
}

type ShareResult = 'shared' | 'downloaded' | 'cancelled';

export async function shareScoreCard(card: ScoreCard): Promise<ShareResult> {
  const blob = await drawCard(card);
  const file = new File([blob], `replay-${card.initials.toLowerCase()}-${card.stats.score}.png`, { type: 'image/png' });
  const text = `I scored ${card.stats.score} on REPLAY (${card.stats.correctCount}/${card.stats.total} songs). https://${SITE}`;
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      return 'shared';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
      // Some browsers refuse files after all: fall through to a download.
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}

export function ShareButton({ card, className = 'secondary-button display options__small' }: { card: ScoreCard; className?: string }) {
  const [state, setState] = useState<'idle' | 'working' | 'shared' | 'downloaded' | 'failed'>('idle');
  const label = { idle: 'SHARE SCORE', working: 'MAKING CARD…', shared: 'SHARED!', downloaded: 'CARD SAVED', failed: 'TRY AGAIN' }[state];
  return (
    <button
      type="button"
      className={className}
      disabled={state === 'working'}
      onClick={() => {
        setState('working');
        shareScoreCard(card)
          .then((r) => setState(r === 'cancelled' ? 'idle' : r))
          .catch(() => setState('failed'));
      }}
    >
      {label}
    </button>
  );
}

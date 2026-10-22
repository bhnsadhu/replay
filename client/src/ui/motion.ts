// Motion driven from script: count-ups and sliding scoreboard rows. CSS animations are switched off by
// "Reduce effects" and the OS reduced-motion setting (styles/base.css); these check the same two switches.
import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';

export function motionAllowed(): boolean {
  return document.documentElement.dataset.effects !== 'off' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Counts up from 0 to `target` in arcade-style steps when the component mounts or the target changes. */
export function useCountUp(target: number, ms = 600, steps = 12): number {
  const [run, setRun] = useState({ target, step: 0 });
  // A new target starts the count again.
  if (run.target !== target) setRun({ target, step: 0 });
  const animate = target > 0 && motionAllowed();

  useEffect(() => {
    if (!animate || run.step >= steps) return;
    const timer = window.setTimeout(() => setRun((r) => ({ ...r, step: r.step + 1 })), ms / steps);
    return () => window.clearTimeout(timer);
  }, [animate, run.step, ms, steps]);

  return !animate || run.step >= steps ? target : Math.round((target * run.step) / steps);
}

/** Last rank of each row, per board title. Boards remount every screen, so this is what lets rows slide. */
const lastRanks = new Map<string, Map<string, number>>();

/**
 * Slides rows (elements with data-key and data-rank) from their rank on the previous screen to their new one,
 * and pops in rows that weren't there before (a player joining).
 */
export function useRankMotion(board: string, list: RefObject<HTMLElement | null>, ranks: [key: string, rank: number][]): void {
  const signature = ranks.map(([key, rank]) => `${key}:${rank}`).join(',');

  useLayoutEffect(() => {
    const el = list.current;
    const before = lastRanks.get(board);
    lastRanks.set(board, new Map(ranks));
    if (!el || !before || !motionAllowed()) return;

    const rows = [...el.querySelectorAll<HTMLElement>('[data-key]')];
    const pitch = rows.length > 1 ? rows[1]!.offsetTop - rows[0]!.offsetTop : (rows[0]?.offsetHeight ?? 0);
    rows.forEach((row, i) => {
      const was = before.get(row.dataset.key!);
      const now = Number(row.dataset.rank);
      if (was === undefined) {
        row.animate(
          [
            { opacity: 0, transform: 'scale(1.25)' },
            { opacity: 1, transform: 'none' },
          ],
          { duration: 300, delay: i * 60, easing: 'steps(4, end)', fill: 'backwards' },
        );
      } else if (was !== now) {
        // Moving up or down the board; a row coming from outside the list starts just below it.
        const from = Math.min(was, rows.length + 1);
        row.animate([{ transform: `translateY(${(from - now) * pitch}px)` }, { transform: 'none' }], {
          duration: 500,
          easing: 'steps(8, end)',
        });
      }
    });
    // `ranks` is described by `signature`; re-running only when a rank changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, signature]);
}

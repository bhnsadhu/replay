import type { AnswerOption, Letter, YourResult } from '@replay/shared';
import type { BreakdownRow, VerdictKind } from '../../ui/result';

/** An empty result, for when the server sends none (e.g. a player who just joined). */
export const NO_RESULT: YourResult = { choice: null, elapsedMs: null, points: 0, base: 0, speed: 0, streakBonus: 0, streak: 0, score: 0 };

/** What the reveal says about your answer. Shared by every reveal layout (solo, room, desktop, phone). */
export function describeResult(you: YourResult, correct: Letter, options: AnswerOption[], streakBefore: number) {
  const kind: VerdictKind = you.choice === null ? 'none' : you.choice === correct ? 'correct' : 'wrong';

  let rows: BreakdownRow[];
  let note: string | undefined;
  if (kind === 'correct') {
    const secs = ((you.elapsedMs ?? 0) / 1000).toFixed(1);
    rows = [
      { label: 'BASE', value: `+${you.base}` },
      { label: `SPEED · ${secs}s`, value: `+${you.speed}` },
      { label: `STREAK x${you.streak}`, value: `+${you.streakBonus}`, tone: 'streak' },
    ];
  } else {
    const picked = options.find((o) => o.letter === you.choice);
    rows = [{ label: 'YOU PICKED', value: picked ? `${picked.letter} · ${picked.title}` : 'Nothing' }];
    if (streakBefore > 0) rows.push({ label: 'STREAK', value: `x${streakBefore} → x0`, tone: 'streak' });
    if (kind === 'none') note = 'Lock in early. Faster answers score more.';
  }
  return { kind, rows, note };
}

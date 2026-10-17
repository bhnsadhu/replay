import type { AnswerOption } from '@replay/shared';
import type { BreakdownRow, VerdictKind } from '../../ui/result';
import type { Reveal } from '../../game/useSoloGame';

/** What the reveal says about your answer, shared by the phone and desktop layouts. */
export function describeResult(reveal: Reveal, options: AnswerOption[], streakBefore: number) {
  const { you, correct } = reveal;
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

// Core game vocabulary shared by server and clients. See PLAN.md §5–6.

export const LETTERS = ['A', 'B', 'C', 'D'] as const;
export type Letter = (typeof LETTERS)[number];

export interface AnswerOption {
  letter: Letter;
  title: string;
  artist: string;
}

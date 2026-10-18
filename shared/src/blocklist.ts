// Three-letter initials that won't show on a scoreboard (PLAN.md §5).
// Hand-picked from common profanity and slur lists, cut to 3-letter forms. Blocked initials are
// treated as taken, so DEV-style numbering kicks in (e.g. a blocked "ABC" becomes "AB2").

const BLOCKED = new Set([
  'ASS', 'AZZ', 'CUM', 'CUK', 'DIK', 'DIC', 'DIX', 'COK', 'KOK', 'COC', 'FUK', 'FUC', 'FCK', 'FUQ', 'FKU',
  'FKN', 'FAG', 'FGT', 'NIG', 'NGR', 'NGA', 'KKK', 'KYS', 'SEX', 'TIT', 'TTS', 'VAG', 'JIZ', 'JIS',
  'HOE', 'WTF', 'STFU', 'SHT', 'SHI', 'PIS', 'PSS', 'CNT', 'KNT', 'TWT', 'SLT', 'XXX',
  'NAZ', 'SS1', 'RPE', 'PRN', 'PNS', 'BJS', 'BJ1', 'FUX',
].filter((w) => w.length === 3));

export function isBlockedInitials(initials: string): boolean {
  return BLOCKED.has(initials.toUpperCase());
}

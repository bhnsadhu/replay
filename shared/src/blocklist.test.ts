import { describe, expect, it } from 'vitest';
import { isBlockedInitials } from './blocklist';

describe('isBlockedInitials', () => {
  it('blocks rude initials in any case', () => {
    expect(isBlockedInitials('ASS')).toBe(true);
    expect(isBlockedInitials('fuk')).toBe(true);
    expect(isBlockedInitials('KKK')).toBe(true);
  });

  it('lets normal initials through', () => {
    for (const ok of ['DEV', 'MAY', 'JOR', 'AAA', 'ACE', 'BOB']) expect(isBlockedInitials(ok)).toBe(false);
  });
});

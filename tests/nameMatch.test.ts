import { describe, expect, it } from 'vitest';
import { bestMatch, nameKey } from '../src/domain/nameMatch';
describe('nameMatch', () => {
  it('ignores punctuation, spacing, case and accents', () => {
    expect(nameKey('A.J. Sherwood')).toBe(nameKey('aj sherwood'));
    expect(bestMatch(['A.J. Sherwood', 'Ann'], 'AJ Sherwood')).toBe('A.J. Sherwood');
    expect(bestMatch(['Brontë'], 'bronte')).toBe('Brontë');
  });
  it('allows one typo on longer names only', () => {
    expect(bestMatch(['Sarah Maas'], 'Sara Maas')).toBe('Sarah Maas');
    expect(bestMatch(['Ann'], 'Anne')).toBeNull();
    expect(bestMatch(['Ann Lee'], 'Bob Ray')).toBeNull();
  });
});

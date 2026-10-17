import { describe, expect, it } from 'vitest';
import { bucket, displayMakeup, makeup } from '../src/domain/makeup';
import { QUARTER_ORDER, starFills, starQuarters, starsToStored, storedToStars } from '../src/domain/rating';
import { TAG_COLORS, chipStyle, randomTagColor } from '../src/domain/colors';
import { newId } from '../src/domain/ids';
import { formatPosition } from '../src/domain/series';

describe('rating', () => {
  it('stores quarter stars as 0-20', () => {
    expect(starsToStored(4.25)).toBe(17);
    expect(starsToStored(0)).toBe(0);
    expect(starsToStored(null)).toBeNull();
    expect(storedToStars(17)).toBe(4.25);
  });
  it('rejects values that are not quarter steps or are out of range', () => {
    expect(() => starsToStored(4.3)).toThrow();
    expect(() => starsToStored(5.25)).toThrow();
    expect(() => starsToStored(-0.25)).toThrow();
  });
  it('fills each star exactly', () => {
    expect(starFills(4.5)).toEqual([1, 1, 1, 1, 0.5]);
    expect(starFills(null)).toEqual([0, 0, 0, 0, 0]);
  });
});

describe('makeup and dashboard bucket', () => {
  const cases: [string, string][] = [
    ['MM', 'MM'], ['MF', 'MF'], ['FM', 'MF'], ['FX', 'FX'], ['MX', 'MX'], ['XX', 'XX'], ['FF', 'FF'],
    ['MMMMMM', 'MM'], ['FFF', 'FF'], ['MMF', 'Other'], ['MMX', 'Other'], ['M', 'unknown'], ['M?', 'unknown'],
  ];
  it.each(cases)('%s counts as %s', (m, expected) => expect(bucket(m)).toBe(expected));
  it('builds the makeup from genders', () => {
    expect(makeup(['male', 'male', 'female'])).toBe('MMF');
    expect(makeup(['male', null])).toBe('M?');
    expect(displayMakeup('MMF')).toBe('M/M/F');
  });
});

describe('ids and positions', () => {
  it('makes unique, time-ordered UUIDs', async () => {
    const a = newId();
    await new Promise((r) => setTimeout(r, 3));
    const b = newId();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a < b).toBe(true);
  });
  it('formats decimal positions', () => {
    expect(formatPosition(3)).toBe('3');
    expect(formatPosition(1.5)).toBe('1.5');
  });
});

describe('spiral stars and tag colors', () => {
  it('fills a star one quarter at a time, top left first and then round the left side', () => {
    expect(QUARTER_ORDER).toEqual(['top-left', 'bottom-left', 'bottom-right', 'top-right']);
    expect([0, 0.25, 0.5, 0.75, 1].map(starQuarters)).toEqual([0, 1, 2, 3, 4]);
    expect(starFills(4.75).map(starQuarters)).toEqual([4, 4, 4, 4, 3]);
  });
  it('picks tag colors from the palette', () => {
    expect(TAG_COLORS).toContain(randomTagColor());
    expect(randomTagColor(() => 0)).toBe(TAG_COLORS[0]);
    expect(randomTagColor(() => 0.9999)).toBe(TAG_COLORS[TAG_COLORS.length - 1]);
    expect(chipStyle('#6f8aa0')).toEqual({ borderColor: '#6f8aa0', background: '#6f8aa02e' });
    expect(chipStyle(null).borderColor).toBe('#6a5a4a');
  });
});

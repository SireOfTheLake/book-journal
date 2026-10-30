import { describe, expect, it } from 'vitest';
import { dayAmounts } from '../src/domain/pages';
import { entryLabel } from '../src/domain/entryLabel';

const base = { start: '2026-01-01', finish: '2026-01-05', pages: 200, format: 'ebook' as const, audioSeconds: null };
describe('dayAmounts', () => {
  it('spreads evenly with no logs, start to finish inclusive', () => {
    const m = dayAmounts({ ...base, entries: [] });
    expect([...m.keys()]).toHaveLength(5);
    expect([...m.values()].reduce((n, a) => n + (a.pages ?? 0), 0)).toBe(200);
    expect([...m.values()].reduce((n, a) => n + a.percent, 0)).toBe(100);
  });
  it('uses differences between logs and skips unlogged days', () => {
    const m = dayAmounts({ ...base, finish: null, entries: [{ date: '2026-01-02', page: null, percent: 10 }, { date: '2026-01-04', page: null, percent: 25 }] });
    expect(m.get('2026-01-01')!.percent).toBe(1);
    expect(m.get('2026-01-02')!.percent).toBe(9);
    expect(m.get('2026-01-04')!.percent).toBe(15);
    expect(m.get('2026-01-03')).toBeUndefined();
    expect(m.get('2026-01-04')!.pages).toBe(30);
  });
  it('gives the start day 1% and the finish day the rest, and everything adds up', () => {
    const m = dayAmounts({ ...base, entries: [{ date: '2026-01-03', page: 100, percent: null }] });
    expect(m.get('2026-01-01')!.percent).toBe(1);
    expect(m.get('2026-01-05')!.pages).toBe(100);
    expect([...m.values()].reduce((n, a) => n + (a.pages ?? 0), 0)).toBe(200);
    expect([...m.values()].reduce((n, a) => n + a.percent, 0)).toBe(100);
  });
  it('works out time only for audiobooks', () => {
    const audio = { ...base, format: 'audio' as const, audioSeconds: 36000 };
    const m = dayAmounts({ ...audio, entries: [{ date: '2026-01-03', page: null, percent: null, seconds: 18000 }] });
    expect([...m.values()].reduce((n, a) => n + (a.seconds ?? 0), 0)).toBe(36000);
    expect([...dayAmounts({ ...base, entries: [] }).values()][0].seconds).toBeNull();
  });
});
describe('entryLabel', () => {
  it('always has a rounded percent, and time only for audio', () => {
    expect(entryLabel({ page: 50, percent: null, seconds: null }, { format: 'ebook', pageCount: 300, audioSeconds: 36000 })).toBe('17% · page 50');
    expect(entryLabel({ page: null, percent: null, seconds: 3600 }, { format: 'audio', pageCount: 300, audioSeconds: 36000 })).toBe('10% · page 30 · 1h 0m');
  });
});

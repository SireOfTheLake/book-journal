import { byTitle } from './sortKey';
import { MONTH_NAMES } from './months';

export const monthRange = (year: number, month: number) => {
  const mm = String(month).padStart(2, '0');
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${String(last).padStart(2, '0')}` };
};
export const dayBefore = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
export const monthName = (month: number) => MONTH_NAMES[month - 1];

export interface Counted { name: string; count: number }
// The most common values, most first (ties in name order). Blank values are ignored.
export function topCounts(values: (string | null | undefined)[], n = 3): Counted[] {
  const m = new Map<string, number>();
  for (const v of values) { const k = v?.trim(); if (k) m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || byTitle(a.name, b.name)).slice(0, n);
}

export interface Split { before: number; month: number; rest: number } // widths in percent, adding up to 100
// A goal bar in three parts: progress made before this month, progress made in this month, and what is left.
export function splitProgress(o: { before: number; month: number; target: number }): Split {
  if (o.target <= 0) return { before: 0, month: 0, rest: 100 };
  const pct = (n: number) => Math.max(0, (n / o.target) * 100);
  const before = Math.min(100, pct(o.before));
  const month = Math.min(100 - before, pct(o.month));
  return { before: Math.round(before * 10) / 10, month: Math.round(month * 10) / 10, rest: Math.round((100 - before - month) * 10) / 10 };
}

// ---- dot plots ----
export interface DotColumn { x: number; count: number; group: number }
export const PAGE_GROUPS = ['Under 200', '200 to 499', '500 or more'];
export const STAR_GROUPS = ['0', '1', '2', '3', '4', '5'];
const pageGroup = (p: number) => (p < 200 ? 0 : p < 500 ? 1 : 2);

// One column for every ten pages (the page count rounded down: 114 and 119 both sit at 110).
export function pageDots(pages: (number | null)[]): { columns: DotColumn[]; max: number } {
  const m = new Map<number, number>();
  for (const p of pages) if (p !== null && p > 0) { const x = Math.floor(p / 10) * 10; m.set(x, (m.get(x) ?? 0) + 1); }
  const top = Math.max(0, ...m.keys());
  return { columns: [...m].map(([x, count]) => ({ x, count, group: pageGroup(x) })).sort((a, b) => a.x - b.x), max: Math.max(600, Math.ceil((top + 10) / 100) * 100) };
}

// Ratings are stored 0 to 20; stars are 0 to 5 in quarter steps. The colour follows the whole star (4.75 is a four).
export function starDots(stored: (number | null)[]): DotColumn[] {
  const m = new Map<number, number>();
  for (const r of stored) if (r !== null) m.set(r, (m.get(r) ?? 0) + 1);
  return [...m].map(([r, count]) => ({ x: r / 4, count, group: Math.min(5, Math.floor(r / 4)) })).sort((a, b) => a.x - b.x);
}

// ---- relationship makeup ----
export const MAKEUPS = ['MM', 'FF', 'XX', 'MF', 'MX', 'FX', 'Other', 'unknown'] as const;
export const countMakeups = (buckets: string[]) => MAKEUPS.map((name) => ({ name, count: buckets.filter((b) => b === name).length }));

// ---- sources by format ----
export const FORMAT_ORDER = ['ebook', 'audio', 'physical', 'none'] as const;
export const FORMAT_LABEL: Record<string, string> = { ebook: 'Ebook', audio: 'Audiobook', physical: 'Physical', none: 'No format' };
export interface SourceMix { format: string; total: number; start: number; share: number; sources: { name: string; color: string | null; count: number; start: number; share: number }[] }
// The format lane and, under each format, its sources. Positions and shares are percentages of all the month's books (0 to 100).
export function sourceMix(rows: { format: string | null; source: string | null; color: string | null }[]): SourceMix[] {
  const all = rows.length;
  if (!all) return [];
  let cursor = 0;
  const out: SourceMix[] = [];
  for (const f of FORMAT_ORDER) {
    const mine = rows.filter((r) => (r.format ?? 'none') === f);
    if (!mine.length) continue;
    const by = new Map<string, { color: string | null; count: number }>();
    for (const r of mine) { const k = r.source?.trim() || 'No source'; const e = by.get(k) ?? { color: r.color, count: 0 }; e.count += 1; by.set(k, e); }
    let inner = cursor;
    const sources = [...by].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0])).map(([name, e]) => {
      const share = (e.count / all) * 100; const item = { name, color: e.color, count: e.count, start: inner, share }; inner += share; return item;
    });
    const share = (mine.length / all) * 100;
    out.push({ format: f, total: mine.length, start: cursor, share, sources });
    cursor += share;
  }
  return out;
}

/** Counts of distinct characters by value: a character who is in two books of the month counts once. */
export function uniqueCounts(pairs: { id: string; value: string | null }[], n = 3): Counted[] {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const p of pairs) { const k = `${p.id}\u0000${p.value}`; if (p.value && !seen.has(k)) { seen.add(k); values.push(p.value); } }
  return topCounts(values, n);
}

// The fifty states only (not DC or the territories), for the "Settings: states" count.
export const US_STATES = ['Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming'];
const STATE_KEYS = new Map(US_STATES.map((n) => [n.toLowerCase(), n]));
const US_NAMES = new Set(['united states', 'united states of america', 'usa', 'us', 'u.s.', 'u.s.a.']);
export const isUsCountry = (country: string | null | undefined) => US_NAMES.has((country ?? '').trim().toLowerCase());
// A state counts only if it is one of the fifty, in the United States (or with no country given). Returns its proper name.
export function usState(state: string | null | undefined, country?: string | null): string | null {
  const name = STATE_KEYS.get((state ?? '').trim().toLowerCase());
  if (!name) return null;
  return !country?.trim() || isUsCountry(country) ? name : null;
}
// Only countries other than the United States.
export const nonUsCountry = (country: string | null | undefined): string | null => (country?.trim() && !isUsCountry(country) ? country.trim() : null);
// A character is counted by the part of the name before the first space.
export const firstName = (name: string | null | undefined): string => (name ?? '').trim().split(/\s+/)[0] ?? '';

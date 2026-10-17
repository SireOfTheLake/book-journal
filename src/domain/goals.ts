import { addDays } from './pages';

export type Metric = 'books' | 'pages' | 'audio_hours' | 'series_started' | 'series_finished' | 'challenges';
export const METRICS: { value: Metric; label: string; unit: string; filterable: boolean }[] = [
  { value: 'books', label: 'Books read', unit: 'books', filterable: true },
  { value: 'pages', label: 'Pages read', unit: 'pages', filterable: true },
  { value: 'audio_hours', label: 'Audiobook hours', unit: 'hours', filterable: true },
  { value: 'series_started', label: 'Series started', unit: 'series', filterable: false },
  { value: 'series_finished', label: 'Series finished', unit: 'series', filterable: false },
  { value: 'challenges', label: 'Challenges', unit: 'prompts', filterable: false },
];
export const metricInfo = (m: string) => METRICS.find((x) => x.value === m) ?? METRICS[0];

export type FilterKind = 'genre' | 'trope' | 'format';
export interface GoalFilter { kind: FilterKind; mode: 'include' | 'exclude'; ref: string }
export const FORMATS = [{ value: 'physical', label: 'Physical' }, { value: 'audio', label: 'Audiobook' }, { value: 'ebook', label: 'Ebook' }];

export function parseFilters(text: string | null): GoalFilter[] {
  if (!text) return [];
  try {
    const list = JSON.parse(text);
    if (!Array.isArray(list)) return [];
    return list.filter((f): f is GoalFilter => !!f && ['genre', 'trope', 'format'].includes(f.kind) && ['include', 'exclude'].includes(f.mode) && typeof f.ref === 'string' && f.ref !== '');
  } catch { return []; }
}

export type GoalDisplay = 'ring' | 'bar';
export const parseDisplay = (v: string | null | undefined): GoalDisplay => (v === 'bar' ? 'bar' : 'ring');
export function parseIds(text: string | null): string[] | null {
  if (!text) return null;
  try { const v = JSON.parse(text); return Array.isArray(v) && v.length ? v.filter((x): x is string => typeof x === 'string') : null; } catch { return null; }
}

export function autoLabel(metric: Metric, target: number): string {
  const n = `${target}`;
  switch (metric) {
    case 'books': return `Read ${n} books`;
    case 'pages': return `Read ${n} pages`;
    case 'audio_hours': return `Listen to ${n} hours`;
    case 'series_started': return `Start ${n} series`;
    case 'series_finished': return `Finish ${n} series`;
    case 'challenges': return 'Complete my challenges';
  }
}

export type PaceState = 'done' | 'ahead' | 'on_pace' | 'behind' | 'not_started' | 'missed';
export interface Pace { state: PaceState; text: string; percent: number; expected: number | null }

const dayNumber = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86400000);
const round = (n: number, digits = 0) => { const k = 10 ** digits; return Math.round(n * k) / k; };

// Where a goal stands: how far along it is, and whether that is ahead of or behind an even pace over its dates.
export function paceOf(o: { value: number; target: number; from: string; to: string; today: string; metric: Metric }): Pace {
  const { value, target, from, to, today, metric } = o;
  const digits = metric === 'audio_hours' ? 1 : 0;
  const unit = metricInfo(metric).unit;
  const percent = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
  if (value >= target) return { state: 'done', text: 'Goal reached', percent: 100, expected: null };
  if (today < from) {
    const n = dayNumber(from) - dayNumber(today);
    return { state: 'not_started', text: `Starts in ${n} ${n === 1 ? 'day' : 'days'}`, percent, expected: null };
  }
  if (today > to) return { state: 'missed', text: `Ended ${round(target - value, digits)} ${unit} short`, percent, expected: null };
  const total = dayNumber(to) - dayNumber(from) + 1;
  const elapsed = dayNumber(today) - dayNumber(from) + 1;
  const expected = (target * elapsed) / total;
  const diff = value - expected;
  const tolerance = metric === 'pages' ? Math.max(1, target * 0.01) : 0.5;
  const left = dayNumber(to) - dayNumber(today) + 1;
  const perWeek = (target - value) / (left / 7);
  const need = `${round(perWeek, perWeek < 10 ? 1 : 0)} ${unit} a week to finish`;
  if (Math.abs(diff) < tolerance) return { state: 'on_pace', text: 'On pace', percent, expected };
  if (diff > 0) return { state: 'ahead', text: `Ahead by ${round(diff, digits) || round(diff, 1)} ${unit}`, percent, expected };
  return { state: 'behind', text: `Behind by ${round(-diff, digits) || round(-diff, 1)} ${unit} · needs ${need}`, percent, expected };
}

export const yearRange = (year: number) => ({ from: `${year}-01-01`, to: `${year}-12-31` });
export { addDays };

import { progressOf } from './progress';

// Pages read each day, for the Calendar's chart.
// Logged day entries are used when they exist (their positions are where you got to that day);
// otherwise the book's pages are spread evenly over the days from start to finish.
export interface PageRead {
  start: string | null;
  finish: string | null;
  pages: number | null;
  format?: 'physical' | 'audio' | 'ebook' | null;
  audioSeconds?: number | null;
  entries: { date: string; page: number | null; percent: number | null; seconds?: number | null }[];
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 4000; d = addDays(d, 1)) out.push(d);
  return out;
}

export interface DayAmount { pages: number | null; percent: number; seconds: number | null }

// What was read on each day of one read, worked out from where you said you got to (a logged place is a position, so a day's
// share is the step from the previous logged place).
//  - No logs at all: the whole book is spread evenly over start..finish (finished reads only).
//  - Some logs: only logged days count, plus the start day (at least 1% if it was not logged) and the finish day (all that is left).
// Pages, percent and time are cut from the same running position, so they always add up to the book's pages / 100% / audio length.
export function dayAmounts(r: PageRead): Map<string, DayAmount> {
  const info = { format: r.format ?? null, pageCount: r.pages ?? null, audioSeconds: r.audioSeconds ?? null };
  const pos = new Map<string, number>();
  for (const e of r.entries) {
    const f = progressOf({ page: e.page, percent: e.percent, seconds: e.seconds ?? null }, info);
    if (f !== null) pos.set(e.date, Math.max(pos.get(e.date) ?? 0, f));
  }
  const stops: { date: string; pos: number }[] = [];
  if (pos.size) {
    const dates = [...pos.keys()].sort();
    if (r.start && r.start < dates[0]) pos.set(r.start, Math.min(0.01, pos.get(dates[0])!));
    if (r.finish) pos.set(r.finish, 1);
    let top = 0;
    for (const date of [...pos.keys()].sort()) { top = Math.max(top, pos.get(date)!); stops.push({ date, pos: top }); }
  } else if (r.finish) {
    const days = daysBetween(r.start && r.start <= r.finish ? r.start : r.finish, r.finish);
    days.forEach((date, i) => stops.push({ date, pos: (i + 1) / days.length }));
  }
  const out = new Map<string, DayAmount>();
  const audio = r.format === 'audio' && r.audioSeconds ? r.audioSeconds : null;
  const cut = (p: number, total: number | null) => (total ? Math.round(p * total) : null);
  let prev = 0;
  for (const s of stops) {
    const was = prev; prev = s.pos;
    const pages = r.pages ? cut(s.pos, r.pages)! - cut(was, r.pages)! : null;
    const seconds = audio ? cut(s.pos, audio)! - cut(was, audio)! : null;
    const percent = Math.round(s.pos * 100) - Math.round(was * 100);
    if (percent <= 0 && !pages && !seconds) continue;
    out.set(s.date, { pages, percent, seconds });
  }
  return out;
}

export function pagesPerDay(reads: PageRead[]): Map<string, number> {
  const total = new Map<string, number>();
  for (const r of reads) {
    if (!r.pages || r.pages <= 0) continue;
    for (const [date, a] of dayAmounts(r)) if (a.pages && a.pages > 0) total.set(date, (total.get(date) ?? 0) + a.pages);
  }
  return total;
}

import { addDays } from './pages';

export interface Run { length: number; start: string; end: string; ongoing: boolean }
export type Format = 'physical' | 'audio' | 'ebook';
export interface StreakRead {
  status: 'reading' | 'finished' | 'on_hold' | 'dnf';
  start: string | null; finish: string | null; format: Format | null;
  entryDates: string[];
}
export interface ReadingDays { any: Set<string>; finished: Set<string>; byFormat: Record<Format, Set<string>> }

function span(a: string, b: string, add: (d: string) => void) {
  for (let d = a, n = 0; d <= b && n < 4000; d = addDays(d, 1), n++) add(d);
}

// Which days count as reading days. This follows the same assumption as the pages-per-day chart:
// - A book with no day log is read evenly over every day from its start to its finish, so each of those days counts.
// - A book with day log entries was read on the days you logged. Whatever was left over is assumed to be read on the day you finished it,
//   so the finish day counts too, and the unlogged days in between do not.
// - A book still in progress with no log counts from its start up to today. A paused book counts only its start day and logged days.
// A book finished on a day counts that day even with no start date.
export function readingDays(reads: StreakRead[], today: string): ReadingDays {
  const out: ReadingDays = { any: new Set(), finished: new Set(), byFormat: { physical: new Set(), audio: new Set(), ebook: new Set() } };
  for (const r of reads) {
    const add = (d: string) => { out.any.add(d); if (r.format) out.byFormat[r.format].add(d); };
    const logged = r.entryDates.length > 0;
    if (r.status === 'finished' || r.status === 'dnf') {
      const end = r.finish ?? r.start;
      if (logged) {
        if (end) add(end);
      } else {
        const begin = r.start && end && r.start <= end ? r.start : end;
        if (begin && end) span(begin, end, add);
      }
      if (r.status === 'finished' && r.finish) out.finished.add(r.finish);
    } else if (r.status === 'reading') {
      if (!logged && r.start && r.start <= today) span(r.start, today, add);
    } else if (r.start) add(r.start);
    for (const d of r.entryDates) add(d);
  }
  return out;
}

// The longest stretch of days in a row that are in the set, within from..to.
export function longestRun(days: Set<string>, from: string, to: string): Run | null {
  return best(days, from, to, true);
}
// The longest stretch of days in a row that are not in the set, within from..to.
export function longestGap(days: Set<string>, from: string, to: string): Run | null {
  return best(days, from, to, false);
}
function best(days: Set<string>, from: string, to: string, wanted: boolean): Run | null {
  let top: Run | null = null;
  let start: string | null = null;
  let n = 0;
  const close = (end: string) => {
    if (start && (!top || n > top.length)) top = { length: n, start, end, ongoing: end === to };
    start = null; n = 0;
  };
  let d = from;
  let last = from;
  for (let i = 0; d <= to && i < 40000; i++, d = addDays(d, 1)) {
    if (days.has(d) === wanted) { if (!start) start = d; n++; last = d; } else close(last);
  }
  close(last);
  return top;
}

// The streak you are on today: reading days in a row ending today (or yesterday, so a day not yet logged does not break it).
export function currentRun(days: Set<string>, today: string): Run | null {
  let end = today;
  if (!days.has(end)) end = addDays(today, -1);
  if (!days.has(end)) return null;
  let n = 0;
  let d = end;
  while (days.has(d) && n < 40000) { n++; d = addDays(d, -1); }
  return { length: n, start: addDays(end, -(n - 1)), end, ongoing: true };
}

export interface Streaks {
  any: Run | null; finished: Run | null; notReading: Run | null;
  physical: Run | null; audio: Run | null; ebook: Run | null;
  current: Run | null;
}

// Streaks inside from..to. `to` is cut off at today. The not-reading streak only looks between your first reading day and the end of the range.
export function streaksFor(d: ReadingDays, from: string, to: string, today: string): Streaks {
  const end = to > today ? today : to;
  if (from > end) return { any: null, finished: null, notReading: null, physical: null, audio: null, ebook: null, current: null };
  const first = [...d.any].filter((x) => x >= from && x <= end).sort()[0];
  return {
    any: longestRun(d.any, from, end),
    finished: longestRun(d.finished, from, end),
    notReading: first ? longestGap(d.any, from, end) : null,
    physical: longestRun(d.byFormat.physical, from, end),
    audio: longestRun(d.byFormat.audio, from, end),
    ebook: longestRun(d.byFormat.ebook, from, end),
    current: currentRun(d.any, today),
  };
}

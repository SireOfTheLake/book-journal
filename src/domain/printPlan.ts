// What goes into a printed journal, and in what order. Pure functions, so the order is easy to test.

export type PrintType = 'trackers' | 'calendar' | 'dashboard' | 'monthChart' | 'bracket' | 'yearDashboard' | 'bookLogs' | 'quotes' | 'challengeTracker' | 'challengeLogs' | 'seriesLedger' | 'seriesLogs';

/** In printing order. A month's Calendar is followed by that month's Dashboard, so those two share one place in the list. */
export const PRINT_TYPES: { id: PrintType; label: string; note: string }[] = [
  { id: 'trackers', label: 'Trackers', note: 'Days read and books finished' },
  { id: 'calendar', label: 'Calendar', note: 'One page per month' },
  { id: 'dashboard', label: 'Monthly dashboard', note: 'Follows its month\'s calendar' },
  { id: 'monthChart', label: 'Month chart', note: 'Books finished each month' },
  { id: 'bracket', label: 'Book bracket', note: 'Best of month, quarter, half, year' },
  { id: 'yearDashboard', label: 'Yearly dashboard', note: 'The year in numbers, over two facing pages' },
  { id: 'bookLogs', label: 'Book logs', note: 'In the order you finished them' },
  { id: 'quotes', label: 'Quotes', note: 'Favorite passages from the books you finished' },
  { id: 'challengeTracker', label: 'Challenge tracker', note: 'Progress on every challenge' },
  { id: 'challengeLogs', label: 'Challenge logs', note: 'One page per challenge' },
  { id: 'seriesLedger', label: 'Series ledger', note: 'Every series at a glance' },
  { id: 'seriesLogs', label: 'Series logs', note: 'Series you read in this period' },
];

export type SheetView =
  | { kind: 'tracker'; tracker: 'pages' | 'books' }
  | { kind: 'calendar'; month: number }
  | { kind: 'dashboardMonth'; month: number }
  | { kind: 'dashboardYear'; part: 1 | 2 }
  | { kind: 'monthChart' }
  | { kind: 'bracket' }
  | { kind: 'book'; bookId: string; readId: string }
  | { kind: 'challenges' }
  | { kind: 'challenge'; id: string }
  | { kind: 'ledger'; ids: string[]; part: number; parts: number }
  | { kind: 'quotes'; ids: string[]; part: number; parts: number }
  | { kind: 'series'; id: string };

/** align 'even': in a double-sided book this page sits on the left, so a blank page is added before it when it would land on the right. */
export interface SheetSpec { key: string; type: PrintType; label: string; landscape: boolean; width: number; view: SheetView; align?: 'even' }
export interface PrintData {
  activeMonths: number[];
  reads: { bookId: string; readId: string; title: string }[]; // finished in the period, in the order finished
  series: { id: string; title: string }[];
  challenges: { id: string; name: string }[];
  ledger: { id: string; marks: number }[]; // every series, in ledger order, with how many books it shows
  quotes: { id: string; chars: number; newBook: boolean }[]; // quotes from the books finished in the period, grouped by book
}
export interface Period { year: number; month: number | null }

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const periodLabel = (p: Period) => (p.month ? `${MONTHS[p.month - 1]} ${p.year}` : String(p.year));
const ABBR = ['Jan.', 'Feb.', 'March', 'April', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];
/** The period as it reads on the title page: "Oct. 2026" for a month, "2026" for a year. */
export const shortPeriodLabel = (p: Period) => (p.month ? `${ABBR[p.month - 1]} ${p.year}` : String(p.year));

/** Splits items into pages: each page holds items until their combined cost passes the budget. */
export function paginate(costs: number[], budget: number): number[][] {
  const pages: number[][] = [];
  let cur: number[] = [], used = 0;
  costs.forEach((c, i) => {
    if (cur.length && used + c > budget) { pages.push(cur); cur = []; used = 0; }
    cur.push(i); used += c;
  });
  if (cur.length) pages.push(cur);
  return pages;
}
export const LEDGER_BUDGET = 22, MARKS_PER_LINE = 22, QUOTE_BUDGET = 52;
export const ledgerCost = (marks: number) => 1 + Math.max(0, Math.ceil(marks / MARKS_PER_LINE) - 1) * 0.8;
export const quoteCost = (q: { chars: number; newBook: boolean }) => 1.5 + Math.ceil(q.chars / 105) * 1.15 + (q.newBook ? 1.7 : 0);

// How wide a page is laid out before it is shrunk to fit the paper (so text stays in proportion).
const PORTRAIT = 860, WIDE = 1000, LANDSCAPE = 1150;

export function planSheets(p: Period, types: ReadonlySet<PrintType>, data: PrintData): SheetSpec[] {
  const out: SheetSpec[] = [];
  const add = (type: PrintType, key: string, label: string, view: SheetView, landscape = false, width = landscape ? LANDSCAPE : PORTRAIT, align?: 'even') => out.push({ key, type, label, landscape, width, view, align });
  if (types.has('trackers')) {
    add('trackers', 'trk-pages', 'Pages read', { kind: 'tracker', tracker: 'pages' });
    add('trackers', 'trk-books', 'Books finished', { kind: 'tracker', tracker: 'books' });
  }
  const months = p.month ? [p.month] : data.activeMonths;
  for (const m of months) {
    if (types.has('calendar')) add('calendar', `cal-${m}`, MONTHS[m - 1], { kind: 'calendar', month: m }, true, LANDSCAPE, 'even');
    if (types.has('dashboard')) add('dashboard', `dash-${m}`, MONTHS[m - 1], { kind: 'dashboardMonth', month: m }, true);
  }
  if (types.has('monthChart')) add('monthChart', 'chart', 'Month chart', { kind: 'monthChart' }, true);
  if (types.has('bracket')) add('bracket', 'bracket', 'Book bracket', { kind: 'bracket' }, false, 1200);
  if (types.has('yearDashboard')) {
    add('yearDashboard', 'dash-year-1', `${p.year} dashboard`, { kind: 'dashboardYear', part: 1 }, true, LANDSCAPE, 'even');
    add('yearDashboard', 'dash-year-2', `${p.year} dashboard, continued`, { kind: 'dashboardYear', part: 2 }, true);
  }
  if (types.has('bookLogs')) for (const r of data.reads) add('bookLogs', `book-${r.readId}`, r.title, { kind: 'book', bookId: r.bookId, readId: r.readId }, false, WIDE);
  if (types.has('quotes')) {
    const pages = paginate(data.quotes.map(quoteCost), QUOTE_BUDGET);
    pages.forEach((idx, n) => add('quotes', `quotes-${n}`, `Quotes ${n + 1}`, { kind: 'quotes', ids: idx.map((i) => data.quotes[i].id), part: n, parts: pages.length }, false, WIDE));
  }
  if (types.has('challengeTracker')) add('challengeTracker', 'chal-tracker', 'Challenge tracker', { kind: 'challenges' });
  if (types.has('challengeLogs')) for (const c of data.challenges) add('challengeLogs', `chal-${c.id}`, c.name, { kind: 'challenge', id: c.id }, false, WIDE);
  if (types.has('seriesLedger')) {
    const pages = paginate(data.ledger.map((r) => ledgerCost(r.marks)), LEDGER_BUDGET);
    pages.forEach((idx, n) => add('seriesLedger', `ledger-${n}`, `Series ledger ${n + 1}`, { kind: 'ledger', ids: idx.map((i) => data.ledger[i].id), part: n, parts: pages.length }, false, WIDE));
  }
  if (types.has('seriesLogs')) for (const s of data.series) add('seriesLogs', `series-${s.id}`, s.title, { kind: 'series', id: s.id }, false, WIDE);
  return out;
}

export interface PageLayout { starts: number[]; blankBefore: boolean[]; total: number }
/** Where each sheet starts. Page 1 is the title page and page 2 the contents. `counts` is how many pages each sheet takes (at least 1); a sheet that must sit on a left-hand page gets a blank page before it when it would land on the right. */
export function layoutPages(counts: number[], aligns: (string | undefined)[] = []): PageLayout {
  const starts: number[] = [], blankBefore: boolean[] = [];
  let n = 3;
  counts.forEach((c, i) => {
    const blank = aligns[i] === 'even' && n % 2 === 1;
    if (blank) n++;
    blankBefore.push(blank); starts.push(n); n += Math.max(1, c);
  });
  return { starts, blankBefore, total: n - 1 };
}

export interface TocEntry { label: string; page: number }
export interface TocSection { type: PrintType | 'pair'; title: string; from: number; to: number; entries: TocEntry[] }

/** The table of contents: one section per kind of page (the calendars and monthly dashboards are one, since they alternate). */
export function tocSections(sheets: SheetSpec[], starts: number[], counts: number[]): TocSection[] {
  const sections: TocSection[] = [];
  const titleOf = (t: PrintType) => PRINT_TYPES.find((x) => x.id === t)!.label;
  sheets.forEach((s, i) => {
    const pair = s.type === 'calendar' || s.type === 'dashboard';
    const key = pair ? 'pair' : s.type;
    let sec = sections[sections.length - 1];
    if (!sec || sec.type !== key) {
      sec = { type: key, title: pair ? 'Calendars and monthly dashboards' : titleOf(s.type), from: starts[i], to: starts[i], entries: [] };
      sections.push(sec);
    }
    sec.to = starts[i] + Math.max(1, counts[i]) - 1;
    const listed = s.type === 'calendar' || s.type === 'trackers';
    if (listed) sec.entries.push({ label: s.label, page: starts[i] });
  });
  return sections;
}

// What goes into a printed journal, and in what order. Pure functions, so the order is easy to test.

export type PrintType = 'trackers' | 'calendar' | 'dashboard' | 'monthChart' | 'bracket' | 'yearDashboard' | 'bookLogs' | 'challengeTracker' | 'challengeLogs' | 'seriesLedger' | 'seriesLogs';

/** In printing order. A month's Calendar is followed by that month's Dashboard, so those two share one place in the list. */
export const PRINT_TYPES: { id: PrintType; label: string; note: string }[] = [
  { id: 'trackers', label: 'Trackers', note: 'Days read and books finished' },
  { id: 'calendar', label: 'Calendar', note: 'One page per month' },
  { id: 'dashboard', label: 'Monthly dashboard', note: 'Follows its month\'s calendar' },
  { id: 'monthChart', label: 'Month chart', note: 'Books finished each month' },
  { id: 'bracket', label: 'Book bracket', note: 'Best of month, quarter, half, year' },
  { id: 'yearDashboard', label: 'Yearly dashboard', note: 'The year in numbers' },
  { id: 'bookLogs', label: 'Book logs', note: 'In the order you finished them' },
  { id: 'challengeTracker', label: 'Challenge tracker', note: 'Progress on every challenge' },
  { id: 'challengeLogs', label: 'Challenge logs', note: 'One page per challenge' },
  { id: 'seriesLedger', label: 'Series ledger', note: 'Every series at a glance' },
  { id: 'seriesLogs', label: 'Series logs', note: 'Series you read in this period' },
];

export type SheetView =
  | { kind: 'tracker'; tracker: 'pages' | 'books' }
  | { kind: 'calendar'; month: number }
  | { kind: 'dashboardMonth'; month: number }
  | { kind: 'dashboardYear' }
  | { kind: 'monthChart' }
  | { kind: 'bracket' }
  | { kind: 'book'; bookId: string; readId: string }
  | { kind: 'challenges' }
  | { kind: 'challenge'; id: string }
  | { kind: 'ledger' }
  | { kind: 'series'; id: string };

export interface SheetSpec { key: string; type: PrintType; label: string; landscape: boolean; width: number; view: SheetView }
export interface PrintData {
  activeMonths: number[];
  reads: { bookId: string; readId: string; title: string }[]; // finished in the period, in the order finished
  series: { id: string; title: string }[];
  challenges: { id: string; name: string }[];
}
export interface Period { year: number; month: number | null }

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const periodLabel = (p: Period) => (p.month ? `${MONTHS[p.month - 1]} ${p.year}` : String(p.year));

// How wide a page is laid out before it is shrunk to fit the paper (so text stays in proportion).
const PORTRAIT = 860, WIDE = 1000, LANDSCAPE = 1150, DASH = 1100;

export function planSheets(p: Period, types: ReadonlySet<PrintType>, data: PrintData): SheetSpec[] {
  const out: SheetSpec[] = [];
  const add = (type: PrintType, key: string, label: string, view: SheetView, landscape = false, width = landscape ? LANDSCAPE : PORTRAIT) => out.push({ key, type, label, landscape, width, view });
  if (types.has('trackers')) {
    add('trackers', 'trk-pages', 'Pages read', { kind: 'tracker', tracker: 'pages' });
    add('trackers', 'trk-books', 'Books finished', { kind: 'tracker', tracker: 'books' });
  }
  const months = p.month ? [p.month] : data.activeMonths;
  for (const m of months) {
    if (types.has('calendar')) add('calendar', `cal-${m}`, MONTHS[m - 1], { kind: 'calendar', month: m }, true);
    if (types.has('dashboard')) add('dashboard', `dash-${m}`, MONTHS[m - 1], { kind: 'dashboardMonth', month: m }, false, DASH);
  }
  if (types.has('monthChart')) add('monthChart', 'chart', 'Month chart', { kind: 'monthChart' }, true);
  if (types.has('bracket')) add('bracket', 'bracket', 'Book bracket', { kind: 'bracket' }, false, 1200);
  if (types.has('yearDashboard')) add('yearDashboard', 'dash-year', `${p.year} dashboard`, { kind: 'dashboardYear' }, false, DASH);
  if (types.has('bookLogs')) for (const r of data.reads) add('bookLogs', `book-${r.readId}`, r.title, { kind: 'book', bookId: r.bookId, readId: r.readId }, false, WIDE);
  if (types.has('challengeTracker')) add('challengeTracker', 'chal-tracker', 'Challenge tracker', { kind: 'challenges' });
  if (types.has('challengeLogs')) for (const c of data.challenges) add('challengeLogs', `chal-${c.id}`, c.name, { kind: 'challenge', id: c.id }, false, WIDE);
  if (types.has('seriesLedger')) add('seriesLedger', 'ledger', 'Series ledger', { kind: 'ledger' }, false, WIDE);
  if (types.has('seriesLogs')) for (const s of data.series) add('seriesLogs', `series-${s.id}`, s.title, { kind: 'series', id: s.id }, false, WIDE);
  return out;
}

/** The first page of each sheet. Page 1 is the table of contents; `counts` is how many pages each sheet takes (at least 1). */
export function startPages(counts: number[]): number[] {
  const starts: number[] = [];
  let n = 2;
  for (const c of counts) { starts.push(n); n += Math.max(1, c); }
  return starts;
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
    const listed = s.type === 'calendar' || s.type === 'bookLogs' || s.type === 'challengeLogs' || s.type === 'seriesLogs' || s.type === 'trackers';
    if (listed) sec.entries.push({ label: s.label, page: starts[i] });
  });
  return sections;
}

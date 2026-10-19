import { byTitle } from '../domain/sortKey';
import type { Db } from '../db/adapter';
import { autoLabel, metricInfo, paceOf, parseDisplay, parseFilters, parseIds, yearRange, type GoalDisplay, type GoalFilter, type Metric, type Pace } from '../domain/goals';
import { TOTAL_SQL } from '../domain/challenges';
import { newId } from '../domain/ids';
import { pagesPerDay, type PageRead } from '../domain/pages';
import { readingDays, streaksFor, type Format, type Streaks, type StreakRead } from '../domain/streaks';
import { listSeriesLedger } from './series';

const first = async <T,>(db: Db, sql: string, params: (string | number | null)[] = []) => (await db.select<T>(sql, params))[0];
const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

// ---------- journal years ----------
export async function ensureJournalYear(db: Db, year: number): Promise<string> {
  const row = await first<{ id: string }>(db, 'SELECT id FROM journal_year WHERE year = ? AND deleted_at IS NULL', [year]);
  if (row) return row.id;
  const id = newId();
  await db.execute('INSERT INTO journal_year (id, year) VALUES (?, ?)', [id, year]);
  return id;
}

// Every year that has reads or a journal record, plus this year, newest first.
export async function listJournalYears(db: Db, today: string): Promise<number[]> {
  const rows = await db.select<{ y: number | null }>(
    `SELECT DISTINCT y FROM (
       SELECT CAST(substr(finish_date, 1, 4) AS INTEGER) AS y FROM read WHERE deleted_at IS NULL AND finish_date IS NOT NULL
       UNION SELECT CAST(substr(start_date, 1, 4) AS INTEGER) FROM read WHERE deleted_at IS NULL AND start_date IS NOT NULL
       UNION SELECT year FROM journal_year WHERE deleted_at IS NULL)`);
  const set = new Set<number>([Number(today.slice(0, 4))]);
  for (const r of rows) if (r.y && r.y > 1900 && r.y < 3000) set.add(Number(r.y));
  return [...set].sort((a, b) => b - a);
}

export async function getSavedYear(db: Db): Promise<number | null> {
  const row = await first<{ value: string }>(db, "SELECT value FROM app_setting WHERE key = 'journal_year'");
  const n = row ? Number(row.value) : NaN;
  return Number.isInteger(n) ? n : null;
}
export const saveYear = (db: Db, year: number) =>
  db.execute(`INSERT INTO app_setting (key, value) VALUES ('journal_year', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = ${NOW}`, [String(year)]);

export async function getYearNotes(db: Db, year: number): Promise<string | null> {
  return (await first<{ notes: string | null }>(db, 'SELECT notes FROM journal_year WHERE year = ? AND deleted_at IS NULL', [year]))?.notes ?? null;
}
export async function setYearNotes(db: Db, year: number, notes: string | null) {
  const id = await ensureJournalYear(db, year);
  await db.execute('UPDATE journal_year SET notes = ? WHERE id = ?', [notes && notes.trim() ? notes : null, id]);
}

// ---------- goals ----------
export interface Goal {
  id: string; label: string; metric: Metric; target: number; start_date: string | null; end_date: string | null; filters: GoalFilter[]; sort_order: number;
  show_on_home: boolean; display: GoalDisplay; challenge_ids: string[] | null; // challenge_ids: null means every challenge of the year
}
export interface GoalInput {
  id?: string; label?: string; metric: Metric; target: number; start_date?: string | null; end_date?: string | null; filters?: GoalFilter[];
  show_on_home?: boolean; display?: GoalDisplay; challenge_ids?: string[] | null;
}
interface GoalRow { id: string; label: string; metric: Metric; target: number; start_date: string | null; end_date: string | null; filters: string | null; sort_order: number; show_on_home: number; display: string | null; challenge_ids: string | null }
const toGoal = (r: GoalRow): Goal => ({
  id: r.id, label: r.label, metric: r.metric, target: r.target, start_date: r.start_date, end_date: r.end_date, filters: parseFilters(r.filters), sort_order: r.sort_order,
  show_on_home: !!r.show_on_home, display: parseDisplay(r.display), challenge_ids: parseIds(r.challenge_ids),
});
const GOAL_COLS = 'g.id, g.label, g.metric, g.target, g.start_date, g.end_date, g.filters, g.sort_order, g.show_on_home, g.display, g.challenge_ids';
export const isTimed = (g: Pick<Goal, 'start_date' | 'end_date'>) => !!(g.start_date || g.end_date);

export async function listGoals(db: Db, year: number): Promise<Goal[]> {
  const rows = await db.select<GoalRow>(
    `SELECT ${GOAL_COLS} FROM goal g JOIN journal_year y ON y.id = g.journal_year_id
     WHERE y.year = ? AND y.deleted_at IS NULL AND g.deleted_at IS NULL ORDER BY g.sort_order, g.rowid`, [year]);
  return rows.map(toGoal);
}

function check(input: GoalInput, year: number) {
  if (!['books', 'pages', 'audio_hours', 'series_started', 'series_finished', 'challenges'].includes(input.metric)) throw new Error('Choose what the goal counts.');
  if (input.metric !== 'challenges' && (!Number.isFinite(input.target) || input.target <= 0)) throw new Error('The target must be a number above zero.');
  const { start_date: s, end_date: e } = input;
  if ((s && !e) || (!s && e)) throw new Error('A goal for part of the year needs both a start and an end date.');
  if (s && e && s > e) throw new Error('The end date must not be before the start date.');
  void year;
}

export async function saveGoal(db: Db, year: number, input: GoalInput): Promise<string> {
  check(input, year);
  const yid = await ensureJournalYear(db, year);
  const filters = metricInfo(input.metric).filterable ? (input.filters ?? []).filter((f) => f.ref) : [];
  const isCh = input.metric === 'challenges';
  const target = isCh ? 1 : input.target; // a challenge goal's target is worked out from the challenges themselves
  const label = input.label?.trim() || autoLabel(input.metric, target);
  const ids = isCh && input.challenge_ids?.length ? JSON.stringify(input.challenge_ids) : null;
  const values = [label, input.metric, target, input.start_date || null, input.end_date || null, filters.length ? JSON.stringify(filters) : null, input.show_on_home ? 1 : 0, input.display === 'bar' ? 'bar' : 'ring', ids];
  if (input.id) {
    await db.execute('UPDATE goal SET label = ?, metric = ?, target = ?, start_date = ?, end_date = ?, filters = ?, show_on_home = ?, display = ?, challenge_ids = ? WHERE id = ?', [...values, input.id]);
    return input.id;
  }
  const id = newId();
  const [{ n }] = await db.select<{ n: number }>('SELECT coalesce(max(sort_order), 0) + 1 AS n FROM goal WHERE journal_year_id = ? AND deleted_at IS NULL', [yid]);
  await db.execute('INSERT INTO goal (id, journal_year_id, label, metric, target, start_date, end_date, filters, show_on_home, display, challenge_ids, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, yid, ...values, Number(n)]);
  return id;
}

export const deleteGoal = (db: Db, id: string) => db.execute(`UPDATE goal SET deleted_at = ${NOW} WHERE id = ?`, [id]);

// Moves a goal up or down among the goals of its kind (yearly goals, or goals for part of the year).
export async function moveGoal(db: Db, year: number, id: string, dir: -1 | 1) {
  const all = await listGoals(db, year);
  const me = all.find((g) => g.id === id);
  if (!me) return;
  const group = all.filter((g) => isTimed(g) === isTimed(me));
  const i = group.findIndex((g) => g.id === id);
  const other = group[i + dir];
  if (!other) return;
  const order = all.map((g) => g.id);
  const a = order.indexOf(me.id); const b = order.indexOf(other.id);
  [order[a], order[b]] = [order[b], order[a]];
  for (let k = 0; k < order.length; k++) await db.execute('UPDATE goal SET sort_order = ? WHERE id = ?', [k + 1, order[k]]);
}

// Copies the whole-year goals of one year into another. Goals for part of the year have dates that belong to their own year, so they are left out.
export async function copyYearlyGoals(db: Db, fromYear: number, toYear: number): Promise<number> {
  const source = (await listGoals(db, fromYear)).filter((g) => !isTimed(g));
  for (const g of source) await saveGoal(db, toYear, { label: g.label, metric: g.metric, target: g.target, filters: g.filters, show_on_home: g.show_on_home, display: g.display }); // a challenge goal is copied as "all challenges" because the old challenges belong to the old year
  return source.length;
}

// ---------- the numbers ----------
interface ReadRow {
  id: string; book_id: string; status: StreakRead['status']; start_date: string | null; finish_date: string | null; format: Format | null;
  audio_length_seconds: number | null; rating: number | null; page_count: number | null; series_id: string | null; series_position: number | null;
}

export interface Facts {
  reads: ReadRow[];
  entries: Map<string, { date: string; page: number | null; percent: number | null }[]>;
  genres: Map<string, Set<string>>;
  tropes: Map<string, Set<string>>;
  series: Map<string, SeriesTimeline>;
  challenges: { id: string; year: number; done: number; total: number }[];
}
export interface SeriesTimeline { id: string; title: string; firstDate: string | null; finishedDate: string | null; isFinished: boolean; bookFirst: Map<string, string> }

export async function loadFacts(db: Db): Promise<Facts> {
  const reads = await db.select<ReadRow>(
    `SELECT r.id, r.book_id, r.status, r.start_date, r.finish_date, r.format, r.audio_length_seconds, r.rating, b.page_count, b.series_id, b.series_position
     FROM read r JOIN book b ON b.id = r.book_id WHERE r.deleted_at IS NULL AND b.deleted_at IS NULL ORDER BY r.rowid`);
  const entryRows = await db.select<{ read_id: string; date: string; page: number | null; percent: number | null }>(
    'SELECT read_id, entry_date AS date, position_page AS page, position_percent AS percent FROM day_entry WHERE deleted_at IS NULL');
  const entries = new Map<string, { date: string; page: number | null; percent: number | null }[]>();
  for (const e of entryRows) (entries.get(e.read_id) ?? entries.set(e.read_id, []).get(e.read_id)!).push({ date: e.date, page: e.page, percent: e.percent });

  const sets = async (sql: string) => {
    const map = new Map<string, Set<string>>();
    for (const r of await db.select<{ b: string; t: string }>(sql)) (map.get(r.b) ?? map.set(r.b, new Set()).get(r.b)!).add(r.t);
    return map;
  };
  // A book has a genre when it, or its series, is tagged with it.
  const genres = await sets(`SELECT bg.book_id AS b, bg.genre_id AS t FROM book_genre bg WHERE bg.deleted_at IS NULL
    UNION SELECT b.id, sg.genre_id FROM book b JOIN series_genre sg ON sg.series_id = b.series_id AND sg.deleted_at IS NULL WHERE b.deleted_at IS NULL`);
  const tropes = await sets('SELECT book_id AS b, trope_id AS t FROM book_trope WHERE deleted_at IS NULL');

  const ledger = await listSeriesLedger(db);
  const series = new Map<string, SeriesTimeline>();
  for (const s of ledger) series.set(s.id, { id: s.id, title: s.title, firstDate: null, finishedDate: null, isFinished: s.status === 'finished', bookFirst: new Map() });
  const bookFinish = new Map<string, { sid: string; main: boolean; date: string }>();
  for (const r of reads) {
    const t = r.series_id ? series.get(r.series_id) : undefined;
    if (!t) continue;
    const d = r.start_date ?? r.finish_date;
    if (d) {
      if (!t.firstDate || d < t.firstDate) t.firstDate = d;
      const prev = t.bookFirst.get(r.book_id);
      if (!prev || d < prev) t.bookFirst.set(r.book_id, d);
    }
    if (r.status === 'finished' && r.finish_date) {
      const cur = bookFinish.get(r.book_id);
      if (!cur || r.finish_date < cur.date) bookFinish.set(r.book_id, { sid: t.id, main: r.series_position === null || Number.isInteger(r.series_position), date: r.finish_date });
    }
  }
  for (const f of bookFinish.values()) if (f.main) {
    const t = series.get(f.sid)!;
    if (!t.finishedDate || f.date > t.finishedDate) t.finishedDate = f.date;
  }
  const challenges = await db.select<{ id: string; year: number; total: number; done: number }>(
    `SELECT c.id AS id, y.year AS year,
       ${TOTAL_SQL} AS total,
       (SELECT count(*) FROM challenge_slot s JOIN challenge_completion k ON k.slot_id = s.id AND k.deleted_at IS NULL
          JOIN read kr ON kr.id = k.read_id AND kr.deleted_at IS NULL AND kr.status = 'finished'
          WHERE s.challenge_id = c.id AND s.deleted_at IS NULL AND (s.is_free = 0 OR s.label <> '' OR s.art_image_id IS NOT NULL)) AS done
     FROM challenge c JOIN journal_year y ON y.id = c.journal_year_id WHERE y.deleted_at IS NULL AND c.deleted_at IS NULL`);
  return { reads, entries, genres, tropes, series, challenges };
}

const matches = (f: Facts, r: ReadRow, filters: GoalFilter[]) => filters.every((x) => {
  const has = x.kind === 'format' ? r.format === x.ref : (x.kind === 'genre' ? f.genres : f.tropes).get(r.book_id)?.has(x.ref) === true;
  return x.mode === 'include' ? has : !has;
});
const inRange = (d: string | null, from: string, to: string) => !!d && d >= from && d <= to;
const finished = (r: ReadRow) => r.status === 'finished' && !!r.finish_date;

export function seriesStarted(f: Facts, from: string, to: string) {
  return [...f.series.values()].filter((s) => inRange(s.firstDate, from, to)).map((s) => ({ id: s.id, title: s.title, date: s.firstDate! })).sort((a, b) => a.date.localeCompare(b.date));
}
export function seriesFinishedIn(f: Facts, from: string, to: string) {
  return [...f.series.values()].filter((s) => s.isFinished && inRange(s.finishedDate, from, to)).map((s) => ({ id: s.id, title: s.title, date: s.finishedDate! })).sort((a, b) => a.date.localeCompare(b.date));
}
// Series continued in the range: you finished a book of it in the range, it was not started in the range, and it was not already finished before the range.
// A series you finish in the range still counts here (and as finished).
export function seriesContinued(f: Facts, from: string, to: string) {
  const out: { id: string; title: string; books: number }[] = [];
  for (const s of f.series.values()) {
    if (inRange(s.firstDate, from, to)) continue;
    if (s.isFinished && s.finishedDate && s.finishedDate < from) continue;
    const books = new Set(f.reads.filter((r) => r.series_id === s.id && finished(r) && inRange(r.finish_date, from, to)).map((r) => r.book_id));
    if (books.size) out.push({ id: s.id, title: s.title, books: books.size });
  }
  return out.sort((a, b) => byTitle(a.title, b.title));
}

export function measure(f: Facts, metric: Metric, filters: GoalFilter[], from: string, to: string): number {
  switch (metric) {
    case 'books': return f.reads.filter((r) => finished(r) && inRange(r.finish_date, from, to) && matches(f, r, filters)).length;
    case 'audio_hours': return f.reads.filter((r) => finished(r) && r.format === 'audio' && inRange(r.finish_date, from, to) && matches(f, r, filters)).reduce((n, r) => n + (r.audio_length_seconds ?? 0), 0) / 3600;
    case 'pages': {
      const mine = f.reads.filter((r) => matches(f, r, filters));
      const perDay = pagesPerDay(mine.map((r): PageRead => ({ start: r.start_date, finish: r.status === 'finished' ? r.finish_date : null, pages: r.page_count, entries: f.entries.get(r.id) ?? [] })));
      let n = 0;
      for (const [d, p] of perDay) if (d >= from && d <= to) n += p;
      return Math.round(n);
    }
    case 'series_started': return seriesStarted(f, from, to).length;
    case 'series_finished': return seriesFinishedIn(f, from, to).length;
    case 'challenges': return 0; // measured by challengeTotals, which needs the year
  }
}

// Prompts filled and prompts in total across the chosen challenges of a year (all of them when none are chosen).
export function challengeTotals(f: Facts, year: number, ids: string[] | null) {
  const mine = f.challenges.filter((c) => c.year === year && (!ids || ids.includes(c.id)));
  return { done: mine.reduce((n, c) => n + c.done, 0), total: mine.reduce((n, c) => n + c.total, 0), count: mine.length };
}

// The goals the person chose to show on Home, for the current year.
export async function listHomeGoals(db: Db, today: string): Promise<GoalProgress[]> {
  const year = Number(today.slice(0, 4));
  const goals = (await listGoals(db, year)).filter((g) => g.show_on_home);
  if (!goals.length) return [];
  const f = await loadFacts(db);
  return goals.map((g) => progressOf(f, g, year, today));
}

export interface GoalProgress extends Goal { value: number; from: string; to: string; pace: Pace }
export function progressOf(f: Facts, g: Goal, year: number, today: string): GoalProgress {
  const range = yearRange(year);
  const from = g.start_date ?? range.from;
  const to = g.end_date ?? range.to;
  if (g.metric === 'challenges') {
    const t = challengeTotals(f, year, g.challenge_ids);
    const pace = t.total > 0 ? paceOf({ value: t.done, target: t.total, from, to, today, metric: 'challenges' })
      : { state: 'not_started' as const, text: 'No challenges to track yet', percent: 0, expected: null };
    return { ...g, target: t.total, value: t.done, from, to, pace };
  }
  const raw = measure(f, g.metric, g.filters, from, to);
  const value = g.metric === 'audio_hours' ? Math.round(raw * 10) / 10 : raw;
  return { ...g, value, from, to, pace: paceOf({ value, target: g.target, from, to, today, metric: g.metric }) };
}

// ---------- streaks ----------
export function streakData(f: Facts, today: string) {
  const reads: StreakRead[] = f.reads.map((r) => ({ status: r.status, start: r.start_date, finish: r.finish_date, format: r.format, entryDates: (f.entries.get(r.id) ?? []).map((e) => e.date) }));
  return readingDays(reads, today);
}
export function streaksForYear(f: Facts, year: number, today: string): { year: Streaks; all: Streaks } {
  const days = streakData(f, today);
  const r = yearRange(year);
  const firstDay = [...days.any].sort()[0] ?? today;
  return { year: streaksFor(days, r.from, r.to, today), all: streaksFor(days, firstDay, today, today) };
}

// ---------- the whole overview ----------
export interface Overview {
  year: number; notes: string | null;
  totals: { books: number; pages: number; audioHours: number; avgStars: number | null; rated: number; seriesStarted: number; seriesFinished: number; seriesContinued: number };
  yearly: GoalProgress[]; timed: GoalProgress[];
  started: { id: string; title: string; date: string }[]; finishedSeries: { id: string; title: string; date: string }[]; continued: { id: string; title: string; books: number }[];
  streaks: { year: Streaks; all: Streaks };
  canCopyFrom: number | null;
}

export async function getOverview(db: Db, year: number, today: string): Promise<Overview> {
  const f = await loadFacts(db);
  const { from, to } = yearRange(year);
  const goals = await listGoals(db, year);
  const prog = goals.map((g) => progressOf(f, g, year, today));
  const started = seriesStarted(f, from, to);
  const finishedSeries = seriesFinishedIn(f, from, to);
  const continued = seriesContinued(f, from, to);
  const rated = f.reads.filter((r) => finished(r) && inRange(r.finish_date, from, to) && r.rating !== null);
  const prev = await listGoals(db, year - 1);
  return {
    year, notes: await getYearNotes(db, year),
    totals: {
      books: measure(f, 'books', [], from, to), pages: measure(f, 'pages', [], from, to), audioHours: Math.round(measure(f, 'audio_hours', [], from, to) * 10) / 10,
      avgStars: rated.length ? rated.reduce((n, r) => n + r.rating!, 0) / rated.length / 4 : null, rated: rated.length,
      seriesStarted: started.length, seriesFinished: finishedSeries.length, seriesContinued: continued.length,
    },
    yearly: prog.filter((g) => !isTimed(g)), timed: prog.filter(isTimed),
    started, finishedSeries, continued,
    streaks: streaksForYear(f, year, today),
    canCopyFrom: goals.length === 0 && prev.some((g) => !isTimed(g)) ? year - 1 : null,
  };
}

import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { newId } from '../src/domain/ids';
import { paceOf } from '../src/domain/goals';
import { currentRun, longestGap, longestRun, readingDays, streaksFor } from '../src/domain/streaks';
import { addTag } from '../src/repo/bookLog';
import { createBook } from '../src/repo/books';
import * as g from '../src/repo/goals';
import { createSeries } from '../src/repo/series';

let db: Db;
beforeEach(() => { db = migrateNodeDb(); });

async function read(title: string, o: { start?: string | null; finish?: string | null; status?: string; format?: string | null; pages?: number | null; seconds?: number | null; rating?: number | null; series?: string; pos?: number; genres?: string[]; tropes?: string[]; bookId?: string }) {
  const bid = o.bookId ?? await createBook(db, { title, seriesId: o.series ?? null, seriesPosition: o.pos ?? null });
  if (o.pages) await db.execute('UPDATE book SET page_count = ? WHERE id = ?', [o.pages, bid]);
  for (const t of o.genres ?? []) await addTag(db, bid, 'genre', t);
  for (const t of o.tropes ?? []) await addTag(db, bid, 'trope', t);
  const rid = newId();
  await db.execute('INSERT INTO read (id, book_id, status, start_date, finish_date, format, audio_length_seconds, rating) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [rid, bid, o.status ?? 'finished', o.start ?? null, o.finish === undefined ? null : o.finish, o.format ?? null, o.seconds ?? null, o.rating ?? null]);
  return { bid, rid };
}
const id = async (table: string, name: string) => (await db.select<{ id: string }>(`SELECT id FROM ${table} WHERE name = ?`, [name]))[0].id;
const TODAY = '2026-10-15';

describe('goal numbers', () => {
  it('counts books, pages, and audiobook hours finished inside the dates', async () => {
    await read('A', { start: '2026-01-02', finish: '2026-01-04', format: 'physical', pages: 300 });
    await read('B', { start: '2026-02-01', finish: '2026-02-03', format: 'audio', seconds: 7200, pages: 200 });
    await read('C', { start: '2025-12-20', finish: '2025-12-30', format: 'ebook', pages: 100 });
    const f = await g.loadFacts(db);
    expect(g.measure(f, 'books', [], '2026-01-01', '2026-12-31')).toBe(2);
    expect(g.measure(f, 'audio_hours', [], '2026-01-01', '2026-12-31')).toBe(2);
    expect(g.measure(f, 'pages', [], '2026-01-01', '2026-12-31')).toBe(500);
    expect(g.measure(f, 'books', [], '2026-01-01', '2026-01-31')).toBe(1);
  });
  it('limits a goal to a genre, leaves one out, and does the same with tropes and formats', async () => {
    await read('Rom', { finish: '2026-03-01', format: 'audio', genres: ['Romance'], tropes: ['enemies to lovers'] });
    await read('Mys', { finish: '2026-03-02', format: 'physical', genres: ['Mystery'] });
    await read('Fan', { finish: '2026-03-03', format: 'audio', genres: ['Fantasy'], tropes: ['found family'] });
    const f = await g.loadFacts(db);
    const rom = await id('genre', 'Romance'); const efl = await id('trope', 'enemies to lovers');
    const count = (filters: g.GoalProgress['filters']) => g.measure(f, 'books', filters, '2026-01-01', '2026-12-31');
    expect(count([{ kind: 'genre', mode: 'include', ref: rom }])).toBe(1);
    expect(count([{ kind: 'genre', mode: 'exclude', ref: rom }])).toBe(2);
    expect(count([{ kind: 'trope', mode: 'include', ref: efl }])).toBe(1);
    expect(count([{ kind: 'trope', mode: 'exclude', ref: efl }])).toBe(2);
    expect(count([{ kind: 'format', mode: 'include', ref: 'audio' }])).toBe(2);
    expect(count([{ kind: 'format', mode: 'include', ref: 'audio' }, { kind: 'genre', mode: 'exclude', ref: rom }])).toBe(1);
  });
  it("counts a series' genre for its books", async () => {
    const sid = await createSeries(db, 'Hockey');
    await db.execute("INSERT INTO genre (id, name) VALUES ('g1', 'Sports')");
    await db.execute("INSERT INTO series_genre (id, series_id, genre_id) VALUES ('sg1', ?, 'g1')", [sid]);
    await read('H1', { finish: '2026-04-01', series: sid, pos: 1 });
    await read('Other', { finish: '2026-04-02' });
    const f = await g.loadFacts(db);
    expect(g.measure(f, 'books', [{ kind: 'genre', mode: 'include', ref: 'g1' }], '2026-01-01', '2026-12-31')).toBe(1);
  });
  it('counts a re-read as its own entry', async () => {
    const a = await read('Again', { finish: '2026-01-10' });
    await read('Again', { bookId: a.bid, finish: '2026-06-10' });
    expect(g.measure(await g.loadFacts(db), 'books', [], '2026-01-01', '2026-12-31')).toBe(2);
  });
});

describe('series started, finished, and continued', () => {
  async function setup() {
    const done = await createSeries(db, 'Done Quickly');
    await read('D1', { start: '2026-01-05', finish: '2026-01-10', series: done, pos: 1 });
    await read('D2', { start: '2026-01-11', finish: '2026-01-20', series: done, pos: 2 });
    await db.execute("UPDATE series SET total_books = 2, publication_status = 'complete' WHERE id = ?", [done]);
    const mid = await createSeries(db, 'Middle');
    await db.execute('UPDATE series SET total_books = 4 WHERE id = ?', [mid]);
    await read('M1', { start: '2025-11-01', finish: '2025-11-05', series: mid, pos: 1 });
    await read('M2', { start: '2026-03-01', finish: '2026-03-08', series: mid, pos: 2 });
    const solo = await createSeries(db, 'Brand New');
    await db.execute('UPDATE series SET total_books = 3 WHERE id = ?', [solo]);
    await read('S1', { start: '2026-05-01', finish: '2026-05-09', series: solo, pos: 1 });
    return { done, mid, solo };
  }
  it('lists the series you started and the ones you finished in the year', async () => {
    const { done, solo } = await setup();
    const f = await g.loadFacts(db);
    expect(g.seriesStarted(f, '2026-01-01', '2026-12-31').map((s) => s.id).sort()).toEqual([done, solo].sort());
    expect(g.seriesFinishedIn(f, '2026-01-01', '2026-12-31').map((s) => s.title)).toEqual(['Done Quickly']);
    expect(g.seriesFinishedIn(f, '2025-01-01', '2025-12-31')).toEqual([]);
  });
  it('counts a series as continued when you read on in one you had already started, without finishing it', async () => {
    await setup();
    const f = await g.loadFacts(db);
    expect(g.seriesContinued(f, '2026-01-01', '2026-12-31')).toEqual([{ id: expect.any(String), title: 'Middle', books: 1 }]);
    expect(g.seriesContinued(f, '2026-01-01', '2026-02-28')).toEqual([]); // nothing continued yet in those months
  });
  it('does not count a series you finished, or a first book, as continued', async () => {
    await setup();
    const names = g.seriesContinued(await g.loadFacts(db), '2026-01-01', '2026-12-31').map((s) => s.title);
    expect(names).not.toContain('Done Quickly');
    expect(names).not.toContain('Brand New');
  });
});

describe('goals', () => {
  it('saves, labels, orders, edits, and deletes goals', async () => {
    const a = await g.saveGoal(db, 2026, { metric: 'books', target: 52 });
    const b = await g.saveGoal(db, 2026, { label: 'Listening', metric: 'audio_hours', target: 100 });
    expect((await g.listGoals(db, 2026)).map((x) => x.label)).toEqual(['Read 52 books', 'Listening']);
    await g.moveGoal(db, 2026, b, -1);
    expect((await g.listGoals(db, 2026)).map((x) => x.label)).toEqual(['Listening', 'Read 52 books']);
    await g.saveGoal(db, 2026, { id: a, metric: 'books', target: 60, label: 'Sixty' });
    expect((await g.listGoals(db, 2026)).find((x) => x.id === a)).toMatchObject({ label: 'Sixty', target: 60 });
    await g.deleteGoal(db, a);
    expect(await g.listGoals(db, 2026)).toHaveLength(1);
    expect(await g.listGoals(db, 2025)).toEqual([]);
  });
  it('rejects bad input', async () => {
    await expect(g.saveGoal(db, 2026, { metric: 'books', target: 0 })).rejects.toThrow(/above zero/);
    await expect(g.saveGoal(db, 2026, { metric: 'books', target: 5, start_date: '2026-06-01' })).rejects.toThrow(/both a start and an end/);
    await expect(g.saveGoal(db, 2026, { metric: 'books', target: 5, start_date: '2026-06-10', end_date: '2026-06-01' })).rejects.toThrow(/not be before/);
  });
  it('keeps whole-year goals apart from goals for part of the year', async () => {
    await g.saveGoal(db, 2026, { metric: 'books', target: 50 });
    await g.saveGoal(db, 2026, { label: 'Summer', metric: 'books', target: 10, start_date: '2026-06-01', end_date: '2026-08-31' });
    await read('June', { finish: '2026-06-15' }); await read('March', { finish: '2026-03-15' });
    const o = await g.getOverview(db, 2026, TODAY);
    expect(o.yearly.map((x) => [x.label, x.value])).toEqual([['Read 50 books', 2]]);
    expect(o.timed.map((x) => [x.label, x.value, x.from, x.to])).toEqual([['Summer', 1, '2026-06-01', '2026-08-31']]);
  });
  it('copies last year\'s whole-year goals, and offers to only when the year has none', async () => {
    await g.saveGoal(db, 2025, { metric: 'books', target: 40, filters: [{ kind: 'format', mode: 'include', ref: 'audio' }] });
    await g.saveGoal(db, 2025, { label: 'Winter', metric: 'books', target: 5, start_date: '2025-12-01', end_date: '2025-12-31' });
    expect((await g.getOverview(db, 2026, TODAY)).canCopyFrom).toBe(2025);
    expect(await g.copyYearlyGoals(db, 2025, 2026)).toBe(1);
    const copied = await g.listGoals(db, 2026);
    expect(copied).toHaveLength(1);
    expect(copied[0].filters).toEqual([{ kind: 'format', mode: 'include', ref: 'audio' }]);
    expect((await g.getOverview(db, 2026, TODAY)).canCopyFrom).toBeNull();
  });
  it('ignores filters on goals that do not use them', async () => {
    const sid = await g.saveGoal(db, 2026, { metric: 'series_started', target: 5, filters: [{ kind: 'genre', mode: 'include', ref: 'x' }] });
    expect((await g.listGoals(db, 2026)).find((x) => x.id === sid)!.filters).toEqual([]);
  });
});

describe('pace hints', () => {
  const base = { target: 52, from: '2026-01-01', to: '2026-12-31', metric: 'books' as const };
  it('says ahead, behind, or on pace against an even pace over the dates', () => {
    expect(paceOf({ ...base, value: 50, today: '2026-07-01' }).text).toMatch(/^Ahead by 2[0-9] books$/);
    const behind = paceOf({ ...base, value: 10, today: '2026-07-01' });
    expect(behind.state).toBe('behind');
    expect(behind.text).toMatch(/^Behind by 16 books · needs 1\.6 books a week to finish$/);
    expect(paceOf({ ...base, value: 26, today: '2026-07-02' }).state).toBe('on_pace');
  });
  it('knows when a goal is done, has not started, or has ended', () => {
    expect(paceOf({ ...base, value: 52, today: '2026-02-01' })).toMatchObject({ state: 'done', percent: 100 });
    expect(paceOf({ ...base, from: '2026-06-01', value: 0, today: '2026-05-30' }).text).toBe('Starts in 2 days');
    expect(paceOf({ ...base, value: 40, today: '2027-01-02' }).text).toBe('Ended 12 books short');
  });
  it('works for hours with a decimal and pages with a tolerance', () => {
    expect(paceOf({ target: 100, from: '2026-01-01', to: '2026-12-31', metric: 'audio_hours', value: 60, today: '2026-07-01' }).text).toMatch(/^Ahead by \d+\.\d hours$/);
    expect(paceOf({ target: 10000, from: '2026-01-01', to: '2026-12-31', metric: 'pages', value: 5000, today: '2026-07-02' }).state).toBe('on_pace');
  });
});

describe('streaks', () => {
  const day = (finish: string, start: string | null = null, format: 'audio' | 'ebook' | 'physical' | null = null) => ({ status: 'finished' as const, start, finish, format, entryDates: [] });
  it('counts every day of a read between its start and finish, and any logged day', () => {
    const d = readingDays([day('2026-03-05', '2026-03-03', 'audio'), { status: 'reading', start: null, finish: null, format: 'ebook', entryDates: ['2026-03-07'] }], TODAY);
    expect([...d.any].sort()).toEqual(['2026-03-03', '2026-03-04', '2026-03-05', '2026-03-07']);
    expect([...d.byFormat.audio].sort()).toEqual(['2026-03-03', '2026-03-04', '2026-03-05']);
    expect([...d.finished]).toEqual(['2026-03-05']);
    expect([...d.byFormat.ebook]).toEqual(['2026-03-07']);
  });
  it('splits a book with no day log evenly over its days, so every one of them counts', () => {
    const d = readingDays([day('2026-04-06', '2026-04-01', 'physical')], TODAY);
    expect([...d.any].sort()).toEqual(['2026-04-01', '2026-04-02', '2026-04-03', '2026-04-04', '2026-04-05', '2026-04-06']);
  });
  it('counts only the logged days and the finish day for a book with some days logged', () => {
    const d = readingDays([{ status: 'finished', start: '2026-04-01', finish: '2026-04-10', format: 'audio', entryDates: ['2026-04-03', '2026-04-04'] }], TODAY);
    expect([...d.any].sort()).toEqual(['2026-04-03', '2026-04-04', '2026-04-10']); // the rest is assumed read on the finish day
    expect([...d.byFormat.audio].sort()).toEqual(['2026-04-03', '2026-04-04', '2026-04-10']);
    expect([...d.finished]).toEqual(['2026-04-10']);
    const s = streaksFor(d, '2026-01-01', '2026-12-31', TODAY);
    expect(s.any).toMatchObject({ length: 2, start: '2026-04-03', end: '2026-04-04' });
    expect(s.audio!.length).toBe(2);
  });
  it('counts only logged days for a book in progress that has a log, and every day since the start when it has none', () => {
    const withLog = readingDays([{ status: 'reading', start: '2026-10-01', finish: null, format: null, entryDates: ['2026-10-05'] }], TODAY);
    expect([...withLog.any]).toEqual(['2026-10-05']);
    const noLog = readingDays([{ status: 'reading', start: '2026-10-13', finish: null, format: null, entryDates: [] }], TODAY);
    expect([...noLog.any].sort()).toEqual(['2026-10-13', '2026-10-14', '2026-10-15']);
  });
  it('counts a log written on a date but without a position the same way', () => {
    const d = readingDays([{ status: 'finished', start: '2026-02-01', finish: '2026-02-20', format: null, entryDates: ['2026-02-02'] }], TODAY);
    expect([...d.any].sort()).toEqual(['2026-02-02', '2026-02-20']);
  });
  it('finds the longest run of reading days, of finishing days, and of days off', () => {
    const d = readingDays([day('2026-03-05', '2026-03-03'), day('2026-03-06'), day('2026-03-07'), day('2026-03-20', '2026-03-18')], TODAY);
    const s = streaksFor(d, '2026-01-01', '2026-12-31', TODAY);
    expect(s.any).toMatchObject({ length: 5, start: '2026-03-03', end: '2026-03-07' });
    expect(s.finished).toMatchObject({ length: 3, start: '2026-03-05', end: '2026-03-07' });
    expect(s.notReading!.length).toBeGreaterThan(200); // from March 21 to today
    expect(s.notReading).toMatchObject({ start: '2026-03-21', end: TODAY, ongoing: true });
    expect(s.audio).toBeNull();
  });
  it('tracks a streak per format and ignores the future', () => {
    const d = readingDays([day('2026-05-03', '2026-05-01', 'audio'), day('2026-05-10', '2026-05-09', 'physical'), day('2026-05-12', '2026-05-04', 'audio')], TODAY);
    const s = streaksFor(d, '2026-01-01', '2026-12-31', TODAY);
    expect(s.audio).toMatchObject({ length: 12, start: '2026-05-01', end: '2026-05-12' }); // the two audio reads run back to back
    expect(s.physical).toMatchObject({ length: 2 });
    expect(streaksFor(d, '2027-01-01', '2027-12-31', TODAY).any).toBeNull();
  });
  it('reports the streak you are on, even if today is not logged yet', () => {
    const days = new Set(['2026-10-12', '2026-10-13', '2026-10-14']);
    expect(currentRun(days, TODAY)).toMatchObject({ length: 3, end: '2026-10-14' });
    expect(currentRun(new Set(['2026-10-10']), TODAY)).toBeNull();
    expect(longestRun(days, '2026-10-01', TODAY)!.length).toBe(3);
    expect(longestGap(days, '2026-10-01', TODAY)!.length).toBe(11);
  });
  it('builds the year and all-time streaks from the database', async () => {
    await read('A', { start: '2025-12-30', finish: '2026-01-03', format: 'audio' });
    await read('B', { start: '2026-01-04', finish: '2026-01-04', format: 'audio' });
    const f = await g.loadFacts(db);
    const s = g.streaksForYear(f, 2026, TODAY);
    expect(s.year.any).toMatchObject({ length: 4, start: '2026-01-01' });
    expect(s.all.any).toMatchObject({ length: 6, start: '2025-12-30', end: '2026-01-04' });
  });
});

describe('streaks and day logs from the database', () => {
  it('uses the logged days of a book that has a log, and the finish day', async () => {
    const r = await read('Logged', { start: '2026-06-01', finish: '2026-06-20', format: 'ebook' });
    await db.execute('INSERT INTO day_entry (id, read_id, entry_date, position_page) VALUES (?, ?, ?, ?)', [newId(), r.rid, '2026-06-05', 50]);
    await db.execute('INSERT INTO day_entry (id, read_id, entry_date, position_page) VALUES (?, ?, ?, ?)', [newId(), r.rid, '2026-06-06', 90]);
    await read('Unlogged', { start: '2026-07-01', finish: '2026-07-04', format: 'audio' });
    const s = g.streaksForYear(await g.loadFacts(db), 2026, TODAY).year;
    expect(s.any).toMatchObject({ length: 4, start: '2026-07-01', end: '2026-07-04' }); // the unlogged book fills its days; the logged one does not
    expect(s.ebook).toMatchObject({ length: 2, start: '2026-06-05', end: '2026-06-06' });
    expect(s.audio).toMatchObject({ length: 4 });
  });
});

describe('journal years', () => {
  it('lists years with reads plus this year, newest first, and remembers the chosen year', async () => {
    await read('Old', { finish: '2024-02-02' });
    await read('Newer', { start: '2025-12-31', finish: '2026-01-02' });
    await g.ensureJournalYear(db, 2028);
    expect(await g.listJournalYears(db, TODAY)).toEqual([2028, 2026, 2025, 2024]);
    expect(await g.getSavedYear(db)).toBeNull();
    await g.saveYear(db, 2025); await g.saveYear(db, 2024);
    expect(await g.getSavedYear(db)).toBe(2024);
  });
  it('keeps year notes', async () => {
    await g.setYearNotes(db, 2026, 'A good year');
    expect(await g.getYearNotes(db, 2026)).toBe('A good year');
    await g.setYearNotes(db, 2026, '  ');
    expect(await g.getYearNotes(db, 2026)).toBeNull();
  });
  it('totals the year', async () => {
    await read('R', { finish: '2026-02-01', pages: 100, rating: 16, format: 'physical' });
    await read('R2', { finish: '2026-02-02', pages: 50, rating: 20, format: 'audio', seconds: 3600 });
    const o = await g.getOverview(db, 2026, TODAY);
    expect(o.totals).toMatchObject({ books: 2, pages: 150, audioHours: 1, avgStars: 4.5, rated: 2 });
  });
});

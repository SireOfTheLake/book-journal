import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { migrateNodeDb } from '../src/db/nodeDb';
import { addDays, daysBetween, pagesPerDay } from '../src/domain/pages';
import { applyNotionPlan } from '../src/import/apply';
import { planNotionBooks } from '../src/import/notion';
import { getCalendarMonth } from '../src/repo/calendar';
import { saveDayEntry, updateBook, updateRead } from '../src/repo/bookLog';

const csv = readFileSync(new URL('./fixtures/book-tracker.csv', import.meta.url), 'utf8');
const get = (m: Map<string, number>) => Object.fromEntries([...m].map(([k, v]) => [k, Math.round(v)]));

describe('pages per day', () => {
  it('works out days', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(daysBetween('2026-03-01', '2026-03-03')).toEqual(['2026-03-01', '2026-03-02', '2026-03-03']);
  });
  it('spreads pages evenly from start to finish when nothing is logged', () => {
    expect(get(pagesPerDay([{ start: '2026-01-01', finish: '2026-01-03', pages: 300, entries: [] }]))).toEqual({ '2026-01-01': 100, '2026-01-02': 100, '2026-01-03': 100 });
  });
  it('puts everything on the finish day when there is no start date', () => {
    expect(get(pagesPerDay([{ start: null, finish: '2026-01-03', pages: 300, entries: [] }]))).toEqual({ '2026-01-03': 300 });
  });
  it('uses logged positions, with the rest on the finish day', () => {
    const r = { start: '2026-01-01', finish: '2026-01-03', pages: 300, entries: [{ date: '2026-01-01', page: null, percent: 40 }, { date: '2026-01-02', page: 210, percent: null }] };
    expect(get(pagesPerDay([r]))).toEqual({ '2026-01-01': 120, '2026-01-02': 90, '2026-01-03': 90 });
  });
  it('ignores books with no page count, and unfinished books without entries', () => {
    expect(pagesPerDay([{ start: '2026-01-01', finish: '2026-01-03', pages: null, entries: [] }, { start: '2026-01-01', finish: null, pages: 300, entries: [] }]).size).toBe(0);
  });
  it('adds up several books on the same day', () => {
    const a = { start: null, finish: '2026-01-03', pages: 100, entries: [] };
    expect(get(pagesPerDay([a, a]))).toEqual({ '2026-01-03': 200 });
  });
});

describe('a month of the calendar', () => {
  async function setup() {
    const db = migrateNodeDb();
    await applyNotionPlan(db, planNotionBooks(csv), { tagDestinations: {} });
    return db;
  }
  const id = async (db: Awaited<ReturnType<typeof setup>>, t: string) => (await db.select<{ id: string }>('SELECT id FROM book WHERE title = ?', [t]))[0].id;
  const rid = async (db: Awaited<ReturnType<typeof setup>>, t: string) => (await db.select<{ id: string }>('SELECT r.id AS id FROM read r JOIN book b ON b.id = r.book_id WHERE b.title = ?', [t]))[0].id;

  it('lists the books finished that month, with their days', async () => {
    const db = await setup();
    const m = await getCalendarMonth(db, 2026, 10, '2026-10-09');
    expect(m.finishes.map((f) => [f.finish_date, f.title])).toEqual(
      expect.arrayContaining([['2026-10-04', 'Bro Doll'], ['2026-10-05', 'MateHub: Legend'], ['2026-10-06', 'Killer Love'], ['2026-10-08', 'Corner Office']]));
    expect(m.finishes).toHaveLength(5);
    expect(new Set(m.finishes.map((f) => f.finish_date)).size).toBe(4);
    expect(m.lines).toEqual([]); // imported books have no start dates, so no lines
    expect((await getCalendarMonth(db, 2026, 11, '2026-10-09')).finishes).toEqual([]);
  });
  it('draws a line from the start date, and a flag for a day entry', async () => {
    const db = await setup();
    await updateRead(db, await rid(db, 'MateHub: Legend'), { start_date: '2026-10-03' });
    await saveDayEntry(db, await rid(db, 'MateHub: Legend'), { date: '2026-10-04', percent: 62 });
    const m = await getCalendarMonth(db, 2026, 10, '2026-10-09');
    expect(m.lines).toEqual([expect.objectContaining({ title: 'MateHub: Legend', from: '2026-10-03', to: '2026-10-05', open: false })]);
    expect(m.entries.map((e) => [e.date, e.percent])).toEqual([['2026-10-04', 62]]);
  });
  it('continues a line from the previous month, and runs an unfinished book to today', async () => {
    const db = await setup();
    await updateRead(db, await rid(db, 'Killer Love'), { start_date: '2026-09-29' });
    const oct = await getCalendarMonth(db, 2026, 10, '2026-10-09');
    expect(oct.lines[0]).toMatchObject({ from: '2026-09-29', to: '2026-10-06' });
    const sep = await getCalendarMonth(db, 2026, 9, '2026-10-09');
    expect(sep.lines[0].title).toBe('Killer Love');
  });
  it('works out pages per day from page counts', async () => {
    const db = await setup();
    await updateBook(db, await id(db, 'Bro Doll'), { page_count: 300 });
    await updateBook(db, await id(db, 'Killer Love'), { page_count: 200 });
    const m = await getCalendarMonth(db, 2026, 10, '2026-10-09');
    expect(m.pages).toEqual({ '2026-10-04': 300, '2026-10-06': 200 });
  });
});

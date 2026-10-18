import { newId } from '../src/domain/ids';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { countMakeups, dayBefore, monthRange, pageDots, sourceMix, splitProgress, starDots, topCounts, uniqueCounts } from '../src/domain/dashboard';
import { addTag, createListItem, createRead, deleteBook, setBookCover, updateBook, updateRead } from '../src/repo/bookLog';
import { addCharacterToBook, addOccupation, createCharacter } from '../src/repo/characters';
import { createSeries, setBookSeries } from '../src/repo/series';
import { getOverview } from '../src/repo/goals';
import { createBook } from '../src/repo/books';
import * as ch from '../src/repo/challenges';
import { getMonthlyDashboard, getYearlyDashboard } from '../src/repo/dashboard';
import { saveGoal } from '../src/repo/goals';

let db: Db;
beforeEach(() => { db = migrateNodeDb(); });

async function finished(title: string, finish: string, o: { start?: string; pages?: number; rating?: number; authors?: string[]; format?: 'physical' | 'audio' | 'ebook'; audio?: number } = {}) {
  const b = await createBook(db, { title, authors: o.authors ?? ['Au'] });
  if (o.pages) await updateBook(db, b, { page_count: o.pages });
  const r = await createRead(db, b, 'finished');
  await updateRead(db, r, { finish_date: finish, start_date: o.start ?? null, rating: o.rating ?? null, format: o.format ?? null, audio_length_seconds: o.audio ?? null });
  return { b, r };
}

describe('dashboard helpers', () => {
  it('works out month ranges and the day before', () => {
    expect(monthRange(2026, 2)).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthRange(2028, 2).to).toBe('2028-02-29');
    expect(dayBefore('2026-03-01')).toBe('2026-02-28');
  });
  it('splits a goal bar into before, this month and what is left', () => {
    expect(splitProgress({ before: 20, month: 10, target: 100 })).toEqual({ before: 20, month: 10, rest: 70 });
    expect(splitProgress({ before: 90, month: 30, target: 100 })).toEqual({ before: 90, month: 10, rest: 0 });
    expect(splitProgress({ before: 0, month: 0, target: 0 })).toEqual({ before: 0, month: 0, rest: 100 });
  });
  it('counts the most common values, ignoring blanks', () => {
    expect(topCounts(['b', 'a', 'b', ' ', null, 'a', 'c'], 2)).toEqual([{ name: 'a', count: 2 }, { name: 'b', count: 2 }]);
  });
  it('puts pages in ten-page columns, rounded down, in three colour groups', () => {
    const d = pageDots([114, 119, 120, 199, 200, 520, null]);
    expect(d.columns).toEqual([{ x: 110, count: 2, group: 0 }, { x: 120, count: 1, group: 0 }, { x: 190, count: 1, group: 0 }, { x: 200, count: 1, group: 1 }, { x: 520, count: 1, group: 2 }]);
    expect(d.max).toBe(600);
    expect(pageDots([1230]).max).toBe(1300);
  });
  it('puts stars in quarter steps, coloured by the whole star', () => {
    expect(starDots([20, 19, 19, 12, 0, null])).toEqual([{ x: 0, count: 1, group: 0 }, { x: 3, count: 1, group: 3 }, { x: 4.75, count: 2, group: 4 }, { x: 5, count: 1, group: 5 }]);
  });
  it('lists every relationship type, including those with none', () => {
    const c = countMakeups(['MM', 'MM', 'MF', 'unknown']);
    expect(c.map((x) => x.name)).toEqual(['MM', 'FF', 'XX', 'MF', 'MX', 'FX', 'Other', 'unknown']);
    expect(c.map((x) => x.count)).toEqual([2, 0, 0, 1, 0, 0, 0, 1]);
  });
  it('lays out formats and, under each, their sources, on a 0 to 100 scale', () => {
    const mix = sourceMix([
      { format: 'audio', source: 'Libby', color: null }, { format: 'audio', source: 'Libby', color: null }, { format: 'audio', source: 'Audible', color: null },
      { format: 'ebook', source: 'Kindle', color: null }, { format: 'physical', source: null, color: null },
    ]);
    expect(mix.map((f) => [f.format, f.total, f.start, f.share])).toEqual([['ebook', 1, 0, 20], ['audio', 3, 20, 60], ['physical', 1, 80, 20]]);
    expect(mix[1].sources.map((s) => [s.name, s.count, s.start, s.share])).toEqual([['Libby', 2, 20, 40], ['Audible', 1, 60, 20]]);
    expect(mix[2].sources[0].name).toBe('No source');
    expect(sourceMix([])).toEqual([]);
  });
  it('counts a character once however many books they are in', () => {
    expect(uniqueCounts([{ id: 'c1', value: 'Carl' }, { id: 'c1', value: 'Carl' }, { id: 'c2', value: 'Carl' }, { id: 'c3', value: 'Sam' }])).toEqual([{ name: 'Carl', count: 2 }, { name: 'Sam', count: 1 }]);
  });
});

describe('the monthly dashboard', () => {
  it('shows goal progress made before the month in one part and the month in another', async () => {
    for (let i = 1; i <= 4; i++) await finished(`Early ${i}`, i <= 2 ? `2026-01-1${i}` : `2026-02-0${i}`);
    for (let i = 1; i <= 3; i++) await finished(`March ${i}`, `2026-03-0${i}`);
    await finished('April 1', '2026-04-02');
    await saveGoal(db, 2026, { metric: 'books', target: 10, label: 'Ten books' });
    const march = await getMonthlyDashboard(db, 2026, 3);
    expect(march.goals[0]).toMatchObject({ label: 'Ten books', before: 4, month: 3, total: 7, target: 10, split: { before: 40, month: 30, rest: 30 } });
    const feb = await getMonthlyDashboard(db, 2026, 2);
    expect(feb.goals[0]).toMatchObject({ before: 2, month: 2, total: 4 });
    const jan = await getMonthlyDashboard(db, 2026, 1);
    expect(jan.goals[0]).toMatchObject({ before: 0, month: 2 });
  });
  it('only lists dated goals in the months they cover, and measures them from their own start', async () => {
    await finished('Jan', '2026-01-10'); await finished('Mar', '2026-03-10'); await finished('Apr', '2026-04-10');
    await saveGoal(db, 2026, { metric: 'books', target: 5, label: 'Spring', start_date: '2026-03-01', end_date: '2026-05-31' });
    expect((await getMonthlyDashboard(db, 2026, 2)).goals).toEqual([]);
    expect((await getMonthlyDashboard(db, 2026, 3)).goals[0]).toMatchObject({ before: 0, month: 1 });
    expect((await getMonthlyDashboard(db, 2026, 4)).goals[0]).toMatchObject({ before: 1, month: 1, total: 2 });
  });
  it('splits pages goals and challenge goals the same way', async () => {
    await finished('Feb Book', '2026-02-10', { start: '2026-02-01', pages: 300 });
    await finished('Mar Book', '2026-03-10', { start: '2026-03-01', pages: 200 });
    const id = await ch.createGrid(db, { year: 2026, name: 'Cozy', prompts: ['A', 'B', 'C', 'D'] });
    const slots = (await ch.getChallenge(db, id))!.loose;
    const feb = (await db.select<{ id: string }>("SELECT id FROM read WHERE finish_date = '2026-02-10'"))[0].id;
    const mar = (await db.select<{ id: string }>("SELECT id FROM read WHERE finish_date = '2026-03-10'"))[0].id;
    await ch.fillSlot(db, slots[0].id, feb); await ch.fillSlot(db, slots[1].id, mar);
    await saveGoal(db, 2026, { metric: 'pages', target: 1000, label: 'Pages' });
    await saveGoal(db, 2026, { metric: 'challenges', target: 0, label: 'All challenges' });
    const d = await getMonthlyDashboard(db, 2026, 3);
    expect(d.goals.find((g) => g.label === 'Pages')).toMatchObject({ before: 300, month: 200, total: 500 });
    expect(d.goals.find((g) => g.label === 'All challenges')).toMatchObject({ before: 1, month: 1, target: 4, split: { before: 25, month: 25, rest: 50 } });
    expect(d.challenges[0]).toMatchObject({ name: 'Cozy', before: 1, month: 1, total: 4 });
  });
  it('gives stickers for the prompts filled this month only', async () => {
    const feb = await finished('Feb Book', '2026-02-10'); const mar = await finished('Mar Book', '2026-03-10');
    await setBookCover(db, mar.b, { dataUrl: 'data:image/png;base64,AAAA' });
    const id = await ch.createGrid(db, { year: 2026, name: 'Cozy', prompts: ['A', 'B'] });
    const slots = (await ch.getChallenge(db, id))!.loose;
    await ch.fillSlot(db, slots[0].id, feb.r); await ch.fillSlot(db, slots[1].id, mar.r);
    const d = await getMonthlyDashboard(db, 2026, 3);
    expect(d.stickers).toHaveLength(1);
    expect(d.stickers[0]).toMatchObject({ challenge: 'Cozy', label: 'B', title: 'Mar Book', kind: 'grid' });
    expect(d.stickers[0].cover).toContain('data:image');
  });
  it('totals the month and finds the common values, extremes and distributions', async () => {
    const src = await createListItem(db, 'source', 'Libby');
    const a = await finished('Alpha', '2026-03-05', { start: '2026-03-01', pages: 150, rating: 20, authors: ['Ann'], format: 'physical' });
    const b = await finished('Beta', '2026-03-12', { start: '2026-03-10', pages: 450, rating: 14, authors: ['Ann', 'Bo'], format: 'audio', audio: 7200 });
    await finished('Gamma', '2026-03-20', { pages: 320, authors: ['Cy'], format: 'audio', audio: 3600 });
    await finished('Outside', '2026-04-02', { pages: 999 });
    await updateRead(db, a.r, { source_id: src }); await updateRead(db, b.r, { source_id: src });
    await addTag(db, a.b, 'genre', 'Fantasy'); await addTag(db, b.b, 'genre', 'Fantasy'); await addTag(db, b.b, 'trope', 'Slow burn');
    await updateBook(db, a.b, { is_favorite: 1 });
    const d = await getMonthlyDashboard(db, 2026, 3);
    expect(d.totals).toMatchObject({ books: 3, pages: 920, audioHours: 3, avgPages: 307, rated: 2 });
    expect(d.totals.avgStars).toBeCloseTo(4.25, 2);
    expect(d.totals.avgDays).toBe(4); // 5 and 3 days, counting both ends
    expect(d.top.authors[0]).toEqual({ name: 'Ann', count: 2 });
    expect(d.top.genres).toEqual([{ name: 'Fantasy', count: 2 }]);
    expect(d.sourceMix.map((f) => [f.format, f.total])).toEqual([['audio', 2], ['physical', 1]]);
    expect(d.sourceMix[0].sources.map((x) => x.name)).toEqual(['Libby', 'No source']);
    expect(d.favorites.map((x) => x.title)).toEqual(['Alpha']);
    expect([d.shortest?.title, d.longest?.title, d.shortestAudio?.title, d.longestAudio?.title]).toEqual(['Alpha', 'Beta', 'Gamma', 'Beta']);
    expect(d.pageDots.columns.map((c) => [c.x, c.group])).toEqual([[150, 0], [320, 1], [450, 1]]);
    expect(d.starDots.map((c) => [c.x, c.count])).toEqual([[3.5, 1], [5, 1]]);
    expect((await getMonthlyDashboard(db, 2026, 5)).totals.books).toBe(0);
  });

  it('counts a main character and their job once, even when they are in two books that month', async () => {
    const one = await finished('Dungeon One', '2026-03-05'); const two = await finished('Dungeon Two', '2026-03-15'); const three = await finished('Other', '2026-03-20');
    const carl = await createCharacter(db, 'Carl'); await addOccupation(db, carl, 'Coal miner');
    const sam = await createCharacter(db, 'Sam'); await addOccupation(db, sam, 'Coal miner');
    for (const b of [one.b, two.b]) await addCharacterToBook(db, carl, b, 'main');
    await addCharacterToBook(db, sam, three.b, 'main');
    const d = await getMonthlyDashboard(db, 2026, 3);
    expect(d.top.characters).toEqual([{ name: 'Carl', count: 1 }, { name: 'Sam', count: 1 }]);
    expect(d.top.jobs).toEqual([{ name: 'Coal miner', count: 2 }]);
  });
  it('counts first names only, US states only, and non-US countries only', async () => {
    const one = await finished('Setting One', '2026-04-05'); const two = await finished('Setting Two', '2026-04-10');
    const jon = await createCharacter(db, 'Jon Snow'); const jonB = await createCharacter(db, 'Jon Arryn');
    await addCharacterToBook(db, jon, one.b, 'main'); await addCharacterToBook(db, jonB, two.b, 'main');
    const place = async (b: string, name: string, state: string | null, country: string | null) => {
      const id = newId();
      await db.execute('INSERT INTO place (id, name, state_region, country) VALUES (?, ?, ?, ?)', [id, name, state, country]);
      await db.execute('INSERT INTO book_place (id, book_id, place_id, sort_order) VALUES (?, ?, ?, 1)', [newId(), b, id]);
    };
    await place(one.b, 'Austin', 'Texas', 'United States'); await place(two.b, 'Waco', 'texas', 'USA');
    await place(one.b, 'Washington', 'District of Columbia', 'United States'); await place(one.b, 'Toronto', 'Ontario', 'Canada');
    await place(two.b, 'Paris', null, 'France'); await place(two.b, 'Perth', 'Western Australia', 'Australia'); await place(two.b, 'Dallas', 'Texas', 'France');
    const d = await getMonthlyDashboard(db, 2026, 4);
    expect(d.top.characters).toEqual([{ name: 'Jon', count: 2 }]);
    expect(d.top.states).toEqual([{ name: 'Texas', count: 2 }]);
    expect(d.top.countries.map((c) => c.name).sort()).toEqual(['Australia', 'Canada', 'France']);
  });
  it('counts a series as continued when read this month, not when started this month, and also when finished this month', async () => {
    const s1 = await createSeries(db, 'Started Now'); const s2 = await createSeries(db, 'Older'); const s3 = await createSeries(db, 'Done Long Ago');
    const a1 = await finished('A1', '2026-03-02', { start: '2026-03-01' }); await setBookSeries(db, a1.b, s1, 1);
    const a2 = await finished('A2', '2026-03-20', { start: '2026-03-10' }); await setBookSeries(db, a2.b, s1, 2);
    const b1 = await finished('B1', '2026-01-10', { start: '2026-01-02' }); await setBookSeries(db, b1.b, s2, 1);
    const b2 = await finished('B2', '2026-03-10', { start: '2026-03-02' }); await setBookSeries(db, b2.b, s2, 2);
    const c1 = await finished('C1', '2026-03-12'); await setBookSeries(db, c1.b, s3, 1);
    await db.execute('UPDATE series SET total_books = 2, publication_status = ? WHERE id = ?', ['complete', s2]);
    const d = await getMonthlyDashboard(db, 2026, 3);
    expect(d.series.started.map((x) => x.title).sort()).toEqual(['Done Long Ago', 'Started Now']);
    expect(d.series.continued.map((x) => x.title)).toEqual(['Older']);
    expect(d.series.finished.map((x) => x.title)).toEqual(['Older']); // continued and finished
    const year = await getOverview(db, 2026, '2026-12-31');
    expect(year.continued.map((x) => x.title)).not.toContain('Started Now');
  });
});

describe('deleting a whole book', () => {
  it('removes the book, its reads, challenge picks and tags, and keeps authors', async () => {
    const x = await finished('Doomed', '2026-03-05', { authors: ['Keeper'] });
    await addTag(db, x.b, 'genre', 'Fantasy');
    const id = await ch.createGrid(db, { year: 2026, name: 'Cozy', prompts: ['A'] });
    await ch.fillSlot(db, (await ch.getChallenge(db, id))!.loose[0].id, x.r);
    await deleteBook(db, x.b);
    expect((await db.select('SELECT id FROM book WHERE deleted_at IS NULL')).length).toBe(0);
    expect((await db.select('SELECT id FROM read WHERE deleted_at IS NULL')).length).toBe(0);
    expect((await ch.getChallenge(db, id))!.done).toBe(0);
    expect((await db.select('SELECT id FROM author WHERE deleted_at IS NULL AND name = ?', ['Keeper'])).length).toBe(1);
    expect((await getMonthlyDashboard(db, 2026, 3)).totals.books).toBe(0);
    await expect(deleteBook(db, x.b)).rejects.toThrow('already');
  });
});

describe('the yearly dashboard', () => {
  it('totals the year, month by month, and finds the busiest and quietest month', async () => {
    await finished('J1', '2026-01-05', { pages: 100 }); await finished('J2', '2026-01-25', { pages: 200 });
    await finished('M1', '2026-03-10', { pages: 300 });
    await finished('O1', '2026-10-02', { pages: 400 }); await finished('O2', '2026-10-09', { pages: 500 }); await finished('O3', '2026-10-20');
    await finished('Last year', '2025-12-30', { pages: 999 });
    const y = await getYearlyDashboard(db, 2026, '2026-12-31');
    expect(y.totals).toMatchObject({ books: 6, pages: 1500 });
    expect(y.months.map((m) => m.books)).toEqual([2, 0, 1, 0, 0, 0, 0, 0, 0, 3, 0, 0]);
    expect(y.bestMonth).toEqual({ month: 10, books: 3 });
    expect(y.quietestMonth).toEqual({ month: 3, books: 1 });
    expect(y.top.authors[0]).toEqual({ name: 'Au', count: 6 });
  });
  it('shows what each month added to a goal, and to a challenge', async () => {
    await finished('Jan', '2026-01-10'); await finished('Mar A', '2026-03-02'); await finished('Mar B', '2026-03-12'); await finished('Jun', '2026-06-01');
    await saveGoal(db, 2026, { metric: 'books', target: 10, label: 'Ten books' });
    await saveGoal(db, 2026, { metric: 'challenges', target: 0, label: 'Challenges' });
    const id = await ch.createGrid(db, { year: 2026, name: 'Cozy', prompts: ['A', 'B', 'C'] });
    const slots = (await ch.getChallenge(db, id))!.loose;
    const reads = await db.select<{ id: string; title: string }>('SELECT r.id AS id, b.title AS title FROM read r JOIN book b ON b.id = r.book_id');
    const readOf = (t: string) => reads.find((r) => r.title === t)!.id;
    await ch.fillSlot(db, slots[0].id, readOf('Jan')); await ch.fillSlot(db, slots[1].id, readOf('Mar A')); await ch.fillSlot(db, slots[2].id, readOf('Mar B'));
    const y = await getYearlyDashboard(db, 2026, '2026-12-31');
    const g = y.goals.find((x) => x.label === 'Ten books')!;
    expect(g.byMonth).toEqual([1, 0, 2, 0, 0, 1, 0, 0, 0, 0, 0, 0]);
    expect(g).toMatchObject({ total: 4, target: 10, before: 0 });
    expect(y.goals.find((x) => x.label === 'Challenges')!.byMonth.slice(0, 4)).toEqual([1, 0, 2, 0]);
    expect(y.challenges[0]).toMatchObject({ name: 'Cozy', total: 3, month: 3, before: 0 });
    expect(y.challenges[0].byMonth.slice(0, 4)).toEqual([1, 0, 2, 0]);
    expect(y.stickers).toHaveLength(3);
  });
  it('finds the longest reading streak of the year', async () => {
    await finished('Streaky', '2026-02-05', { start: '2026-02-01' });
    const y = await getYearlyDashboard(db, 2026, '2026-12-31');
    expect(y.streaks.longestReading).toMatchObject({ length: 5, start: '2026-02-01', end: '2026-02-05' });
  });
});

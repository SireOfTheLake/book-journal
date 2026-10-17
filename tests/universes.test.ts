import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { applyNotionPlan } from '../src/import/apply';
import { planNotionBooks } from '../src/import/notion';
import { getBookLog } from '../src/repo/bookLog';
import { createSeries, createUniverse, setBookSeries } from '../src/repo/series';
import { createBook } from '../src/repo/books';
import { createUniverseNamed, deleteUniverse, getUniversePage, listUniverseRows, setBookUniverse, setSeriesUniverse, updateUniverse } from '../src/repo/universes';

let db: Db;
const bookId = async (t: string) => (await db.select<{ id: string }>('SELECT id FROM book WHERE title = ?', [t]))[0].id;
const uniId = async (n: string) => (await db.select<{ id: string }>('SELECT id FROM universe WHERE name = ?', [n]))[0].id;

beforeEach(async () => {
  db = migrateNodeDb();
  await applyNotionPlan(db, planNotionBooks(readFileSync(new URL('./fixtures/book-tracker.csv', import.meta.url), 'utf8')), { tagDestinations: { sadenverse: 'universe' } });
});

describe('universes', () => {
  it('counts series, books, read books, and authors for each universe', async () => {
    const rows = await listUniverseRows(db);
    const sad = rows.find((r) => r.name === 'Sadenverse')!;
    expect(sad.series).toBeGreaterThan(0);
    expect(sad.books).toBeGreaterThan(0);
    expect(sad.read).toBeLessThanOrEqual(sad.books);
    expect(sad.authors).toBeGreaterThan(0);
  });

  it('puts a single book of an unrelated series into a universe without its siblings', async () => {
    const u = await createUniverseNamed(db, 'Shared World');
    const sid = await createSeries(db, 'Anthology Series');
    const a = await createBook(db, { title: 'Anthology One', authors: ['Writer A'], seriesId: sid, seriesPosition: 1, shelf: 'tbr' });
    const b = await createBook(db, { title: 'Anthology Two', authors: ['Writer B'], seriesId: sid, seriesPosition: 2, shelf: 'tbr' });
    await setBookUniverse(db, a, u);
    const page = (await getUniversePage(db, u))!;
    expect(page.series).toEqual([]);
    expect(page.books.map((x) => x.title)).toEqual(['Anthology One']);
    expect(page.totals.books).toBe(1);
    expect(page.authors.map((x) => x.name)).toEqual(['Writer A']);
    const log = (await getBookLog(db, b))!;
    expect(log.universe).toBeNull();
    expect(log.seriesUniverse).toBeNull();
    expect((await getBookLog(db, a))!.universe?.name).toBe('Shared World');
  });

  it('does not list a book on its own when its series is already in the universe', async () => {
    const u = await uniId('Sadenverse');
    const id = await bookId((await db.select<{ title: string }>('SELECT b.title FROM book b JOIN series s ON s.id = b.series_id WHERE s.universe_id = ? LIMIT 1', [u]))[0].title);
    await setBookUniverse(db, id, u);
    const page = (await getUniversePage(db, u))!;
    expect(page.books.find((x) => x.id === id)).toBeUndefined();
    expect(page.series.length).toBeGreaterThan(0);
  });

  it('shows the series universe on a book that has none of its own', async () => {
    const u = await uniId('Sadenverse');
    const id = (await db.select<{ id: string }>('SELECT b.id FROM book b JOIN series s ON s.id = b.series_id WHERE s.universe_id = ? AND b.universe_id IS NULL LIMIT 1', [u]))[0].id;
    const log = (await getBookLog(db, id))!;
    expect(log.seriesUniverse?.name).toBe('Sadenverse');
  });

  it("lets a book's own universe win over its series' universe", async () => {
    const other = await createUniverseNamed(db, 'Elsewhere');
    const u = await uniId('Sadenverse');
    const id = (await db.select<{ id: string }>('SELECT b.id FROM book b JOIN series s ON s.id = b.series_id WHERE s.universe_id = ? LIMIT 1', [u]))[0].id;
    const before = (await listUniverseRows(db)).find((r) => r.id === u)!.books;
    await setBookUniverse(db, id, other);
    expect((await listUniverseRows(db)).find((r) => r.id === u)!.books).toBe(before - 1);
    expect((await getUniversePage(db, other))!.books.map((b) => b.id)).toEqual([id]);
  });

  it('moves a series in and out of a universe and keeps names unique', async () => {
    const sid = await createSeries(db, 'Loose Series');
    const u = await createUniverseNamed(db, 'New World');
    await setSeriesUniverse(db, sid, u);
    expect((await getUniversePage(db, u))!.series.map((s) => s.title)).toEqual(['Loose Series']);
    await setSeriesUniverse(db, sid, null);
    expect((await getUniversePage(db, u))!.series).toEqual([]);
    expect(await createUniverseNamed(db, 'new world')).toBe(u);
    expect(await createUniverse(db, 'NEW WORLD')).toBe(u);
    await expect(updateUniverse(db, u, { name: 'Sadenverse' })).rejects.toThrow(/already exists/);
    await updateUniverse(db, u, { name: 'Renamed', notes: 'A note' });
    expect((await getUniversePage(db, u))!.universe).toMatchObject({ name: 'Renamed', notes: 'A note' });
    await expect(updateUniverse(db, u, { id: 'x' })).rejects.toThrow();
  });

  it('deleting a universe keeps its series and books', async () => {
    const u = await uniId('Sadenverse');
    const seriesBefore = (await db.select<{ n: number }>('SELECT count(*) AS n FROM series WHERE deleted_at IS NULL'))[0].n;
    await deleteUniverse(db, u);
    expect(await getUniversePage(db, u)).toBeNull();
    expect((await db.select<{ n: number }>('SELECT count(*) AS n FROM series WHERE deleted_at IS NULL'))[0].n).toBe(seriesBefore);
    expect((await db.select<{ n: number }>('SELECT count(*) AS n FROM series WHERE universe_id IS NOT NULL'))[0].n).toBe(0);
    expect((await listUniverseRows(db)).some((r) => r.id === u)).toBe(false);
    void setBookSeries;
  });
});

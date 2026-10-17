import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { newId } from '../src/domain/ids';
import { applyNotionPlan } from '../src/import/apply';
import { planNotionBooks } from '../src/import/notion';
import { setStatus, updateRead } from '../src/repo/bookLog';
import { addBookToSeries, addSeriesGenre, createSeries, createUniverse, getSeriesPage, listSeriesLedger, removeSeriesGenre, setBookSeries, setFormatRelease, updateSeries } from '../src/repo/series';

let db: Db;
const bookId = async (t: string) => (await db.select<{ id: string }>('SELECT id FROM book WHERE title = ?', [t]))[0].id;
const seriesId = async (t: string) => (await db.select<{ id: string }>('SELECT id FROM series WHERE title = ?', [t]))[0].id;
const row = async (title: string) => (await listSeriesLedger(db)).find((r) => r.title === title)!;

beforeEach(async () => {
  db = migrateNodeDb();
  await applyNotionPlan(db, planNotionBooks(readFileSync(new URL('./fixtures/book-tracker.csv', import.meta.url), 'utf8')), { tagDestinations: { sadenverse: 'universe' } });
});

describe('the Series Ledger', () => {
  it('lists every series A to Z with a mark per book', async () => {
    const rows = await listSeriesLedger(db);
    expect(rows.map((r) => r.title)).toEqual([...rows.map((r) => r.title)].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())));
    const puck = rows.find((r) => r.title === 'Puckboys')!;
    expect(puck.marks.map((m) => m.state)).toEqual(['read', 'read']);
    expect(puck).toMatchObject({ read: 2, total: 2, universe: 'Sadenverse' });
  });
  it('flags a fully read series as Caught up until it is marked finished', async () => {
    expect((await row('Puckboys')).status).toBe('caught_up');
    await updateSeries(db, await seriesId('Puckboys'), { publication_status: 'complete' });
    expect((await row('Puckboys')).status).toBe('finished');
  });
  it('shows books you know exist but have not added, numbered by position', async () => {
    const id = await seriesId('Puckboys');
    await db.execute('UPDATE book SET series_position = ? WHERE title = ?', [1, 'Egotistical Puckboy']);
    await db.execute('UPDATE book SET series_position = ? WHERE title = ?', [2, 'Irresponsible Puckboy']);
    await updateSeries(db, id, { total_books: 5 });
    const puck = await row('Puckboys');
    expect(puck.marks.map((m) => [m.state, m.position])).toEqual([['read', 1], ['read', 2], ['missing', 3], ['missing', 4], ['missing', 5]]);
    expect(puck.status).toBe('in_progress');
    expect(puck.read).toBe(2);
  });
  it('marks a did-not-finish book and an unreleased book', async () => {
    const id = await seriesId('Puckboys');
    await db.execute('UPDATE book SET series_position = ? WHERE title = ?', [1, 'Egotistical Puckboy']);
    await db.execute('UPDATE book SET series_position = ? WHERE title = ?', [2, 'Irresponsible Puckboy']);
    const dnf = await addBookToSeries(db, id, 'Dropped One');
    await setStatus(db, dnf, null, 'dnf');
    expect((await row('Puckboys')).marks.map((m) => m.state)).toEqual(['read', 'read', 'dnf']);
    expect((await row('Puckboys')).status).toBe('dnf');
    const next = await addBookToSeries(db, id, 'Coming Soon');
    await setFormatRelease(db, next, 'audio', '2099-01-01');
    expect((await row('Puckboys')).marks.at(-1)?.state).toBe('unreleased');
  });
  it('lets you set the reading status yourself', async () => {
    await updateSeries(db, await seriesId('Puckboys'), { reading_status_override: 'on_hold' });
    expect((await row('Puckboys')).status).toBe('on_hold');
  });
});

describe('a Series page', () => {
  it('brings together authors, universe, books, ratings, and genres', async () => {
    const id = await seriesId('Puckboys');
    const first = await bookId('Egotistical Puckboy');
    const [{ rid }] = await db.select<{ rid: string }>('SELECT id AS rid FROM read WHERE book_id = ?', [first]);
    await updateRead(db, rid, { rating: 18 });
    await addSeriesGenre(db, id, 'Sports Romance');
    await addSeriesGenre(db, id, 'sports romance');
    const page = (await getSeriesPage(db, id))!;
    expect(page.universe?.name).toBe('Sadenverse');
    expect(page.authors.map((a) => a.name)).toEqual(['Eden Finley', 'Saxon James']);
    expect(page.books.map((b) => b.title)).toHaveLength(2);
    expect(page).toMatchObject({ read: 2, total: 2, ratedBooks: 1, avgStars: 4.5, status: 'caught_up' });
    expect(page.genres.map((g) => g.name)).toEqual(['Sports Romance']);
    await removeSeriesGenre(db, id, page.genres[0].id);
    expect((await getSeriesPage(db, id))!.genres).toEqual([]);
  });
  it('returns null for an unknown series', async () => {
    expect(await getSeriesPage(db, 'nope')).toBeNull();
  });
});

describe('adding books to a series', () => {
  it('adds a TBR book at the next position with the same authors, and reopens a finished series', async () => {
    const id = await seriesId('Puckboys');
    await db.execute('UPDATE book SET series_position = ? WHERE title = ?', [1, 'Egotistical Puckboy']);
    await db.execute('UPDATE book SET series_position = ? WHERE title = ?', [2, 'Irresponsible Puckboy']);
    await updateSeries(db, id, { publication_status: 'complete', total_books: 2 });
    const added = await addBookToSeries(db, id, 'Shameless Puckboy');
    const page = (await getSeriesPage(db, id))!;
    const book = page.books.find((b) => b.id === added)!;
    expect(book).toMatchObject({ position: 3, shelf: 'tbr', authors: 'Eden Finley, Saxon James' });
    expect(page.series).toMatchObject({ total_books: 3, publication_status: 'incomplete' });
    expect(page.status).toBe('in_progress');
  });
  it('keeps release dates per format on a book', async () => {
    const id = await seriesId('Puckboys');
    const added = await addBookToSeries(db, id, 'Foolish Puckboy');
    await setFormatRelease(db, added, 'ebook', '2099-02-01');
    await setFormatRelease(db, added, 'audio', 'tba');
    let book = (await getSeriesPage(db, id))!.books.find((b) => b.id === added)!;
    expect(book.releases).toEqual([{ format: 'audio', status: 'tba', release_date: null }, { format: 'ebook', status: 'dated', release_date: '2099-02-01' }]);
    await setFormatRelease(db, added, 'audio', null);
    book = (await getSeriesPage(db, id))!.books.find((b) => b.id === added)!;
    expect(book.releases).toHaveLength(1);
  });
  it('creates and reuses series and universes by name, and moves a book into a series', async () => {
    const a = await createSeries(db, 'Wasteland Temptations');
    expect(await createSeries(db, 'wasteland temptations')).toBe(a);
    await expect(createSeries(db, '  ')).rejects.toThrow();
    const u = await createUniverse(db, 'Test World');
    expect(await createUniverse(db, 'test world')).toBe(u);
    const book = await bookId('Hooks In');
    await setBookSeries(db, book, a, 2);
    expect((await getSeriesPage(db, a))!.books.map((b) => [b.title, b.position])).toEqual([['Hooks In', 2]]);
    await setBookSeries(db, book, null);
    expect(await newId()).toBeTruthy();
    expect((await getSeriesPage(db, a))!.books).toEqual([]);
  });
});

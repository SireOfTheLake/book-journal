import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { sortGenres } from '../src/domain/genres';
import { applyNotionPlan } from '../src/import/apply';
import { applyNotionCharacters } from '../src/import/applyCharacters';
import { planNotionBooks } from '../src/import/notion';
import { planNotionCharacters } from '../src/import/notionCharacters';
import { addTag, getBookLog, getNeighbors, listTagOptions, setStatus, updateRead } from '../src/repo/bookLog';
import { createBook } from '../src/repo/books';
import { addCharacterToBook, listCharacters } from '../src/repo/characters';
import { addExistingBook, createSeries, getSeriesPage, listSeriesLedger, seriesLength, updateSeries } from '../src/repo/series';

const read = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');
let db: Db;
const bookId = async (t: string) => (await db.select<{ id: string }>('SELECT id FROM book WHERE title = ?', [t]))[0].id;
const readOf = async (t: string) => (await db.select<{ id: string }>('SELECT r.id AS id FROM read r JOIN book b ON b.id = r.book_id WHERE b.title = ?', [t]))[0].id;

beforeEach(async () => {
  db = migrateNodeDb();
  await applyNotionPlan(db, planNotionBooks(read('book-tracker.csv')), { tagDestinations: {} });
  await applyNotionCharacters(db, planNotionCharacters(read('characters.csv')));
});

describe('genres', () => {
  it('puts Romance first and the rest in alphabetical order', () => {
    const names = (xs: { name: string }[]) => xs.map((x) => x.name);
    expect(names(sortGenres([{ name: 'Mystery' }, { name: 'romance' }, { name: 'Action' }, { name: 'Zombie' }]))).toEqual(['romance', 'Action', 'Mystery', 'Zombie']);
    expect(names(sortGenres([{ name: 'b' }, { name: 'A' }]))).toEqual(['A', 'b']);
  });
  it('lists a book\'s genres and the genre choices with Romance first', async () => {
    const id = await bookId('Hooks In');
    for (const g of ['Zombie', 'Action', 'Romance', 'Mystery']) await addTag(db, id, 'genre', g);
    expect((await getBookLog(db, id))!.genres.map((g) => g.name)).toEqual(['Romance', 'Action', 'Mystery', 'Zombie']);
    expect((await listTagOptions(db, 'genre'))[0].name).toBe('Romance');
  });
});

describe('the previous and next book', () => {
  it('finds the books finished just before and just after', async () => {
    const order = (await db.select<{ id: string; title: string }>("SELECT r.id AS id, b.title AS title FROM read r JOIN book b ON b.id = r.book_id WHERE r.status = 'finished' ORDER BY r.finish_date, COALESCE(r.finish_time, ''), r.rowid"));
    expect(order.length).toBeGreaterThan(5);
    const first = await getNeighbors(db, order[0].id);
    expect(first.prev).toBeNull();
    expect(first.next?.title).toBe(order[1].title);
    const middle = await getNeighbors(db, order[3].id);
    expect([middle.prev?.title, middle.next?.title]).toEqual([order[2].title, order[4].title]);
    const last = await getNeighbors(db, order.at(-1)!.id);
    expect(last.prev?.title).toBe(order.at(-2)!.title);
    expect(last.next).toBeNull(); // no next book, so no button
    expect(last.prev?.read_id).toBe(order.at(-2)!.id);
  });
  it('gives a book still being read the latest finished book before it, and nothing after', async () => {
    const id = await bookId('Hooks In');
    const rid = await setStatus(db, id, null, 'reading');
    const n = await getNeighbors(db, rid!);
    const latest = (await db.select<{ title: string }>("SELECT b.title AS title FROM read r JOIN book b ON b.id = r.book_id WHERE r.status = 'finished' ORDER BY r.finish_date DESC, r.rowid DESC LIMIT 1"))[0].title;
    expect(n.prev?.title).toBe(latest);
    expect(n.next).toBeNull();
  });
  it('has no neighbours for a book with no read', async () => {
    expect(await getNeighbors(db, null)).toEqual({ prev: null, next: null });
  });
});

describe('series length with novellas', () => {
  it('counts numbered books for the length, and every book for the total', () => {
    // The Accidental Love series: five books plus novellas at 0.5 and 5.5.
    const books = [0.5, 1, 2, 3, 4, 5, 5.5].map((position, i) => ({ position, is_read: i < 3 ? 1 : 0 })); // 0.5, 1 and 2 read
    expect(seriesLength({ total_books: 5 }, books)).toEqual({ mainTotal: 5, mainRead: 2, novellas: 2, allBooks: 7 });
  });
  it('works out the length from the numbered books when no total is set', () => {
    expect(seriesLength({ total_books: null }, [{ position: 1, is_read: 0 }, { position: 2, is_read: 0 }, { position: 2.5, is_read: 0 }])).toMatchObject({ mainTotal: 2, novellas: 1, allBooks: 3 });
    expect(seriesLength({ total_books: null }, [{ position: null, is_read: 1 }, { position: null, is_read: 0 }])).toMatchObject({ mainTotal: 2, mainRead: 1, novellas: 0 });
  });
  it('shows 1 of 5 for progress but 7 books in the ledger and on the series page', async () => {
    const id = await createSeries(db, 'The Accidental Love');
    await updateSeries(db, id, { total_books: 5 });
    for (const [i, p] of [0.5, 1, 2, 3, 4, 5, 5.5].entries()) { const b = await createBook(db, { title: `AL ${i}`, authors: ['Author A'], seriesId: id, seriesPosition: p, shelf: 'tbr' }); void b; }
    await setStatus(db, await bookId('AL 1'), null, 'finished'); // book 1
    await setStatus(db, await bookId('AL 0'), null, 'finished'); // the 0.5 novella
    const row = (await listSeriesLedger(db)).find((r) => r.title === 'The Accidental Love')!;
    expect(row).toMatchObject({ read: 1, total: 5, allBooks: 7, novellas: 2 });
    expect(row.marks).toHaveLength(7);
    const page = (await getSeriesPage(db, id))!;
    expect(page).toMatchObject({ read: 1, total: 5, allBooks: 7, novellas: 2 });
    expect((await getBookLog(db, await bookId('AL 6')))!.series?.main_total).toBe(5);
  });
  it('only shows "not added yet" marks for numbered books, never for novellas', async () => {
    const id = await createSeries(db, 'Short Series');
    await updateSeries(db, id, { total_books: 4 });
    await createBook(db, { title: 'SS 1', authors: ['A'], seriesId: id, seriesPosition: 1, shelf: 'tbr' });
    await createBook(db, { title: 'SS half', authors: ['A'], seriesId: id, seriesPosition: 1.5, shelf: 'tbr' });
    const row = (await listSeriesLedger(db)).find((r) => r.title === 'Short Series')!;
    expect(row.marks.filter((m) => m.state === 'missing').map((m) => m.position)).toEqual([2, 3, 4]);
    expect(row.allBooks).toBe(5);
  });
});

describe('adding a book you already have to a series', () => {
  it('sets its position, and a whole-number position past the end lengthens the series', async () => {
    const id = await createSeries(db, 'Mixed Up');
    await updateSeries(db, id, { total_books: 2 });
    await addExistingBook(db, id, await bookId('Hooks In'), 3);
    expect((await getSeriesPage(db, id))!.series.total_books).toBe(3);
    await addExistingBook(db, id, await bookId('68 Whiskey'), 3.5); // a novella does not change the length
    const page = (await getSeriesPage(db, id))!;
    expect(page.series.total_books).toBe(3);
    expect(page.books.map((b) => [b.title, b.position])).toEqual([['Hooks In', 3], ['68 Whiskey', 3.5]]);
    expect(page.novellas).toBe(1);
    expect(page.books.find((b) => b.title === 'Hooks In')!.status).toBe('up_next'); // each book keeps its status
  });
  it('shows each book\'s status for the series cards', async () => {
    const id = (await db.select<{ id: string }>("SELECT id FROM series WHERE title = 'Puckboys'"))[0].id;
    expect((await getSeriesPage(db, id))!.books.every((b) => b.status === 'finished')).toBe(true);
  });
});

describe('the character list', () => {
  it('lists the books a character is a main character in', async () => {
    const reid = (await listCharacters(db)).find((c) => c.name === 'Reid')!;
    expect(JSON.parse(reid.main_titles!)).toEqual([expect.objectContaining({ title: 'Bro Doll' })]);
    const kit = await db.select<{ id: string }>("SELECT id FROM character WHERE name = 'Matt'");
    await addCharacterToBook(db, kit[0].id, await bookId('Hooks In'), 'main');
    expect(JSON.parse((await listCharacters(db)).find((c) => c.name === 'Matt')!.main_titles!).map((b: { title: string }) => b.title)).toEqual(['Hooks In']);
  });
});

describe('dates on a read', () => {
  it('rejects a start date after the finish date, which is why the picker stops it', async () => {
    const rid = await readOf('Bro Doll');
    await expect(updateRead(db, rid, { start_date: '2099-01-01' })).rejects.toThrow();
  });
});

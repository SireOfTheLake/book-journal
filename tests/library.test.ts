import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { filterLibrary, matchesSearch, sortLibrary } from '../src/domain/library';
import { applyNotionPlan } from '../src/import/apply';
import { planNotionBooks } from '../src/import/notion';
import { setBookCover, setStatus, updateBook, updateRead } from '../src/repo/bookLog';
import { createBook } from '../src/repo/books';
import { getCovers, listLibrary, type LibraryBook } from '../src/repo/library';

let db: Db;
const bookId = async (t: string) => (await db.select<{ id: string }>('SELECT id FROM book WHERE title = ?', [t]))[0].id;
const lib = async () => listLibrary(db);
const find = (xs: LibraryBook[], t: string) => xs.find((b) => b.title === t)!;

beforeEach(async () => {
  db = migrateNodeDb();
  await applyNotionPlan(db, planNotionBooks(readFileSync(new URL('./fixtures/book-tracker.csv', import.meta.url), 'utf8')), { tagDestinations: {} });
});

describe('the library list', () => {
  it('lists every book with its status, authors, series, narrators, and characters', async () => {
    const books = await lib();
    expect(books).toHaveLength(15);
    const puck = find(books, 'Egotistical Puckboy');
    expect(puck).toMatchObject({ status: 'finished', authors: 'Eden Finley, Saxon James', series: 'Puckboys', format: 'audio', has_cover: 0, finish_date: '2025-07-27' });
    expect(puck.narrators).toContain('Alexander Cendese');
    expect(puck.read_id).toBeTruthy();
    expect(find(books, 'Hooks In')).toMatchObject({ status: 'up_next', read_id: null, finish_date: null });
    expect(books.filter((b) => b.status === 'up_next')).toHaveLength(3);
    expect(books.filter((b) => b.status === 'tbr')).toHaveLength(1);
    expect(find(books, 'Bro Doll').characters).toContain('Reid');
  });
  it('shows where a book is now: a shelf, or the state of its latest read', async () => {
    const id = await bookId('Hooks In');
    await setStatus(db, id, null, 'reading');
    expect(find(await lib(), 'Hooks In').status).toBe('reading');
    await setStatus(db, id, null, 'on_hold');
    expect(find(await lib(), 'Hooks In').status).toBe('on_hold');
    const plain = await createBook(db, { title: 'No Shelf At All', authors: ['Z'] });
    expect(find(await lib(), 'No Shelf At All').status).toBeNull();
    void plain;
  });
  it('shows ratings and favorites, and whether a book has a cover', async () => {
    const id = await bookId('Egotistical Puckboy');
    const [{ rid }] = await db.select<{ rid: string }>('SELECT id AS rid FROM read WHERE book_id = ?', [id]);
    await updateRead(db, rid, { rating: 18 });
    await updateBook(db, id, { is_favorite: 1 });
    await setBookCover(db, id, { dataUrl: 'data:image/png;base64,AAA' });
    const b = find(await lib(), 'Egotistical Puckboy');
    expect(b).toMatchObject({ rating: 4.5, is_favorite: 1, has_cover: 1 });
  });
  it('loads cover pictures only for the books you ask about', async () => {
    const a = await bookId('Egotistical Puckboy'); const b = await bookId('Hush');
    await setBookCover(db, a, { dataUrl: 'data:image/png;base64,AAA' });
    await setBookCover(db, b, { dataUrl: 'data:image/png;base64,BBB' });
    expect(await getCovers(db, [a])).toEqual({ [a]: 'data:image/png;base64,AAA' });
    expect(Object.keys(await getCovers(db, [a, b, 'missing'])).sort()).toEqual([a, b].sort());
    expect(await getCovers(db, [])).toEqual({});
  });
});

describe('searching, filtering, and sorting', () => {
  it('finds books by title, author, series, narrator, or character, with every word needing to match', async () => {
    const books = await lib();
    const titles = (q: string) => books.filter((b) => matchesSearch(b, q)).map((b) => b.title);
    expect(titles('puckboy')).toEqual(expect.arrayContaining(['Egotistical Puckboy', 'Irresponsible Puckboy']));
    expect(titles('eden finley')).toEqual(expect.arrayContaining(['Egotistical Puckboy']));
    expect(titles('EGOTISTICAL puckboy')).toEqual(['Egotistical Puckboy']);
    expect(titles('cendese')).toEqual(expect.arrayContaining(['Egotistical Puckboy', 'Irresponsible Puckboy'])); // narrator
    expect(titles('reid')).toContain('Bro Doll'); // character
    expect(titles('puckboy cendese nobody')).toEqual([]);
    expect(titles('   ')).toHaveLength(15);
  });
  it('ignores capitals and accents', () => {
    const b = { title: 'Café Society', authors: 'José Álvarez', series: null, narrators: null, characters: null } as LibraryBook;
    expect(matchesSearch(b, 'CAFE jose')).toBe(true);
  });
  it('filters by status, favorites, and missing cover', async () => {
    await updateBook(db, await bookId('Hush'), { is_favorite: 1 });
    await setBookCover(db, await bookId('Egotistical Puckboy'), { dataUrl: 'data:image/png;base64,AAA' });
    const books = await lib();
    const base = { query: '', status: 'all' as const, favorites: false, noCover: false };
    expect(filterLibrary(books, { ...base, status: 'up_next' })).toHaveLength(3);
    expect(filterLibrary(books, { ...base, status: 'finished' }).every((b) => b.status === 'finished')).toBe(true);
    expect(filterLibrary(books, { ...base, favorites: true }).map((b) => b.title)).toEqual(['Hush']);
    expect(filterLibrary(books, { ...base, noCover: true })).toHaveLength(14);
    expect(filterLibrary(books, { ...base, status: 'none' })).toEqual([]);
    expect(filterLibrary(books, { ...base, query: 'puckboy', status: 'finished' })).toHaveLength(2);
  });
  it('sorts by title, author, recently finished, recently added, and rating, with blanks last', async () => {
    await updateRead(db, (await db.select<{ id: string }>('SELECT r.id AS id FROM read r JOIN book b ON b.id = r.book_id WHERE b.title = ?', ['Hush']))[0].id, { rating: 20 });
    await updateRead(db, (await db.select<{ id: string }>('SELECT r.id AS id FROM read r JOIN book b ON b.id = r.book_id WHERE b.title = ?', ['Bro Doll']))[0].id, { rating: 12 });
    const books = await lib();
    const t = (k: Parameters<typeof sortLibrary>[1]) => sortLibrary(books, k).map((b) => b.title);
    expect(t('title')).toEqual([...books.map((b) => b.title)].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())));
    expect(t('rating').slice(0, 2)).toEqual(['Hush', 'Bro Doll']);
    expect(sortLibrary(books, 'rating').at(-1)!.rating).toBeNull();
    const finished = sortLibrary(books, 'finished');
    expect(finished[0].finish_date).toBe('2026-10-08'); // the newest finish
    expect(finished.at(-1)!.finish_date).toBeNull(); // books never finished go last
    const authors = sortLibrary(books, 'author').map((b) => b.authors);
    expect(authors.filter((a): a is string => a !== null).map((a) => a.toLowerCase())).toEqual(authors.filter((a): a is string => a !== null).map((a) => a.toLowerCase()).sort());
    expect(sortLibrary(books, 'added')).toHaveLength(15);
  });
});

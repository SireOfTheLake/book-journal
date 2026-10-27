import { describe, expect, it } from 'vitest';
import { buildPool, firstBook, sequentialNext, type LibBook } from '../src/domain/randomBook';

let n = 0;
const b = (series: string | null, position: number | null, o: Partial<LibBook> = {}): LibBook => ({ id: `b${++n}`, title: `${series ?? 'Solo'} ${position ?? ''}`.trim(), authors: 'Ann', series_id: series, series, position, shelf: 'tbr', read: false, unreleased: false, ...o });
const names = (l: LibBook[]) => l.map((x) => x.title).sort();

describe('where you are in a series', () => {
  it('reading in order: the next book comes after the last one read', () => {
    const books = [b('S', 1, { read: true }), b('S', 2), b('S', 3)];
    expect(sequentialNext(books)?.position).toBe(2);
  });
  it('started in the middle is not in order', () => {
    expect(sequentialNext([b('S', 1), b('S', 2), b('S', 3, { read: true }), b('S', 4)])).toBeNull();
    expect(firstBook([b('S', 1), b('S', 2), b('S', 3, { read: true })])?.position).toBe(1);
  });
  it('a novella before book 1 does not stop it counting as in order, and the next is still book 2', () => {
    const books = [b('S', 0.5), b('S', 1, { read: true }), b('S', 2)];
    expect(sequentialNext(books)?.position).toBe(2);
  });
  it('a novella after the last read book can be next', () => {
    expect(sequentialNext([b('S', 1, { read: true }), b('S', 1.5), b('S', 2)])?.position).toBe(1.5);
  });
  it('a series where only a novella was read is not in order', () => {
    expect(sequentialNext([b('S', 0.5, { read: true }), b('S', 1)])).toBeNull();
  });
  it('the first book of a series is its first main book, or a novella when only those are left', () => {
    expect(firstBook([b('S', 0.5), b('S', 1), b('S', 2)])?.position).toBe(1);
    expect(firstBook([b('S', 0.5), b('S', 1, { read: true })])?.position).toBe(0.5);
  });
});

describe('the pool of random books', () => {
  it('random book: standalones on the TBR, the first book of an unstarted series, the next of a series in order', () => {
    const all = [
      b(null, null), b(null, null, { shelf: 'up_next' }), b(null, null, { read: true }),
      b('A', 1), b('A', 2), b('A', 3),                              // not started: book 1
      b('B', 1, { read: true }), b('B', 2), b('B', 3),               // in order: book 2
      b('C', 1), b('C', 2), b('C', 3, { read: true }), b('C', 4),     // started in the middle: book 1
    ];
    expect(names(buildPool(all).book)).toEqual(['A 1', 'B 2', 'C 1', 'Solo']);
  });
  it('skips books that are not out yet, but not ones out in one format', () => {
    const all = [b('A', 1, { unreleased: true }), b('A', 2), b('D', 1), b(null, null, { unreleased: true })];
    expect(names(buildPool(all).book)).toEqual(['D 1']); // A's first book is unreleased, so A has nothing to offer
  });
  it('a book from a series: only series read in order, and the next must be on the TBR', () => {
    const all = [
      b('A', 1), b('A', 2),                                          // not started: not here
      b('B', 1, { read: true }), b('B', 2), b('B', 3),                 // B 2
      b('C', 1, { read: true }), b('C', 2, { shelf: 'up_next' }),        // next is already on Up Next
      b('D', 1, { read: true }), b('D', 2, { shelf: null }),              // next is not on the TBR
      b('E', 0.5), b('E', 1, { read: true }), b('E', 2),                  // novella ignored: E 2
      b('F', 1, { read: true }), b('F', 2, { read: true }),               // nothing left
    ];
    expect(names(buildPool(all).series_book)).toEqual(['B 2', 'E 2']);
  });
  it('a series: its unread TBR books, started or not, when there are at least two', () => {
    const all = [
      b('A', 1), b('A', 2), b('A', 3, { read: true }),
      b('B', 1), b('B', 2, { unreleased: true }),                         // only one is out: not offered
      b('C', 1, { read: true }), b('C', 2), b('C', 3),
    ];
    const pool = buildPool(all);
    expect(pool.series.map((s) => s.id).sort()).toEqual(['A', 'C']);
    expect(pool.series.find((s) => s.id === 'A')!.books.map((x) => x.position)).toEqual([1, 2]);
  });
});

import { beforeEach } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { createRead } from '../src/repo/bookLog';
import { createBook } from '../src/repo/books';
import { addToUpNext, loadRandomPool } from '../src/repo/randomBook';
import { loadRandomizer } from '../src/repo/randomizer';
import { createSeries, setBookSeries, setFormatRelease } from '../src/repo/series';
import { addToShelf, listShelf } from '../src/repo/shelf';

describe('the random book pool from the database', () => {
  let db: Db;
  beforeEach(() => { db = migrateNodeDb(); });
  const inSeries = async (title: string, series: string, position: number, o: { shelf?: 'tbr' | 'up_next'; read?: boolean } = {}) => {
    const sid = (await db.select<{ id: string }>('SELECT id FROM series WHERE title = ?', [series]))[0]?.id ?? await createSeries(db, series);
    const id = o.shelf ? await addToShelf(db, { title, authors: ['Ann'], shelf: o.shelf }) : await createBook(db, { title, authors: ['Ann'] });
    await setBookSeries(db, id, sid, position);
    if (o.read) await createRead(db, id, 'finished');
    return id;
  };
  it('offers the right books, leaves out unreleased ones, and adds to Up Next', async () => {
    await inSeries('B1', 'B', 1, { read: true });
    const b2 = await inSeries('B2', 'B', 2, { shelf: 'tbr' });
    const b3 = await inSeries('B3', 'B', 3, { shelf: 'tbr' });
    const future = await inSeries('F1', 'F', 1, { shelf: 'tbr' });
    await setFormatRelease(db, future, 'audio', '2999-01-01');
    await addToShelf(db, { title: 'Solo', authors: ['Zed'], shelf: 'tbr' });
    const pool = await loadRandomPool(db);
    expect(pool.series_book.map((x) => x.title)).toEqual(['B2']);
    expect(pool.book.map((x) => x.title).sort()).toEqual(['B2', 'Solo']);
    expect(pool.series.map((s) => s.title)).toEqual(['B']);
    expect((await loadRandomizer(db, 2026)).random.series[0].books.map((x) => x.id)).toEqual([b2, b3]);
    await addToUpNext(db, [b2, b3]);
    expect((await listShelf(db)).filter((x) => x.shelf === 'up_next').map((x) => x.title)).toEqual(['B2', 'B3']);
  });
});

import { allCategories, spin } from '../src/domain/randomizer';
describe('the three random book types are weighted equally', () => {
  it('each type comes up about a third of the time, however many books it has', () => {
    const many = Array.from({ length: 200 }, (_, i) => b(null, null, { id: `m${i}` }));
    const one = b('Z', 2);
    const pool = { book: many, series_book: [one], series: [{ id: 'Z', title: 'Z', books: [one, b('Z', 3)] }] };
    const cat = allCategories({ trick: [], treat: [], challenges: [], random: pool }, true).filter((c) => c.picks.length)[0];
    expect(cat.picks.map((p) => p.prompt)).toEqual(['Random Book', 'Random Book from Series', 'Random Series']);
    let seed = 12345; const rng = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    const counts: Record<string, number> = {};
    for (let i = 0; i < 3000; i++) { const t = spin([cat], rng)!.pick.randomType!; counts[t] = (counts[t] ?? 0) + 1; }
    for (const t of ['book', 'series_book', 'series']) expect(counts[t]).toBeGreaterThan(850);
  });
});

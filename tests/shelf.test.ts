import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { createBook } from '../src/repo/books';
import { createRead, deleteRead, saveDayEntry, setStatus, updateRead } from '../src/repo/bookLog';
import { createSeries, setFormatRelease } from '../src/repo/series';
import { addToShelf, listShelf, moveOnShelf, moveToShelf, putOnShelf, removeFromShelf, startFromShelf } from '../src/repo/shelf';

let db: Db;
beforeEach(() => { db = migrateNodeDb(); });
const titles = async () => (await listShelf(db)).map((b) => `${b.shelf === 'up_next' ? 'U' : 'T'}:${b.title}`);
const idOf = async (t: string) => (await db.select<{ id: string }>('SELECT id FROM book WHERE title = ?', [t]))[0].id;

async function seed() {
  for (const [t, shelf] of [['A', 'up_next'], ['B', 'up_next'], ['C', 'tbr'], ['D', 'tbr'], ['E', 'tbr']] as const) await addToShelf(db, { title: t, authors: ['Au'], shelf });
}

describe('the TBR and Up Next shelves', () => {
  it('a move shown on screen (applyMove) matches the move that is saved', async () => {
    await seed();
    const { applyMove } = await import('../src/repo/shelf');
    for (const [t, m] of [['E', 'top'], ['C', 'down'], ['A', 'bottom'], ['D', 'up'], ['B', 'top']] as const) {
      const before = await listShelf(db);
      const shown = applyMove(before, await idOf(t), m);
      await moveOnShelf(db, await idOf(t), m);
      const saved = await listShelf(db);
      expect(shown.map((b) => [b.title, b.priority])).toEqual(saved.map((b) => [b.title, b.priority]));
    }
  });
  it('saves only the books whose place changed', async () => {
    await seed();
    await db.execute("UPDATE book SET updated_at = '2000-01-01T00:00:00.000Z'");
    await moveOnShelf(db, await idOf('D'), 'up');
    const touched = (await db.select<{ title: string }>("SELECT title FROM book WHERE updated_at <> '2000-01-01T00:00:00.000Z' ORDER BY title")).map((r) => r.title);
    expect(touched).toEqual(['C', 'D']);
  });
  it('lists Up Next first, then TBR, each in the order you added them, with tidy priorities', async () => {
    await seed();
    expect(await titles()).toEqual(['U:A', 'U:B', 'T:C', 'T:D', 'T:E']);
    expect((await listShelf(db)).map((b) => b.priority)).toEqual([1, 2, 3, 4, 5]);
    expect((await listShelf(db))[0].authors).toBe('Au');
  });
  it('moves a book up, down, to the top and to the bottom of its own shelf', async () => {
    await seed();
    await moveOnShelf(db, await idOf('E'), 'up');
    expect(await titles()).toEqual(['U:A', 'U:B', 'T:C', 'T:E', 'T:D']);
    await moveOnShelf(db, await idOf('E'), 'top');
    expect(await titles()).toEqual(['U:A', 'U:B', 'T:E', 'T:C', 'T:D']);
    await moveOnShelf(db, await idOf('A'), 'down');
    expect(await titles()).toEqual(['U:B', 'U:A', 'T:E', 'T:C', 'T:D']);
    await moveOnShelf(db, await idOf('B'), 'bottom');
    expect(await titles()).toEqual(['U:A', 'U:B', 'T:E', 'T:C', 'T:D']);
    await moveOnShelf(db, await idOf('A'), 'up'); // already first: nothing changes
    expect(await titles()).toEqual(['U:A', 'U:B', 'T:E', 'T:C', 'T:D']);
    expect((await listShelf(db)).map((b) => b.priority)).toEqual([1, 2, 3, 4, 5]);
  });
  it('sends a book to the end of Up Next, or to the top of TBR', async () => {
    await seed();
    await moveToShelf(db, await idOf('D'), 'up_next');
    expect(await titles()).toEqual(['U:A', 'U:B', 'U:D', 'T:C', 'T:E']);
    await moveToShelf(db, await idOf('A'), 'tbr');
    expect(await titles()).toEqual(['U:B', 'U:D', 'T:A', 'T:C', 'T:E']);
  });
  it('removes a book from the shelf but keeps it in the library', async () => {
    await seed();
    await removeFromShelf(db, await idOf('B'));
    expect(await titles()).toEqual(['U:A', 'T:C', 'T:D', 'T:E']);
    expect(await idOf('B')).toBeTruthy();
    expect((await db.select<{ shelf: string | null; deleted_at: string | null }>('SELECT shelf, deleted_at FROM book WHERE title = ?', ['B']))[0]).toEqual({ shelf: null, deleted_at: null });
  });
  it('starting a book takes it off the shelf and opens a read', async () => {
    await seed();
    const readId = await startFromShelf(db, await idOf('A'));
    expect(await titles()).toEqual(['U:B', 'T:C', 'T:D', 'T:E']);
    expect((await db.select<{ status: string }>('SELECT status FROM read WHERE id = ?', [readId!]))[0].status).toBe('reading');
  });
  it('puts a book you already have onto a shelf', async () => {
    await seed();
    const id = await createBook(db, { title: 'Old', authors: ['X'] });
    await putOnShelf(db, id, 'up_next');
    expect(await titles()).toEqual(['U:A', 'U:B', 'U:Old', 'T:C', 'T:D', 'T:E']);
  });
  it('shows whether a series book is next, or still waiting on earlier books', async () => {
    const s = await createSeries(db, 'Saga');
    const one = await createBook(db, { title: 'One', authors: ['X'], seriesId: s, seriesPosition: 1 });
    const two = await createBook(db, { title: 'Two', authors: ['X'], seriesId: s, seriesPosition: 2, shelf: 'up_next' });
    await createBook(db, { title: 'Three', authors: ['X'], seriesId: s, seriesPosition: 3, shelf: 'tbr' });
    await setStatus(db, one, null, 'finished');
    const state = async () => Object.fromEntries((await listShelf(db)).map((b) => [b.title, b.series_state]));
    expect(await state()).toEqual({ Two: 'next', Three: 'waiting' });
    await setStatus(db, two, null, 'finished');
    expect(await state()).toEqual({ Three: 'next' });
  });
  it('marks a book that is not out yet', async () => {
    const id = await createBook(db, { title: 'Soon', authors: ['X'], shelf: 'tbr' });
    await setFormatRelease(db, id, 'ebook', 'tba');
    expect((await listShelf(db))[0].release).toBe('tba');
    await setFormatRelease(db, id, 'ebook', '2999-01-01');
    expect((await listShelf(db))[0].release).toBe('2999-01-01');
    await setFormatRelease(db, id, 'ebook', '2000-01-01');
    expect((await listShelf(db))[0].release).toBeNull();
  });
});

describe('deleting a read', () => {
  it('removes that read with its log, and keeps the book and its other reads', async () => {
    const id = await createBook(db, { title: 'Twice', authors: ['X'] });
    const first = await createRead(db, id, 'finished');
    await updateRead(db, first, { finish_date: '2026-01-05', rating: 16 });
    const second = await createRead(db, id, 'reading');
    await saveDayEntry(db, second, { date: '2026-02-01', page: 40, text: 'hi' });
    const r = await deleteRead(db, second);
    expect(r).toEqual({ bookId: id, nextReadId: first });
    expect((await db.select<{ n: number }>('SELECT count(*) n FROM read WHERE book_id = ? AND deleted_at IS NULL', [id]))[0].n).toBe(1);
    expect((await db.select<{ n: number }>('SELECT count(*) n FROM day_entry WHERE read_id = ? AND deleted_at IS NULL', [second]))[0].n).toBe(0);
    expect((await db.select<{ rating: number }>('SELECT rating FROM read WHERE id = ?', [first]))[0].rating).toBe(16);
    await expect(deleteRead(db, second)).rejects.toThrow(/already been deleted/);
  });
  it('can remove the only read, leaving a book with no reads', async () => {
    const id = await createBook(db, { title: 'Once', authors: ['X'] });
    const only = await createRead(db, id, 'finished');
    expect(await deleteRead(db, only)).toEqual({ bookId: id, nextReadId: null });
    expect((await db.select<{ n: number }>('SELECT count(*) n FROM book WHERE id = ? AND deleted_at IS NULL', [id]))[0].n).toBe(1);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { getBookLog, quickAdd, setStatus, updateRead } from '../src/repo/bookLog';
import { getHome } from '../src/repo/home';
import { createSeries, getSeriesPage, listSeriesLedger, updateSeries } from '../src/repo/series';
import { moveToShelf, removeFromShelf, startFromShelf } from '../src/repo/shelf';

let db: Db;
beforeEach(() => { db = migrateNodeDb(); });
const reads = (bookId: string) => db.select<{ id: string; status: string; start_date: string | null; format: string | null }>('SELECT id, status, start_date, format FROM read WHERE book_id = ? AND deleted_at IS NULL', [bookId]);

describe('Up Next books have a planned read', () => {
  it('is made when a book goes to Up Next, kept through edits, and deleted when it goes back to TBR', async () => {
    const { bookId } = await quickAdd(db, { title: 'Soon', authors: ['A'], status: 'tbr' });
    expect(await reads(bookId)).toHaveLength(0);
    await moveToShelf(db, bookId, 'up_next');
    const [r] = await reads(bookId);
    expect(r).toMatchObject({ status: 'on_hold', start_date: null });
    await updateRead(db, r.id, { format: 'audio' });
    await moveToShelf(db, bookId, 'up_next');
    expect(await reads(bookId)).toHaveLength(1);
    expect((await getBookLog(db, bookId))!.read!.format).toBe('audio');
    await moveToShelf(db, bookId, 'tbr');
    expect(await reads(bookId)).toHaveLength(0);
  });
  it('quick add to Up Next and the Book Log both give it a read, and it never shows as paused on Home', async () => {
    const { bookId } = await quickAdd(db, { title: 'Queued', authors: ['A'], status: 'up_next' });
    expect(await reads(bookId)).toHaveLength(1);
    const home = await getHome(db, '2026-10-18');
    expect(home.paused).toHaveLength(0); expect(home.reading).toHaveLength(0);
    const { bookId: old } = await quickAdd(db, { title: 'Old shelf', authors: ['A'], status: 'tbr' });
    await db.execute("UPDATE book SET shelf = 'up_next' WHERE id = ?", [old]);
    expect((await getBookLog(db, old))!.read).not.toBeNull();
    expect(await reads(old)).toHaveLength(1);
  });
  it('starting the book turns the planned read into the real one, keeping what was entered', async () => {
    const { bookId } = await quickAdd(db, { title: 'Go', authors: ['A'], status: 'up_next' });
    const [planned] = await reads(bookId);
    await updateRead(db, planned.id, { format: 'ebook' });
    const id = await startFromShelf(db, bookId);
    expect(id).toBe(planned.id);
    const all = await reads(bookId);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ status: 'reading', format: 'ebook' });
    expect(all[0].start_date).not.toBeNull();
    const home = await getHome(db, '2026-10-18');
    expect(home.reading).toHaveLength(1);
  });
  it('removing from the shelf or choosing TBR on the Book Log drops the plan', async () => {
    const a = (await quickAdd(db, { title: 'A', authors: ['X'], status: 'up_next' })).bookId, b = (await quickAdd(db, { title: 'B', authors: ['X'], status: 'up_next' })).bookId;
    await removeFromShelf(db, a);
    expect(await reads(a)).toHaveLength(0);
    const [rb] = await reads(b);
    await setStatus(db, b, rb.id, 'tbr');
    expect(await reads(b)).toHaveLength(0);
  });
});

describe('series flag', () => {
  it('new series are not flagged, existing ones are, and clearing sticks', async () => {
    const s = await createSeries(db, 'Fresh');
    expect((await getSeriesPage(db, s))!.series.flagged).toBe(0);
    await db.execute('UPDATE series SET flagged = 1');
    expect((await listSeriesLedger(db))[0].flagged).toBe(1);
    await updateSeries(db, s, { flagged: 0 });
    expect((await listSeriesLedger(db))[0].flagged).toBe(0);
  });
});

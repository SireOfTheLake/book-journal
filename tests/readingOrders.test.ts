import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { addTag, createRead, quickAdd, updateRead } from '../src/repo/bookLog';
import { addCustomItem, addItemToLibrary, addLibraryItem, linkItemToBook, addSeriesToOrder, createOrder, deleteOrder, getOrder, listOrders, moveItem, removeItem, searchLibraryBooks } from '../src/repo/readingOrders';
import { createSeries, setBookSeries } from '../src/repo/series';

let db: Db;
beforeEach(() => { db = migrateNodeDb(); });

describe('reading orders', () => {
  it('fills from a series in order, tracks read state, and reorders', async () => {
    const sid = await createSeries(db, 'The Saga');
    const a = (await quickAdd(db, { title: 'Two', authors: ['Ann'], status: 'tbr' })).bookId;
    const b = (await quickAdd(db, { title: 'One', authors: ['Ann'], status: 'tbr' })).bookId;
    await setBookSeries(db, a, sid, 2); await setBookSeries(db, b, sid, 1);
    const rid = await createRead(db, b, 'finished'); await updateRead(db, rid, { status: 'finished', finish_date: '2026-01-01' });
    const o = await createOrder(db, 'Saga', { seriesId: sid });
    let d = (await getOrder(db, o))!;
    expect(d.items.map((i) => i.title)).toEqual(['One', 'Two']);
    expect(d.items.map((i) => i.is_read)).toEqual([true, false]);
    await moveItem(db, o, d.items[1].id, 0);
    d = (await getOrder(db, o))!;
    expect(d.items.map((i) => i.title)).toEqual(['Two', 'One']);
    const [sum] = await listOrders(db);
    expect([sum.name, sum.read, sum.total, sum.authors, sum.series]).toEqual(['Saga', 1, 2, ['Ann'], ['The Saga']]);
    await removeItem(db, o, d.items[0].id);
    expect((await getOrder(db, o))!.items.map((i) => i.position)).toEqual([0]);
    await expect(addLibraryItem(db, o, b)).rejects.toThrow();
  });
  it('holds books that are not in the library and can add them', async () => {
    const o = await createOrder(db, 'Plan');
    const it = await addCustomItem(db, o, { title: 'Hidden Story', author: 'Zed', series: 'Tales', seriesPosition: 3, note: 'in a collection' });
    let d = (await getOrder(db, o))!;
    expect(d.items[0].book_id).toBeNull();
    const bookId = await addItemToLibrary(db, it, { title: 'Hidden Story', author: 'Zed', series: 'Tales', position: 3, cover: { dataUrl: 'data:image/png;base64,AAAA' } });
    d = (await getOrder(db, o))!;
    expect(d.items[0].book_id).toBe(bookId);
    expect(d.items[0].series_name).toBe('Tales');
    expect(d.items[0].cover).toBe('data:image/png;base64,AAAA');
    expect((await searchLibraryBooks(db, 'hidden')).map((b) => b.id)).toEqual([bookId]);
    await expect(addItemToLibrary(db, it, { title: 'x', author: '', series: '', position: null })).rejects.toThrow();
    await deleteOrder(db, o);
    expect(await getOrder(db, o)).toBeNull();
    void addTag;
  });
  it('links a line to a book added separately', async () => {
    const o = await createOrder(db, 'Plan');
    const it = await addCustomItem(db, o, { title: 'Later' });
    const b = (await quickAdd(db, { title: 'Later', authors: ['Zed'], status: 'tbr' })).bookId;
    await linkItemToBook(db, it, b);
    const d = (await getOrder(db, o))!;
    expect([d.items[0].book_id, d.items[0].authors]).toEqual([b, 'Zed']);
    await expect(linkItemToBook(db, it, b)).rejects.toThrow();
  });
  it('adds a whole series in order and skips what is already there', async () => {
    const sid = await createSeries(db, 'Saga');
    const ids: string[] = [];
    for (const [t, p] of [['C', 3], ['A', 1], ['B', 2]] as const) { const id = (await quickAdd(db, { title: t, authors: ['X'], status: 'tbr' })).bookId; await setBookSeries(db, id, sid, p); ids.push(id); }
    const o = await createOrder(db, 'P');
    await addLibraryItem(db, o, ids[1]);
    expect(await addSeriesToOrder(db, o, sid)).toBe(2);
    expect((await getOrder(db, o))!.items.map((i) => i.title)).toEqual(['A', 'B', 'C']);
    await expect(addSeriesToOrder(db, o, sid)).rejects.toThrow();
  });
});

import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { applyNotionPlan } from '../src/import/apply';
import { planNotionBooks } from '../src/import/notion';
import { createListItem, getBookLog, listItems, removeTimePeriod, setBookCover, setStatus, updateBook } from '../src/repo/bookLog';
import { getBracket, setMonthPick } from '../src/repo/bracket';
import { addBookToSeries, createSeries, getSeriesPage, markReleased, setFormatRelease } from '../src/repo/series';
import { newId } from '../src/domain/ids';

let db: Db;
const bookId = async (t: string) => (await db.select<{ id: string }>('SELECT id FROM book WHERE title = ?', [t]))[0].id;
beforeEach(async () => {
  db = migrateNodeDb();
  await applyNotionPlan(db, planNotionBooks(readFileSync(new URL('./fixtures/book-tracker.csv', import.meta.url), 'utf8')), { tagDestinations: {} });
});

describe('bracket covers', () => {
  it('carries each candidate cover', async () => {
    const id = await bookId('Egotistical Puckboy');
    await setBookCover(db, id, { dataUrl: 'data:image/png;base64,AAA' });
    const b = await getBracket(db, 2025);
    const c = b.quarters[2].months.flatMap((m) => m.candidates).find((x) => x.book_id === id)!;
    expect(c.cover).toBe('data:image/png;base64,AAA');
    await setMonthPick(db, 2025, 7, c.read_id);
    expect((await getBracket(db, 2025)).quarters[2].months[0].pick?.cover).toBe('data:image/png;base64,AAA');
  });
});

describe('already released', () => {
  it('clears leftover release dates so a shelved book is no longer unreleased', async () => {
    const sid = await createSeries(db, 'Later Series');
    const id = await addBookToSeries(db, sid, 'Out Now');
    await setStatus(db, id, null, 'tbr');
    await setFormatRelease(db, id, 'ebook', '2999-01-01');
    await setFormatRelease(db, id, 'audio', 'tba');
    let p = (await getSeriesPage(db, sid))!.books.find((b) => b.id === id)!;
    expect(p.state).toBe('unreleased');
    await markReleased(db, id);
    p = (await getSeriesPage(db, sid))!.books.find((b) => b.id === id)!;
    expect(p.releases).toEqual([]);
    expect(p.state).not.toBe('unreleased');
  });
});

describe('time periods', () => {
  const names = async () => (await listItems(db, 'time_period')).map((p) => p.name);
  it('has the base set', async () => {
    expect(await names()).toEqual(expect.arrayContaining(['Contemporary', 'Recent History', 'Historical', 'Future', 'Dystopian Future', 'Post Apocalyptic', 'Fantasy']));
  });
  it('removing a period clears it from books and the list, and keeps a detail with the book', async () => {
    const b = await bookId('Egotistical Puckboy');
    const hist = (await listItems(db, 'time_period')).find((p) => p.name === 'Historical')!;
    await updateBook(db, b, { time_period_id: hist.id, time_period_detail: 'Regency' });
    expect((await getBookLog(db, b, null))!.book.time_period_detail).toBe('Regency');
    await removeTimePeriod(db, hist.id);
    const after = (await getBookLog(db, b, null))!.book;
    expect(after.time_period_id).toBeNull();
    expect(after.time_period_detail).toBeNull();
    expect(await names()).not.toContain('Historical');
  });
  it('custom periods can still be added', async () => {
    await createListItem(db, 'time_period', 'Steampunk');
    expect(await names()).toContain('Steampunk');
  });
  it('condenses old decade periods into Recent History with a decade (migration)', async () => {
    const old = newId();
    await db.execute('INSERT INTO time_period (id, name) VALUES (?, ?)', [old, 'Late 1990s']);
    const b = await bookId('Egotistical Puckboy');
    await updateBook(db, b, { time_period_id: old });
    const sql = readFileSync(new URL('../src-tauri/migrations/0019_time_periods.sql', import.meta.url), 'utf8').replace(/ALTER TABLE[^;]*;/, '');
    for (const st of sql.split(';').map((x) => x.replace(/^(\s*--.*\n)+/g, '').trim()).filter(Boolean)) await db.execute(st);
    const book = (await getBookLog(db, b, null))!.book;
    const recent = (await listItems(db, 'time_period')).find((p) => p.name === 'Recent History')!;
    expect(book.time_period_id).toBe(recent.id);
    expect(book.time_period_detail).toBe('1990s');
    expect((await listItems(db, 'time_period')).map((p) => p.name)).not.toContain('Late 1990s');
  });
});

describe('a location that matches an old plain-text place', () => {
  it('fills the old place in instead of leaving it flagged', async () => {
    const { savePlace } = await import('../src/repo/places');
    await db.execute("INSERT INTO place (id, name, located) VALUES ('old1', 'Dungeon', 0)");
    const id = await savePlace(db, null, { area: 'Dungeon', fictional: false });
    expect(id).toBe('old1');
    const [p] = await db.select<{ located: number; state_region: string | null; city: string | null }>("SELECT located, state_region, city FROM place WHERE id = 'old1'");
    expect(p).toMatchObject({ located: 1, state_region: 'Dungeon', city: null });
  });
  it('an area on its own is never flagged', async () => {
    const { savePlace } = await import('../src/repo/places');
    const id = await savePlace(db, null, { area: 'Space', fictional: false });
    const [p] = await db.select<{ located: number }>('SELECT located FROM place WHERE id = ?', [id]);
    expect(p.located).toBe(1);
  });
});

import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { daysBetween, progressOf } from '../src/domain/progress';
import { applyNotionPlan } from '../src/import/apply';
import { planNotionBooks } from '../src/import/notion';
import { saveDayEntry, setBookCover, setStatus, updateBook, updateRead } from '../src/repo/bookLog';
import { createCharacter } from '../src/repo/characters';
import { getHome } from '../src/repo/home';
import { setFormatRelease } from '../src/repo/series';

const TODAY = '2026-10-13';
let db: Db;
const bookId = async (t: string) => (await db.select<{ id: string }>('SELECT id FROM book WHERE title = ?', [t]))[0].id;

beforeEach(async () => {
  db = migrateNodeDb();
  await applyNotionPlan(db, planNotionBooks(readFileSync(new URL('./fixtures/book-tracker.csv', import.meta.url), 'utf8')), { tagDestinations: {} });
});

describe('how far through a book you are', () => {
  const print = { format: 'physical' as const, pageCount: 300, audioSeconds: null };
  const audio = { format: 'audio' as const, audioSeconds: 36000, pageCount: 300 };
  it('uses the page for print and ebooks, and the time for audio', () => {
    expect(progressOf({ page: 150, percent: null, seconds: null }, print)).toBe(0.5);
    expect(progressOf({ page: null, percent: null, seconds: 9000 }, audio)).toBe(0.25);
    expect(progressOf({ page: 30, percent: null, seconds: 18000 }, audio)).toBe(0.5); // audio prefers time over page
    expect(progressOf({ page: 30, percent: null, seconds: 18000 }, { ...print, audioSeconds: 36000 })).toBe(0.1); // print prefers page
  });
  it('falls back to a percent, and to the other measure, when the usual one is missing', () => {
    expect(progressOf({ page: null, percent: 62, seconds: null }, print)).toBe(0.62);
    expect(progressOf({ page: 150, percent: 80, seconds: null }, { ...print, pageCount: null })).toBe(0.8); // no page count to compare against
    expect(progressOf({ page: 100, percent: null, seconds: null }, audio)).toBeCloseTo(100 / 300);
  });
  it('stays between 0 and 1 and says when it cannot tell', () => {
    expect(progressOf({ page: 400, percent: null, seconds: null }, print)).toBe(1);
    expect(progressOf({ page: null, percent: 120, seconds: null }, print)).toBe(1);
    expect(progressOf({ page: 50, percent: null, seconds: null }, { ...print, pageCount: null })).toBeNull();
    expect(progressOf(null, print)).toBeNull();
    expect(progressOf({ page: null, percent: null, seconds: null }, print)).toBeNull();
  });
  it('counts days between dates', () => {
    expect(daysBetween('2026-10-10', '2026-10-13')).toBe(3);
    expect(daysBetween('2026-09-30', '2026-10-01')).toBe(1);
    expect(daysBetween('2026-10-13', '2026-10-13')).toBe(0);
  });
});

describe('the Home data', () => {
  it('starts with nothing in progress, up next in order, and recent finishes newest first', async () => {
    const h = await getHome(db, TODAY);
    expect(h.reading).toEqual([]); expect(h.paused).toEqual([]);
    expect(h.upNext.map((b) => b.title)).toEqual(['Hooks In', '68 Whiskey', 'Ronan']);
    expect(h.upNextCount).toBe(3);
    expect(h.recent).toHaveLength(6);
    expect(h.recent[0].finish_date).toBe('2026-10-08');
    expect(h.recent.map((r) => r.finish_date)).toEqual([...h.recent.map((r) => r.finish_date)].sort().reverse());
    expect(h.recent[0].authors).toBeTruthy();
  });
  it('shows a book you have started, with the day you are on and how far through it is', async () => {
    const id = await bookId('Hooks In');
    await updateBook(db, id, { page_count: 300 });
    const rid = (await setStatus(db, id, null, 'reading'))!;
    await updateRead(db, rid, { start_date: '2026-10-10', format: 'physical' });
    await saveDayEntry(db, rid, { date: '2026-10-11', page: 60 });
    await saveDayEntry(db, rid, { date: '2026-10-12', page: 150, text: 'Good' });
    const h = await getHome(db, TODAY);
    expect(h.upNext.map((b) => b.title)).not.toContain('Hooks In');
    expect(h.upNextCount).toBe(2);
    expect(h.reading).toHaveLength(1);
    expect(h.reading[0]).toMatchObject({ title: 'Hooks In', day: 4, progress: 0.5, entries: 2, last_entry: { date: '2026-10-12', page: 150 } });
  });
  it('uses the latest entry for progress, even if it was added earlier', async () => {
    const id = await bookId('Hooks In');
    const rid = (await setStatus(db, id, null, 'reading'))!;
    await updateRead(db, rid, { format: 'audio', audio_length_seconds: 36000 });
    await saveDayEntry(db, rid, { date: '2026-10-12', seconds: 18000 });
    await saveDayEntry(db, rid, { date: '2026-10-08', seconds: 3600 });
    expect((await getHome(db, TODAY)).reading[0].progress).toBe(0.5);
  });
  it('has no progress when nothing is logged', async () => {
    await setStatus(db, await bookId('Hooks In'), null, 'reading');
    const r = (await getHome(db, TODAY)).reading[0];
    expect([r.progress, r.last_entry, r.entries]).toEqual([null, null, 0]);
  });
  it('lists paused books separately', async () => {
    const id = await bookId('Hooks In');
    const rid = (await setStatus(db, id, null, 'reading'))!;
    await setStatus(db, id, rid, 'on_hold');
    const h = await getHome(db, TODAY);
    expect(h.reading).toEqual([]);
    expect(h.paused.map((p) => [p.title, p.status])).toEqual([['Hooks In', 'on_hold']]);
  });
  it('shows covers when books have them', async () => {
    await setBookCover(db, await bookId('Hooks In'), { dataUrl: 'data:image/png;base64,UP' });
    await setBookCover(db, await bookId('Bro Doll'), { dataUrl: 'data:image/png;base64,RC' });
    const h = await getHome(db, TODAY);
    expect(h.upNext.find((b) => b.title === 'Hooks In')!.cover).toBe('data:image/png;base64,UP');
    expect(h.recent.find((b) => b.title === 'Bro Doll')!.cover).toBe('data:image/png;base64,RC');
    expect(h.upNext.find((b) => b.title === '68 Whiskey')!.cover).toBeNull();
  });
  it('totals the year so far', async () => {
    const reads = await db.select<{ id: string; title: string }>("SELECT r.id AS id, b.title AS title FROM read r JOIN book b ON b.id = r.book_id WHERE r.finish_date LIKE '2026-%'");
    expect(reads).toHaveLength(5);
    await updateRead(db, reads.find((r) => r.title === 'Bro Doll')!.id, { rating: 20, format: 'audio', audio_length_seconds: 3600 });
    await updateRead(db, reads.find((r) => r.title === 'Killer Love')!.id, { rating: 12, format: 'audio', audio_length_seconds: 7200 });
    await updateBook(db, await bookId('Bro Doll'), { page_count: 300 });
    const y = (await getHome(db, TODAY)).year;
    expect(y).toMatchObject({ year: 2026, finished: 5, thisMonth: 5, ratedBooks: 2, avgStars: 4, pages: 300, audioSeconds: 10800 });
    expect((await getHome(db, '2026-11-02')).year).toMatchObject({ finished: 5, thisMonth: 0 }); // a new month
    expect((await getHome(db, '2025-12-31')).year).toMatchObject({ year: 2025, finished: 5, thisMonth: 0 });
    expect((await getHome(db, '2019-01-01')).year).toMatchObject({ finished: 0, avgStars: null, pages: 0, audioSeconds: 0 });
  });
  it('lists the next few announced releases, soonest first, leaving out ones already out', async () => {
    const id = await bookId('Hooks In');
    await setFormatRelease(db, id, 'audio', '2026-12-01');
    await setFormatRelease(db, id, 'ebook', '2026-11-01');
    await setFormatRelease(db, id, 'physical', 'tba');
    await setFormatRelease(db, await bookId('68 Whiskey'), 'ebook', '2026-01-01'); // already out
    const up = (await getHome(db, TODAY)).upcoming;
    expect(up.map((u) => [u.format, u.release_date])).toEqual([['ebook', '2026-11-01'], ['audio', '2026-12-01'], ['physical', null]]);
  });
  it('points out loose ends: books with no cover, characters in no book, series waiting on the next book', async () => {
    let t = (await getHome(db, TODAY)).tidy;
    expect(t.noCover).toBe(15);
    expect(t.unassignedCharacters).toBe(0);
    expect(t.caughtUp.map((s) => s.title)).toContain('Puckboys');
    await setBookCover(db, await bookId('Hush'), { dataUrl: 'data:image/png;base64,A' });
    await createCharacter(db, 'Nobody Yet');
    t = (await getHome(db, TODAY)).tidy;
    expect([t.noCover, t.unassignedCharacters]).toEqual([14, 1]);
  });
});

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { applyNotionPlan } from '../src/import/apply';
import { planNotionBooks } from '../src/import/notion';
import { getBookLog, listInProgressReads, saveDayEntry, setStatus, updateRead } from '../src/repo/bookLog';
import { getCalendarMonth } from '../src/repo/calendar';
import { getHome } from '../src/repo/home';
import { listLibrary } from '../src/repo/library';

let db: Db;
const id = async (t: string) => (await db.select<{ id: string }>('SELECT id FROM book WHERE title = ?', [t]))[0].id;
const reads = async (bookId: string) => db.select<{ id: string; status: string; deleted_at: string | null }>('SELECT id, status, deleted_at FROM read WHERE book_id = ? ORDER BY rowid', [bookId]);

beforeEach(async () => {
  db = migrateNodeDb();
  await applyNotionPlan(db, planNotionBooks(readFileSync(new URL('./fixtures/book-tracker.csv', import.meta.url), 'utf8')), { tagDestinations: {} });
});

describe('moving a book out of In Progress', () => {
  it('takes a book that was being read off Currently reading when it goes to TBR', async () => {
    const book = await id('Hooks In');
    const rid = (await setStatus(db, book, null, 'reading'))!;
    await saveDayEntry(db, rid, { date: '2026-10-12', percent: 30 });
    expect((await getHome(db, '2026-10-13')).reading.map((r) => r.title)).toEqual(['Hooks In']);
    const back = await setStatus(db, book, rid, 'tbr');
    expect(back).toBeNull(); // the unfinished read no longer exists
    const home = await getHome(db, '2026-10-13');
    expect(home.reading).toEqual([]);
    expect(home.paused).toEqual([]);
    expect(await listInProgressReads(db)).toEqual([]); // not offered in the Daily log either
    expect((await listLibrary(db)).find((b) => b.title === 'Hooks In')!.status).toBe('tbr');
    expect((await getBookLog(db, book))!.read).toBeNull();
  });
  it('does the same for Up Next, and for a book that was paused', async () => {
    const a = await id('Hooks In'); const b = await id('68 Whiskey');
    await setStatus(db, a, (await setStatus(db, a, null, 'reading'))!, 'up_next');
    const rb = (await setStatus(db, b, null, 'reading'))!;
    await setStatus(db, b, rb, 'on_hold');
    expect((await getHome(db, '2026-10-13')).paused).toHaveLength(1);
    await setStatus(db, b, rb, 'tbr');
    const home = await getHome(db, '2026-10-13');
    expect([home.reading.length, home.paused.length]).toEqual([0, 0]);
    const ra = await reads(a); // the started read is gone; Up Next gets a fresh planned (paused, undated) read
    expect(ra.filter((r) => r.deleted_at === null).map((r) => r.status)).toEqual(['on_hold']);
    expect(ra.filter((r) => r.deleted_at !== null)).toHaveLength(1);
    expect((await getHome(db, '2026-10-13')).paused).toEqual([]);
  });
  it('keeps finished reads, since they are history', async () => {
    const book = await id('Egotistical Puckboy'); // finished 2025-07-27
    await setStatus(db, book, null, 'tbr'); // planning a re-read
    expect((await reads(book)).map((r) => [r.status, r.deleted_at])).toEqual([['finished', null]]);
    expect((await getBookLog(db, book))!.reads).toHaveLength(1);
  });
  it('drops only the unfinished read when a book is being re-read', async () => {
    const book = await id('Egotistical Puckboy');
    const second = (await setStatus(db, book, null, 'reading'))!; // a re-read
    expect((await reads(book)).map((r) => r.status)).toEqual(['finished', 'reading']);
    await setStatus(db, book, second, 'up_next');
    const left = (await reads(book)).filter((r) => r.deleted_at === null);
    expect(left.map((r) => r.status)).toEqual(['finished', 'on_hold']); // plus the planned read for Up Next
  });
  it('keeps a did-not-finish read', async () => {
    const book = await id('Hooks In');
    const rid = (await setStatus(db, book, null, 'dnf'))!;
    await setStatus(db, book, rid, 'tbr');
    expect((await reads(book)).map((r) => [r.status, r.deleted_at])).toEqual([['dnf', null]]);
  });
  it('removes it from the Calendar too, and starting again begins a fresh read', async () => {
    const book = await id('Hooks In');
    const rid = (await setStatus(db, book, null, 'reading'))!;
    await updateRead(db, rid, { start_date: '2026-10-10' });
    expect((await getCalendarMonth(db, 2026, 10, '2026-10-13')).lines.map((l) => l.title)).toEqual(['Hooks In']);
    await setStatus(db, book, rid, 'tbr');
    expect((await getCalendarMonth(db, 2026, 10, '2026-10-13')).lines).toEqual([]);
    const again = (await setStatus(db, book, null, 'reading'))!;
    expect(again).not.toBe(rid);
    expect((await getBookLog(db, book))!.entries).toEqual([]);
  });
  it('still lets a finished or paused read move between the other statuses', async () => {
    const book = await id('Hooks In');
    const rid = (await setStatus(db, book, null, 'reading'))!;
    expect(await setStatus(db, book, rid, 'on_hold')).toBe(rid);
    expect(await setStatus(db, book, rid, 'finished')).toBe(rid);
    expect((await reads(book)).map((r) => [r.status, r.deleted_at])).toEqual([['finished', null]]);
  });
});

describe('migration 7: books already stuck in that state', () => {
  const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
  it('ends unfinished reads on books that are on a shelf, and leaves everything else alone', () => {
    const raw = new DatabaseSync(':memory:');
    const dir = new URL('../src-tauri/migrations/', import.meta.url);
    for (const f of ['0001_initial.sql', '0002_year_number_tiebreak.sql', '0003_tag_colors.sql', '0004_plain_people_and_origin_tags.sql', '0005_bracket_match_winners.sql', '0006_series_authors_and_statuses.sql']) raw.exec(readFileSync(new URL(f, dir), 'utf8'));
    raw.exec(`INSERT INTO book (id, title, shelf) VALUES ('stuck', 'Stuck', 'tbr'), ('stuck2', 'Stuck Paused', 'up_next'), ('reading', 'Reading', NULL), ('rereading', 'Re-reading', 'tbr');
      INSERT INTO read (id, book_id, status) VALUES ('r1', 'stuck', 'reading'), ('r2', 'stuck2', 'on_hold'), ('r3', 'reading', 'reading'), ('r4', 'rereading', 'finished');
      INSERT INTO read (id, book_id, status, finish_date) VALUES ('r5', 'rereading', 'dnf', NULL);`);
    raw.exec(readFileSync(new URL('0007_end_stuck_reads.sql', dir), 'utf8'));
    const state = Object.fromEntries((raw.prepare('SELECT id, deleted_at IS NOT NULL AS gone FROM read').all() as { id: string; gone: number }[]).map((r) => [r.id, r.gone]));
    expect(state).toEqual({ r1: 1, r2: 1, r3: 0, r4: 0, r5: 0 });
    raw.exec(readFileSync(new URL('0007_end_stuck_reads.sql', dir), 'utf8')); // running it again changes nothing
    expect((raw.prepare('SELECT count(*) AS n FROM read WHERE deleted_at IS NULL').get() as { n: number }).n).toBe(3);
  });
});

describe('the Home screen styles', () => {
  const css = readFileSync(new URL('../src/theme/theme.css', import.meta.url), 'utf8');
  it('makes every cover on a shelf the width of its column, whatever is in it', () => {
    expect(css).toMatch(/\.shelfitem\s*>\s*\.shelfcover\s*\{[^}]*display:\s*block[^}]*width:\s*100%/);
  });
  it('keeps links that sit in a sentence on the line', () => {
    expect(css).toMatch(/\.inlinelink[^{]*\{[^}]*display:\s*inline/);
  });
});

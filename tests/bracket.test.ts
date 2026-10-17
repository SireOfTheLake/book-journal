import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { applyNotionPlan } from '../src/import/apply';
import { planNotionBooks } from '../src/import/notion';
import { updateBook, updateRead } from '../src/repo/bookLog';
import { getBracket, setHalfPick, setMatchWinner, setMonthPick, setQuarterPick, setYearPick } from '../src/repo/bracket';
import { getMonthChart } from '../src/repo/monthChart';

let db: Db;
const readOf = async (t: string) => (await db.select<{ id: string }>('SELECT r.id AS id FROM read r JOIN book b ON b.id = r.book_id WHERE b.title = ?', [t]))[0].id;
const bookOf = async (t: string) => (await db.select<{ id: string }>('SELECT id FROM book WHERE title = ?', [t]))[0].id;

beforeEach(async () => {
  db = migrateNodeDb();
  await applyNotionPlan(db, planNotionBooks(readFileSync(new URL('./fixtures/book-tracker.csv', import.meta.url), 'utf8')), { tagDestinations: {} });
});

describe('the Month Chart', () => {
  it('lists the books finished in each month of the year, in finish order', async () => {
    const m = await getMonthChart(db, 2025);
    expect(m.map((x) => x.books.length)).toEqual([0, 0, 0, 0, 0, 0, 3, 2, 0, 0, 0, 0]);
    expect(m[6].books.map((b) => b.title)).toEqual(['The Prince and the Player', 'Egotistical Puckboy', 'Irresponsible Puckboy']);
    expect((await getMonthChart(db, 2026))[9].books).toHaveLength(5);
  });
  it('totals pages for the month, splitting a book that spans two months', async () => {
    await updateBook(db, await bookOf('Egotistical Puckboy'), { page_count: 300 });
    await updateBook(db, await bookOf('The Boyfriend Subscription'), { page_count: 340 });
    await updateRead(db, await readOf('The Boyfriend Subscription'), { start_date: '2025-07-30' }); // 30 July to 15 August: 17 days
    const m = await getMonthChart(db, 2025);
    expect(m[6].pages).toBe(300 + 40); // Egotistical on the 27th, plus two of the Boyfriend Subscription's days
    expect(m[7].pages).toBe(300);
    expect(m[0].pages).toBe(0);
  });
});

describe('the Book Bracket', () => {
  const july = async () => (await getBracket(db, 2025)).quarters[2];

  it('offers each month\'s finished books, best rated first, and suggests the top one', async () => {
    await updateRead(db, await readOf('Egotistical Puckboy'), { rating: 18 });
    await updateRead(db, await readOf('Irresponsible Puckboy'), { rating: 14 });
    const jul = (await july()).months[0];
    expect(jul.candidates.map((c) => c.title)).toEqual(['Egotistical Puckboy', 'Irresponsible Puckboy', 'The Prince and the Player']);
    expect(jul.suggested).toBe(await readOf('Egotistical Puckboy'));
    expect(jul.pick).toBeNull();
  });
  it('plays January against February, February against March, then the two winners', async () => {
    await setMonthPick(db, 2025, 7, await readOf('Egotistical Puckboy'));
    await setMonthPick(db, 2025, 8, await readOf('Hush'));
    let q = await july();
    expect(q.w1Options.map((c) => c.title)).toEqual(['Egotistical Puckboy', 'Hush']);
    expect(q.w2Options.map((c) => c.title)).toEqual(['Hush']); // September has no pick yet
    await setMatchWinner(db, 2025, 3, 1, await readOf('Hush'));
    await setMatchWinner(db, 2025, 3, 2, await readOf('Hush'));
    q = await july();
    expect(q.bestOptions.map((c) => c.title)).toEqual(['Hush']); // listed once
    await setQuarterPick(db, 2025, 3, await readOf('Hush'));
    await setHalfPick(db, 2025, 2, await readOf('Hush'));
    await setYearPick(db, 2025, await readOf('Hush'));
    const b = await getBracket(db, 2025);
    expect([b.quarters[2].best?.title, b.halves[1].best?.title, b.champion?.title]).toEqual(['Hush', 'Hush', 'Hush']);
  });
  it('only allows a book that is in the match', async () => {
    await setMonthPick(db, 2025, 7, await readOf('Egotistical Puckboy'));
    await expect(setMonthPick(db, 2025, 8, await readOf('Egotistical Puckboy'))).rejects.toThrow(/not in this match/); // finished in July, not August
    await expect(setMatchWinner(db, 2025, 3, 1, await readOf('Hush'))).rejects.toThrow(/not in this match/); // not picked for August
    await expect(setQuarterPick(db, 2025, 3, await readOf('Egotistical Puckboy'))).rejects.toThrow(/not in this match/); // not yet a match winner
  });
  it('removes picks that depended on a book that is no longer in their match', async () => {
    await setMonthPick(db, 2025, 7, await readOf('Egotistical Puckboy'));
    await setMonthPick(db, 2025, 8, await readOf('Hush'));
    await setMatchWinner(db, 2025, 3, 1, await readOf('Hush'));
    await setMatchWinner(db, 2025, 3, 2, await readOf('Hush'));
    await setQuarterPick(db, 2025, 3, await readOf('Hush'));
    await setHalfPick(db, 2025, 2, await readOf('Hush'));
    await setYearPick(db, 2025, await readOf('Hush'));
    await setMonthPick(db, 2025, 8, await readOf('The Boyfriend Subscription')); // August's best changes
    const b = await getBracket(db, 2025);
    expect([b.quarters[2].w1, b.quarters[2].w2, b.quarters[2].best, b.halves[1].best, b.champion]).toEqual([null, null, null, null, null]);
    expect(b.quarters[2].months[1].pick?.title).toBe('The Boyfriend Subscription');
    expect(b.quarters[2].months[0].pick?.title).toBe('Egotistical Puckboy'); // January-style picks that are still valid stay
  });
  it('keeps a still-valid winner when an unrelated pick changes', async () => {
    await setMonthPick(db, 2025, 7, await readOf('Egotistical Puckboy'));
    await setMonthPick(db, 2025, 8, await readOf('Hush'));
    await setMatchWinner(db, 2025, 3, 1, await readOf('Egotistical Puckboy'));
    await setMonthPick(db, 2025, 8, await readOf('The Boyfriend Subscription'));
    expect((await july()).w1?.title).toBe('Egotistical Puckboy');
  });
  it('clears a pick, and a book that is changed to a different month drops out', async () => {
    await setMonthPick(db, 2025, 7, await readOf('Egotistical Puckboy'));
    await setMonthPick(db, 2025, 7, null);
    expect((await july()).months[0].pick).toBeNull();
    await setMonthPick(db, 2025, 7, await readOf('Egotistical Puckboy'));
    await updateRead(db, await readOf('Egotistical Puckboy'), { finish_date: '2025-09-02' }); // moved to September
    const b = await getBracket(db, 2025);
    expect(b.quarters[2].months[0].pick).toBeNull();
    expect(b.quarters[2].months[2].candidates.map((c) => c.title)).toEqual(['Egotistical Puckboy']);
  });
  it('creates the journal year once', async () => {
    await getBracket(db, 2025); await getBracket(db, 2025);
    expect(await db.select('SELECT id FROM journal_year WHERE year = 2025')).toHaveLength(1);
  });
});

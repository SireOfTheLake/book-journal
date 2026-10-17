import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { beforeAll, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { applyNotionPlan } from '../src/import/apply';
import { planNotionBooks } from '../src/import/notion';
import { updateBook, updateRead } from '../src/repo/bookLog';
import { getBracket, setHalfPick, setMatchWinner, setMonthPick, setQuarterPick, setYearPick } from '../src/repo/bracket';
import { getMonthChart } from '../src/repo/monthChart';
import BracketView, { type BracketActions } from '../src/pages/BracketView';
import MonthChartView from '../src/pages/MonthChartView';

const noop = () => undefined;
const wrap = (el: JSX.Element) => renderToString(<StaticRouter location="/">{el}</StaticRouter>);
let db: Db;
const readOf = async (t: string) => (await db.select<{ id: string }>('SELECT r.id AS id FROM read r JOIN book b ON b.id = r.book_id WHERE b.title = ?', [t]))[0].id;

beforeAll(async () => {
  db = migrateNodeDb();
  await applyNotionPlan(db, planNotionBooks(readFileSync(new URL('./fixtures/book-tracker.csv', import.meta.url), 'utf8')), { tagDestinations: {} });
});

it('renders the Month Chart with a cell per book and the pages line', async () => {
  await updateBook(db, (await db.select<{ id: string }>("SELECT id FROM book WHERE title = 'Egotistical Puckboy'"))[0].id, { page_count: 300 });
  await updateBook(db, (await db.select<{ id: string }>("SELECT id FROM book WHERE title = 'Hush'"))[0].id, { page_count: 250 });
  const html = wrap(<MonthChartView months={await getMonthChart(db, 2025)} year={2025} />);
  for (const text of ['JAN', 'JUL', 'AUG', 'DEC', 'Books finished in 2025', 'Pages', 'Egotistical Puckboy', 'Hush']) expect(html, text).toContain(text);
  expect((html.match(/class="mcell"/g) ?? []).length).toBe(5);
  expect(html).toContain('<polyline'); // two months have pages, so the line is drawn
  expect(html).toContain('title="July: 3 books, 300 pages"');
});

it('renders an empty Month Chart without breaking', async () => {
  const html = wrap(<MonthChartView months={await getMonthChart(db, 2019)} year={2019} />);
  expect(html).toContain('Books finished in 2019');
  expect(html).not.toContain('<polyline');
});

it('renders the Book Bracket with picks, winners, and empty slots', async () => {
  await setMonthPick(db, 2025, 7, await readOf('Egotistical Puckboy'));
  await setMonthPick(db, 2025, 8, await readOf('Hush'));
  await setMatchWinner(db, 2025, 3, 1, await readOf('Hush'));
  await setMatchWinner(db, 2025, 3, 2, await readOf('Hush'));
  await setQuarterPick(db, 2025, 3, await readOf('Hush'));
  await setHalfPick(db, 2025, 2, await readOf('Hush'));
  await setYearPick(db, 2025, await readOf('Hush'));
  await updateRead(db, await readOf('Hush'), { rating: 18 });
  const act = new Proxy({}, { get: () => noop }) as BracketActions;
  const html = wrap(<BracketView bracket={await getBracket(db, 2025)} act={act} />);
  for (const text of ['Q1 · January to March', 'Q3 · July to September', 'Q4 · October to December', 'BEST OF Q3', 'BEST OF 2025', 'Half-years and the year', 'JAN TO JUN', 'JUL TO DEC', 'HUSH', 'EGOTISTICAL PUCKBOY', 'No books', '4.5 of 5']) expect(html, text).toContain(text);
  expect(html).toContain('bslot win'); // a book that won its match is outlined
  expect(html).toContain('bslot lose'); // the book that did not advance is dimmed
});

it('invites a pick for a month that has books but no pick yet', async () => {
  const act = new Proxy({}, { get: () => noop }) as BracketActions;
  const html = wrap(<BracketView bracket={await getBracket(db, 2026)} act={act} />);
  expect(html).toContain('Choose the best of the month'); // October 2026 has five books
  expect(html).toContain('Q4 · October to December');
});

import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { expect, it } from 'vitest';
import { migrateNodeDb } from '../src/db/nodeDb';
import { applyNotionPlan } from '../src/import/apply';
import { planNotionBooks } from '../src/import/notion';
import { saveDayEntry, updateBook, updateRead } from '../src/repo/bookLog';
import { getCalendarMonth } from '../src/repo/calendar';
import CalendarView from '../src/pages/CalendarView';

it('renders October 2026 with covers, a reading line, a day flag, and the pages chart', async () => {
  const db = migrateNodeDb();
  await applyNotionPlan(db, planNotionBooks(readFileSync(new URL('./fixtures/book-tracker.csv', import.meta.url), 'utf8')), { tagDestinations: {} });
  const [{ id: readId }] = await db.select<{ id: string }>("SELECT r.id AS id FROM read r JOIN book b ON b.id = r.book_id WHERE b.title = 'MateHub: Legend'");
  await updateRead(db, readId, { start_date: '2026-10-03' });
  await saveDayEntry(db, readId, { date: '2026-10-04', percent: 62 });
  const [{ id: bookId }] = await db.select<{ id: string }>("SELECT id FROM book WHERE title = 'Bro Doll'");
  await updateBook(db, bookId, { page_count: 300 });
  const data = await getCalendarMonth(db, 2026, 10, '2026-10-09');
  const noop = () => undefined;
  const html = renderToString(<StaticRouter location="/"><CalendarView data={data} today="2026-10-09" canPrev canNext onPrev={noop} onNext={noop} onToday={noop} /></StaticRouter>);
  for (const text of ['OCTOBER 2026', 'Books finished', 'Days with a finish', 'Pages read per day', 'Sun', 'Sat', 'BRO DOLL', 'MATEHUB: LEGEND', 'KILLER LOVE', 'CORNER OFFICE', '62%', 'class="line"']) {
    expect(html, text).toContain(text);
  }
  expect((html.match(/class="cday/g) ?? []).length).toBe(35); // five weeks
  expect(html).toContain('title="300 pages"');
  expect(html).toContain('class="cday today"');
});

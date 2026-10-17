import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { expect, it } from 'vitest';
import { migrateNodeDb } from '../src/db/nodeDb';
import { applyNotionPlan } from '../src/import/apply';
import { planNotionBooks } from '../src/import/notion';
import BookListView from '../src/pages/BookListView';
import { listJournalYear } from '../src/repo/journal';

it('shows the Book List with the add row, Up Next group, and month groups', async () => {
  const db = migrateNodeDb();
  await applyNotionPlan(db, planNotionBooks(readFileSync(new URL('./fixtures/book-tracker.csv', import.meta.url), 'utf8')), { tagDestinations: {} });
  const noop = () => undefined;
  const html = renderToString(<StaticRouter location="/"><BookListView data={await listJournalYear(db, 2026)} year={2026} act={{ addBook: noop, start: noop, finish: noop }} /></StaticRouter>);
  for (const text of ['Add a book', 'Up next', 'Hooks In', '68 Whiskey', 'Ronan', 'October 2026', 'Corner Office', 'Bro Doll', 'Start', 'Group by month', 'All months']) expect(html, text).toContain(text);
  expect((html.match(/>Start</g) ?? []).length).toBe(3);
  expect(html.indexOf('<b>Up next</b>')).toBeLessThan(html.indexOf('<b>October 2026</b>'));
  expect(html.indexOf('Add a book')).toBeLessThan(html.indexOf('<b>Up next</b>'));
  expect(html).not.toContain('Entree to Murder'); // TBR is not part of this list
});

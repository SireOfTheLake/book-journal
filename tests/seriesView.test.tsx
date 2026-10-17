import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { expect, it } from 'vitest';
import { migrateNodeDb } from '../src/db/nodeDb';
import { applyNotionPlan } from '../src/import/apply';
import { planNotionBooks } from '../src/import/notion';
import { listTagOptions } from '../src/repo/bookLog';
import { addBookToSeries, getSeriesPage, listSeriesLedger, listUniverses, setFormatRelease, updateSeries } from '../src/repo/series';
import LedgerView from '../src/pages/series/LedgerView';
import SeriesView from '../src/pages/series/SeriesView';

const csv = readFileSync(new URL('./fixtures/book-tracker.csv', import.meta.url), 'utf8');
const noop = () => undefined;
const wrap = (el: JSX.Element) => renderToString(<StaticRouter location="/">{el}</StaticRouter>);

it('renders the Series Ledger with marks, statuses, and the caught-up flag', async () => {
  const db = migrateNodeDb();
  await applyNotionPlan(db, planNotionBooks(csv), { tagDestinations: { sadenverse: 'universe' } });
  const html = wrap(<LedgerView rows={await listSeriesLedger(db)} onCreate={noop} />);
  for (const text of ['Puckboys', 'MateHub', 'Sadenverse', 'Caught up', 'Not started', 'Find a series', 'New series', 'Did not finish', 'Caught up, not finished']) expect(html, text).toContain(text);
  expect(html).toContain('class="schip caught_up"');
  expect(html).toContain('>X<');
});

it('renders a Series page with a TBR addition, an unreleased book, and release dates', async () => {
  const db = migrateNodeDb();
  await applyNotionPlan(db, planNotionBooks(csv), { tagDestinations: { sadenverse: 'universe' } });
  const [{ id }] = await db.select<{ id: string }>("SELECT id FROM series WHERE title = 'Puckboys'");
  await updateSeries(db, id, { publication_status: 'complete', total_books: 2 });
  const added = await addBookToSeries(db, id, 'Shameless Puckboy');
  await setFormatRelease(db, added, 'audio', '2099-03-01');
  const page = (await getSeriesPage(db, id))!;
  const html = wrap(<SeriesView page={page} lists={{ universes: await listUniverses(db), genres: await listTagOptions(db, 'genre'), books: [], authors: [] }} act={{ update: noop, createUniverse: noop, addGenre: noop, removeGenre: noop, renameGenre: noop, addBook: noop, setRelease: noop, markReleased: noop, addExistingBook: noop, setBookStatus: noop, setPosition: noop, addAuthor: noop, createAuthor: noop, removeAuthor: noop }} />);
  for (const text of ['Puckboys', 'Egotistical Puckboy', 'Shameless Puckboy', 'Eden Finley', 'Sadenverse', 'Unreleased', 'Releases', '2099-03-01', 'Not marked finished', 'Add a book to this series', 'Series notes', 'Average rating', 'Add another author']) expect(html, text).toContain(text);
  expect(html).toContain('dashed');
});

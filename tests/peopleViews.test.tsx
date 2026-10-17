import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { beforeAll, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { applyNotionPlan } from '../src/import/apply';
import { planNotionBooks } from '../src/import/notion';
import { createBook } from '../src/repo/books';
import { getBookLog, listItems, setNarratorAccent, setNarratorRating, updateBook, updateRead } from '../src/repo/bookLog';
import { addAlias, addLink, addUsualAccent, getAuthor, getNarrator, listAuthors, listNarrators } from '../src/repo/people';
import { setFormatRelease } from '../src/repo/series';
import AuthorView from '../src/pages/people/AuthorView';
import NarratorView, { type NarratorActions } from '../src/pages/people/NarratorView';
import PeopleListView from '../src/pages/people/PeopleListView';

const noop = () => undefined;
const act = new Proxy({}, { get: () => noop }) as NarratorActions;
const wrap = (el: JSX.Element) => renderToString(<StaticRouter location="/">{el}</StaticRouter>);
let db: Db;
const idOf = async (table: string, n: string) => (await db.select<{ id: string }>(`SELECT id FROM ${table} WHERE name = ?`, [n]))[0].id;

beforeAll(async () => {
  db = migrateNodeDb();
  await applyNotionPlan(db, planNotionBooks(readFileSync(new URL('./fixtures/book-tracker.csv', import.meta.url), 'utf8')), { tagDestinations: { hockey: 'genre', sports: 'genre' } });
});

it('renders the author and narrator lists', async () => {
  const authors = wrap(<PeopleListView kind="author" rows={await listAuthors(db)} />);
  for (const text of ['Find a author', 'Eden Finley', 'Saxon James', 'Favorites', 'Average rating']) expect(authors, text).toContain(text);
  const narrators = wrap(<PeopleListView kind="narrator" rows={await listNarrators(db)} />);
  for (const text of ['Alexander Cendese', 'Listens', 'Hours']) expect(narrators, text).toContain(text);
});

it('renders an author page with books, series, co-authors, ratings, unread books, and upcoming releases', async () => {
  const id = await idOf('author', 'Eden Finley');
  await addAlias(db, 'author', id, 'E. Finley');
  await addLink(db, 'author', id, 'Website', 'https://example.com');
  const [{ rid }] = await db.select<{ rid: string }>("SELECT r.id AS rid FROM read r JOIN book b ON b.id = r.book_id WHERE b.title = 'Egotistical Puckboy'");
  await updateRead(db, rid, { rating: 18 });
  await updateBook(db, (await db.select<{ id: string }>("SELECT id FROM book WHERE title = 'Egotistical Puckboy'"))[0].id, { page_count: 300 });
  const next = await createBook(db, { title: 'Shameless Puckboy', authors: ['Eden Finley'], shelf: 'tbr' });
  await setFormatRelease(db, next, 'audio', '2099-03-01');
  const html = wrap(<AuthorView d={(await getAuthor(db, id))!} act={act} />);
  for (const text of ['Eden Finley', 'Add photo', 'Pen names', 'E. Finley', 'Links', 'Website', 'Books read', 'Puckboys', 'Saxon James', 'Average rating', 'Total pages', '300', 'Egotistical Puckboy', 'Irresponsible Puckboy', 'Average rating by format', 'Common genres and tropes', 'hockey', 'Unread books', 'Shameless Puckboy', 'Upcoming releases', '2099-03-01', 'Mark as favorite']) expect(html, text).toContain(text);
});

it('renders a narrator page with listens, ratings, accents, and not-listened books', async () => {
  const id = await idOf('narrator', 'Alexander Cendese');
  const log = (await getBookLog(db, (await db.select<{ id: string }>("SELECT id FROM book WHERE title = 'Egotistical Puckboy'"))[0].id))!;
  const mine = log.narrators.find((n) => n.name === 'Alexander Cendese')!;
  await setNarratorRating(db, mine.id, 'up');
  await setNarratorAccent(db, mine.id, 'General NA');
  await addUsualAccent(db, id, 'British');
  const book = await createBook(db, { title: 'Book X', authors: ['Someone'] });
  await db.execute("INSERT INTO book_narrator (id, book_id, narrator_id, sort_order) VALUES ('bn1', ?, ?, 0)", [book, id]);
  const html = wrap(<NarratorView d={(await getNarrator(db, id))!} accents={await listItems(db, 'accent')} act={act} />);
  for (const text of ['Alexander Cendese', 'Aliases', 'Usual accents', 'British', 'Listens', 'Total hours', 'Rating tally', '1 up', 'Co-narrators', 'Iggy Toma', 'Characters voiced', 'Egotistical Puckboy', 'General NA', 'Common accents', 'Not listened yet', 'Book X', 'Add a book narrated by Alexander Cendese', 'Photo from a link']) expect(html, text).toContain(text);
});

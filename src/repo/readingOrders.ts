import type { Db } from '../db/adapter';
import { newId } from '../domain/ids';
import { byTitle } from '../domain/sortKey';
import { bestMatch } from '../domain/nameMatch';
import { createBook } from './books';
import { setBookCover } from './bookLog';
import { createSeries, setBookSeries } from './series';

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

export interface OrderSummary { id: string; name: string; total: number; read: number; authors: string[]; series: string[] }
export interface OrderItem {
  id: string; position: number; book_id: string | null; title: string; authors: string | null;
  series_id: string | null; series_name: string | null; series_position: number | null;
  is_read: boolean; cover: string | null; note: string | null;
}
export interface OrderDetail { id: string; name: string; series_id: string | null; author_id: string | null; items: OrderItem[] }

const IS_READ = "EXISTS (SELECT 1 FROM read r WHERE r.book_id = b.id AND r.status = 'finished' AND r.deleted_at IS NULL)";

export async function listOrders(db: Db): Promise<OrderSummary[]> {
  const heads = await db.select<{ id: string; name: string }>('SELECT id, name FROM reading_order WHERE deleted_at IS NULL');
  const out: OrderSummary[] = [];
  for (const h of heads) {
    const o = await getOrder(db, h.id);
    if (!o) continue;
    const uniq = (xs: (string | null)[]) => [...new Set(xs.flatMap((x) => (x ?? '').split(',')).map((x) => x.trim()).filter(Boolean))].sort(byTitle);
    out.push({ id: o.id, name: o.name, total: o.items.length, read: o.items.filter((i) => i.is_read).length, authors: uniq(o.items.map((i) => i.authors)), series: uniq(o.items.map((i) => i.series_name)) });
  }
  return out.sort((a, b) => byTitle(a.name, b.name));
}

export async function createOrder(db: Db, name: string, from: { seriesId?: string | null; authorId?: string | null } = {}): Promise<string> {
  const n = name.trim();
  if (!n) throw new Error('Give the reading order a name.');
  const id = newId();
  await db.execute('INSERT INTO reading_order (id, name, series_id, author_id) VALUES (?, ?, ?, ?)', [id, n, from.seriesId ?? null, from.authorId ?? null]);
  let books: { id: string }[] = [];
  if (from.seriesId) books = await db.select<{ id: string }>('SELECT id FROM book WHERE series_id = ? AND deleted_at IS NULL ORDER BY series_position IS NULL, series_position, rowid', [from.seriesId]);
  else if (from.authorId) {
    books = await db.select<{ id: string }>(
      `SELECT b.id AS id FROM book b JOIN book_author ba ON ba.book_id = b.id AND ba.deleted_at IS NULL LEFT JOIN series s ON s.id = b.series_id
       WHERE ba.author_id = ? AND b.deleted_at IS NULL
       ORDER BY s.id IS NULL, CASE WHEN lower(s.title) LIKE 'the %' THEN lower(substr(s.title, 5)) ELSE lower(s.title) END, b.series_position IS NULL, b.series_position, b.original_publication_date, b.rowid`, [from.authorId]);
  }
  for (const b of books) await addLibraryItem(db, id, b.id);
  return id;
}

export async function getOrder(db: Db, id: string): Promise<OrderDetail | null> {
  const [o] = await db.select<{ id: string; name: string; series_id: string | null; author_id: string | null }>('SELECT id, name, series_id, author_id FROM reading_order WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!o) return null;
  const rows = await db.select<{
    id: string; position: number; book_id: string | null; title: string; author_name: string | null; series_name: string | null; series_position: number | null; note: string | null;
    live: string | null; b_title: string | null; b_series_id: string | null; b_series: string | null; b_pos: number | null; b_authors: string | null; read: number | null; cover: string | null;
  }>(
    `SELECT i.id, i.position, i.book_id, i.title, i.author_name, i.series_name, i.series_position, i.note,
       b.id AS live, b.title AS b_title, b.series_id AS b_series_id, s.title AS b_series, b.series_position AS b_pos,
       (SELECT group_concat(a.name, ', ') FROM book_author ba JOIN author a ON a.id = ba.author_id WHERE ba.book_id = b.id AND ba.deleted_at IS NULL) AS b_authors,
       CASE WHEN b.id IS NULL THEN NULL ELSE ${IS_READ} END AS read, im.file_path AS cover
     FROM reading_order_item i
     LEFT JOIN book b ON b.id = i.book_id AND b.deleted_at IS NULL
     LEFT JOIN series s ON s.id = b.series_id AND s.deleted_at IS NULL
     LEFT JOIN image im ON im.id = b.cover_image_id AND im.deleted_at IS NULL
     WHERE i.order_id = ? AND i.deleted_at IS NULL ORDER BY i.position, i.rowid`, [id]);
  const items: OrderItem[] = rows.map((r) => r.live ? {
    id: r.id, position: r.position, book_id: r.live, title: r.b_title ?? r.title, authors: r.b_authors ?? r.author_name,
    series_id: r.b_series_id, series_name: r.b_series ?? null, series_position: r.b_pos, is_read: !!r.read, cover: r.cover, note: r.note,
  } : {
    id: r.id, position: r.position, book_id: null, title: r.title, authors: r.author_name, series_id: null, series_name: r.series_name,
    series_position: r.series_position, is_read: false, cover: null, note: r.note,
  });
  return { ...o, items };
}

export async function renameOrder(db: Db, id: string, name: string) {
  if (!name.trim()) throw new Error('A name cannot be empty.');
  await db.execute('UPDATE reading_order SET name = ? WHERE id = ?', [name.trim(), id]);
}
export async function deleteOrder(db: Db, id: string) {
  await db.execute(`UPDATE reading_order_item SET deleted_at = ${NOW} WHERE order_id = ? AND deleted_at IS NULL`, [id]);
  await db.execute(`UPDATE reading_order SET deleted_at = ${NOW} WHERE id = ?`, [id]);
}

const nextPosition = async (db: Db, orderId: string) =>
  Number((await db.select<{ n: number }>('SELECT COALESCE(max(position), -1) + 1 AS n FROM reading_order_item WHERE order_id = ? AND deleted_at IS NULL', [orderId]))[0].n);

// A book you already have.
export async function addLibraryItem(db: Db, orderId: string, bookId: string): Promise<string> {
  const dup = await db.select<{ id: string }>('SELECT id FROM reading_order_item WHERE order_id = ? AND book_id = ? AND deleted_at IS NULL', [orderId, bookId]);
  if (dup.length) throw new Error('That book is already in this reading order.');
  const [b] = await db.select<{ title: string; series: string | null; pos: number | null; authors: string | null }>(
    `SELECT b.title AS title, s.title AS series, b.series_position AS pos,
       (SELECT group_concat(a.name, ', ') FROM book_author ba JOIN author a ON a.id = ba.author_id WHERE ba.book_id = b.id AND ba.deleted_at IS NULL) AS authors
     FROM book b LEFT JOIN series s ON s.id = b.series_id WHERE b.id = ? AND b.deleted_at IS NULL`, [bookId]);
  if (!b) throw new Error('That book is not in the library any more.');
  const id = newId();
  await db.execute('INSERT INTO reading_order_item (id, order_id, position, book_id, title, author_name, series_name, series_position) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, orderId, await nextPosition(db, orderId), bookId, b.title, b.authors, b.series, b.pos]);
  return id;
}

export interface CustomItem { title: string; author?: string; series?: string; seriesPosition?: number | null; note?: string }
// A book that is not in the library (for planning, or a story that sits inside a collection).
export async function addCustomItem(db: Db, orderId: string, i: CustomItem): Promise<string> {
  const title = i.title.trim();
  if (!title) throw new Error('Type the title first.');
  const id = newId();
  await db.execute('INSERT INTO reading_order_item (id, order_id, position, title, author_name, series_name, series_position, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, orderId, await nextPosition(db, orderId), title, i.author?.trim() || null, i.series?.trim() || null, i.seriesPosition ?? null, i.note?.trim() || null]);
  return id;
}

export async function updateItemNote(db: Db, itemId: string, note: string) {
  await db.execute('UPDATE reading_order_item SET note = ? WHERE id = ?', [note.trim() || null, itemId]);
}
export async function removeItem(db: Db, orderId: string, itemId: string) {
  await db.execute(`UPDATE reading_order_item SET deleted_at = ${NOW} WHERE id = ?`, [itemId]);
  await renumber(db, orderId);
}
async function renumber(db: Db, orderId: string) {
  const ids = await db.select<{ id: string }>('SELECT id FROM reading_order_item WHERE order_id = ? AND deleted_at IS NULL ORDER BY position, rowid', [orderId]);
  for (let i = 0; i < ids.length; i++) await db.execute('UPDATE reading_order_item SET position = ? WHERE id = ?', [i, ids[i].id]);
}
// Moves one line to a new place in the list (0 is first).
export async function moveItem(db: Db, orderId: string, itemId: string, toIndex: number) {
  const ids = (await db.select<{ id: string }>('SELECT id FROM reading_order_item WHERE order_id = ? AND deleted_at IS NULL ORDER BY position, rowid', [orderId])).map((r) => r.id);
  const from = ids.indexOf(itemId);
  if (from < 0) return;
  ids.splice(from, 1);
  ids.splice(Math.max(0, Math.min(toIndex, ids.length)), 0, itemId);
  for (let i = 0; i < ids.length; i++) await db.execute('UPDATE reading_order_item SET position = ? WHERE id = ?', [i, ids[i]]);
}

export interface NewLibraryBook { title: string; author: string; series: string; position: number | null; cover?: { dataUrl: string; width?: number; height?: number; mime?: string } | null }
// Puts a line that is not in the library into the library (on the TBR) and links the line to it.
export async function addItemToLibrary(db: Db, itemId: string, input: NewLibraryBook): Promise<string> {
  const [item] = await db.select<{ id: string; book_id: string | null }>('SELECT id, book_id FROM reading_order_item WHERE id = ? AND deleted_at IS NULL', [itemId]);
  if (!item) throw new Error('That line has been removed.');
  if (item.book_id) throw new Error('That book is already in the library.');
  const title = input.title.trim();
  if (!title) throw new Error('A book needs a title.');
  // A typed name that is clearly an author or series you already have (AJ Sherwood / A.J. Sherwood) uses the existing one.
  const knownAuthors = (await db.select<{ name: string }>('SELECT name FROM author WHERE deleted_at IS NULL')).map((r) => r.name);
  const authors = [...new Set(input.author.split(',').map((a) => a.trim()).filter(Boolean).map((a) => bestMatch(knownAuthors, a) ?? a))];
  const knownSeries = (await db.select<{ title: string }>('SELECT title FROM series WHERE deleted_at IS NULL')).map((r) => r.title);
  input = { ...input, series: bestMatch(knownSeries, input.series) ?? input.series };
  const bookId = await createBook(db, { title, authors, shelf: 'tbr' });
  if (input.series.trim()) await setBookSeries(db, bookId, await createSeries(db, input.series, { authors }), input.position);
  if (input.cover) await setBookCover(db, bookId, input.cover);
  await db.execute('UPDATE reading_order_item SET book_id = ?, title = ?, author_name = ?, series_name = ?, series_position = ? WHERE id = ?',
    [bookId, title, authors.join(', ') || null, input.series.trim() || null, input.position, itemId]);
  return bookId;
}

export async function searchLibraryBooks(db: Db, q: string): Promise<{ id: string; title: string; authors: string | null }[]> {
  const t = q.trim();
  if (!t) return [];
  const like = `%${t.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rows = await db.select<{ id: string; title: string; authors: string | null }>(
    `SELECT b.id AS id, b.title AS title, (SELECT group_concat(a.name, ', ') FROM book_author ba JOIN author a ON a.id = ba.author_id WHERE ba.book_id = b.id AND ba.deleted_at IS NULL) AS authors
     FROM book b WHERE b.deleted_at IS NULL AND b.title LIKE ? ESCAPE '\\' LIMIT 40`, [like]);
  return rows.sort((a, b) => byTitle(a.title, b.title)).slice(0, 8);
}

// Links a line that is not in the library to a book you already have (for example one you added on your own).
export async function linkItemToBook(db: Db, itemId: string, bookId: string): Promise<void> {
  const [item] = await db.select<{ id: string; order_id: string; book_id: string | null }>('SELECT id, order_id, book_id FROM reading_order_item WHERE id = ? AND deleted_at IS NULL', [itemId]);
  if (!item) throw new Error('That line has been removed.');
  if (item.book_id) throw new Error('That line is already linked to a book.');
  const dup = await db.select<{ id: string }>('SELECT id FROM reading_order_item WHERE order_id = ? AND book_id = ? AND deleted_at IS NULL', [item.order_id, bookId]);
  if (dup.length) throw new Error('That book is already in this reading order.');
  const [b] = await db.select<{ title: string; series: string | null; pos: number | null; authors: string | null }>(
    `SELECT b.title AS title, s.title AS series, b.series_position AS pos,
       (SELECT group_concat(a.name, ', ') FROM book_author ba JOIN author a ON a.id = ba.author_id WHERE ba.book_id = b.id AND ba.deleted_at IS NULL) AS authors
     FROM book b LEFT JOIN series s ON s.id = b.series_id WHERE b.id = ? AND b.deleted_at IS NULL`, [bookId]);
  if (!b) throw new Error('That book is not in the library any more.');
  await db.execute('UPDATE reading_order_item SET book_id = ?, title = ?, author_name = ?, series_name = ?, series_position = ? WHERE id = ?', [bookId, b.title, b.authors, b.series, b.pos, itemId]);
}

// Adds every book of a series, in series order, to the end of the list. Books already on the list are skipped. Returns how many were added.
export async function addSeriesToOrder(db: Db, orderId: string, seriesId: string): Promise<number> {
  const books = await db.select<{ id: string }>('SELECT id FROM book WHERE series_id = ? AND deleted_at IS NULL ORDER BY series_position IS NULL, series_position, rowid', [seriesId]);
  if (!books.length) throw new Error('That series has no books yet.');
  let added = 0;
  for (const b of books) {
    if ((await db.select<{ id: string }>('SELECT id FROM reading_order_item WHERE order_id = ? AND book_id = ? AND deleted_at IS NULL', [orderId, b.id])).length) continue;
    await addLibraryItem(db, orderId, b.id); added++;
  }
  if (!added) throw new Error('All of that series is already on this list.');
  return added;
}

// Changes the details of a line that is not in the library.
export async function updateCustomItem(db: Db, itemId: string, i: CustomItem): Promise<void> {
  const title = i.title.trim();
  if (!title) throw new Error('A title cannot be empty.');
  const [item] = await db.select<{ book_id: string | null }>('SELECT book_id FROM reading_order_item WHERE id = ? AND deleted_at IS NULL', [itemId]);
  if (!item) throw new Error('That line has been removed.');
  if (item.book_id) throw new Error('Change a library book from its own page.');
  await db.execute('UPDATE reading_order_item SET title = ?, author_name = ?, series_name = ?, series_position = ? WHERE id = ?',
    [title, i.author?.trim() || null, i.series?.trim() || null, i.seriesPosition ?? null, itemId]);
}

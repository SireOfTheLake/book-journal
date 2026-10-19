import type { Db } from '../db/adapter';
import { dropPlannedReads, ensurePlannedRead, quickAdd, setStatus } from './bookLog';

export type Shelf = 'tbr' | 'up_next';
// 'next' means the earlier books in the series are done, so this one is next; 'waiting' means an earlier book is still unread.
export type SeriesState = 'next' | 'waiting' | null;
export interface ShelfBook {
  id: string; title: string; authors: string | null; series: string | null; series_id: string | null; position: number | null;
  shelf: Shelf; priority: number | null; page_count: number | null; has_cover: number; added: string;
  own_physical: number; own_ebook: number; own_audio: number;
  series_state: SeriesState; release: 'tba' | string | null; // an upcoming release date, or 'tba'
  released: string | null; // the date it came out, when that was in the last 30 days and nothing else is still to come
}


// Everything on the Up Next and TBR shelves, each in your priority order.
export const listShelf = (db: Db) => db.select<ShelfBook>(
  `SELECT b.id AS id, b.title AS title, b.series_id AS series_id, b.series_position AS position, b.shelf AS shelf, b.tbr_priority AS priority, b.own_physical AS own_physical, b.own_ebook AS own_ebook, b.own_audio AS own_audio, b.page_count AS page_count, b.created_at AS added,
     (SELECT s.title FROM series s WHERE s.id = b.series_id) AS series,
     (SELECT group_concat(x.name, ', ') FROM (SELECT au.name AS name FROM book_author ba JOIN author au ON au.id = ba.author_id WHERE ba.book_id = b.id AND ba.deleted_at IS NULL AND au.deleted_at IS NULL ORDER BY ba.sort_order) x) AS authors,
     EXISTS (SELECT 1 FROM image i WHERE i.id = b.cover_image_id AND i.deleted_at IS NULL) AS has_cover,
     CASE WHEN b.series_id IS NULL OR b.series_position IS NULL THEN NULL
       WHEN EXISTS (SELECT 1 FROM book e WHERE e.series_id = b.series_id AND e.deleted_at IS NULL AND e.series_position < b.series_position AND e.series_position >= 1
                    AND NOT EXISTS (SELECT 1 FROM read r WHERE r.book_id = e.id AND r.status = 'finished' AND r.deleted_at IS NULL)) THEN 'waiting'
       WHEN EXISTS (SELECT 1 FROM book e WHERE e.series_id = b.series_id AND e.deleted_at IS NULL AND e.series_position < b.series_position AND e.series_position >= 1) THEN 'next'
       ELSE NULL END AS series_state,
     (SELECT CASE WHEN f.status = 'tba' THEN 'tba' ELSE f.release_date END FROM format_release f WHERE f.book_id = b.id AND f.deleted_at IS NULL AND (f.status = 'tba' OR f.release_date > date('now')) ORDER BY f.status = 'tba', f.release_date LIMIT 1) AS release,
     (SELECT MAX(f.release_date) FROM format_release f WHERE f.book_id = b.id AND f.deleted_at IS NULL AND f.status = 'dated' AND f.release_date <= date('now') AND f.release_date >= date('now', '-30 days')
        AND NOT EXISTS (SELECT 1 FROM format_release g WHERE g.book_id = b.id AND g.deleted_at IS NULL AND (g.status = 'tba' OR g.release_date > date('now')))) AS released
   FROM book b WHERE b.deleted_at IS NULL AND b.shelf IS NOT NULL
   ORDER BY b.shelf = 'tbr', b.tbr_priority IS NULL, b.tbr_priority, b.rowid`);

async function orderOf(db: Db, shelf: Shelf): Promise<string[]> {
  const rows = await db.select<{ id: string }>('SELECT id FROM book WHERE shelf = ? AND deleted_at IS NULL ORDER BY tbr_priority IS NULL, tbr_priority, rowid', [shelf]);
  return rows.map((r) => r.id);
}

// Priorities are kept as 1, 2, 3... with Up Next first and TBR after it, so the order is always clear.
async function save(db: Db, upNext: string[], tbr: string[]) {
  let n = 0;
  for (const id of [...upNext, ...tbr]) await db.execute('UPDATE book SET tbr_priority = ? WHERE id = ?', [++n, id]);
}

export async function tidyShelf(db: Db) { await save(db, await orderOf(db, 'up_next'), await orderOf(db, 'tbr')); }

export type Move = 'up' | 'down' | 'top' | 'bottom';
export async function moveOnShelf(db: Db, bookId: string, move: Move) {
  const [b] = await db.select<{ shelf: Shelf | null }>('SELECT shelf FROM book WHERE id = ? AND deleted_at IS NULL', [bookId]);
  if (!b?.shelf) return;
  const upNext = await orderOf(db, 'up_next'), tbr = await orderOf(db, 'tbr');
  const list = b.shelf === 'up_next' ? upNext : tbr;
  const i = list.indexOf(bookId);
  list.splice(i, 1);
  const to = move === 'top' ? 0 : move === 'bottom' ? list.length : move === 'up' ? Math.max(0, i - 1) : Math.min(list.length, i + 1);
  list.splice(to, 0, bookId);
  await save(db, upNext, tbr);
}

// Up Next goes to the end of that shelf; TBR goes to the top of it, so a book you set aside is easy to find again.
export async function moveToShelf(db: Db, bookId: string, shelf: Shelf) {
  const upNext = (await orderOf(db, 'up_next')).filter((x) => x !== bookId);
  const tbr = (await orderOf(db, 'tbr')).filter((x) => x !== bookId);
  if (shelf === 'up_next') upNext.push(bookId); else tbr.unshift(bookId);
  await db.execute('UPDATE book SET shelf = ? WHERE id = ?', [shelf, bookId]);
  await save(db, upNext, tbr);
  if (shelf === 'up_next') await ensurePlannedRead(db, bookId); else await dropPlannedReads(db, bookId);
}

// The book stays in your library as "Not started".
export async function removeFromShelf(db: Db, bookId: string) {
  await db.execute('UPDATE book SET shelf = NULL, tbr_priority = NULL WHERE id = ?', [bookId]);
  await dropPlannedReads(db, bookId);
  await tidyShelf(db);
}

// Starts the book: it leaves the shelf and a new read is opened.
export async function startFromShelf(db: Db, bookId: string): Promise<string | null> {
  const id = await setStatus(db, bookId, null, 'reading');
  await tidyShelf(db);
  return id;
}

export async function addToShelf(db: Db, input: { title: string; authors: string[]; shelf: Shelf }): Promise<string> {
  const { bookId } = await quickAdd(db, { title: input.title, authors: input.authors, status: input.shelf });
  await tidyShelf(db);
  return bookId;
}

// Puts a book you already have on a shelf (used from a book's page or the library).
export async function putOnShelf(db: Db, bookId: string, shelf: Shelf) {
  await setStatus(db, bookId, null, shelf);
  await moveToShelf(db, bookId, shelf);
}

export type OwnFilter = 'all' | 'own' | 'want';
export type FormatFilter = 'any' | 'physical' | 'ebook' | 'audio';
const OWN_COL = { physical: 'own_physical', ebook: 'own_ebook', audio: 'own_audio' } as const;
// With a format chosen, "own" means you have that format; with none, any format counts. "want" is the opposite: no copy (of that format) yet.
export function ownsBook(b: Pick<ShelfBook, 'own_physical' | 'own_ebook' | 'own_audio'>, format: FormatFilter): boolean {
  return format === 'any' ? !!(b.own_physical || b.own_ebook || b.own_audio) : !!b[OWN_COL[format]];
}
export function filterByOwnership<T extends Pick<ShelfBook, 'own_physical' | 'own_ebook' | 'own_audio'>>(books: T[], own: OwnFilter, format: FormatFilter): T[] {
  if (own === 'all') return books;
  return books.filter((b) => ownsBook(b, format) === (own === 'own'));
}

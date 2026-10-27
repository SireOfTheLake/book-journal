import type { Db } from '../db/adapter';
import { buildPool, type LibBook, type RandomPool } from '../domain/randomBook';
import { moveToShelf } from './shelf';

// Every book that matters to the random book options: books on the TBR shelf, and every book that belongs to a series (to know how far you are in it).
export async function loadRandomPool(db: Db): Promise<RandomPool> {
  const rows = await db.select<{ id: string; title: string; authors: string | null; series_id: string | null; series: string | null; position: number | null; shelf: string | null; read: number; unreleased: number }>(
    `SELECT b.id AS id, b.title AS title, b.series_id AS series_id, b.series_position AS position, b.shelf AS shelf,
       (SELECT s.title FROM series s WHERE s.id = b.series_id) AS series,
       (SELECT group_concat(x.name, ', ') FROM (SELECT au.name AS name FROM book_author ba JOIN author au ON au.id = ba.author_id WHERE ba.book_id = b.id AND ba.deleted_at IS NULL AND au.deleted_at IS NULL ORDER BY ba.sort_order) x) AS authors,
       EXISTS (SELECT 1 FROM read r WHERE r.book_id = b.id AND r.deleted_at IS NULL AND r.status IN ('finished', 'reading')) AS read,
       COALESCE((SELECT v.is_unreleased FROM v_book_release v WHERE v.book_id = b.id), 0) AS unreleased
     FROM book b WHERE b.deleted_at IS NULL AND b.is_draft = 0 AND (b.series_id IS NOT NULL OR b.shelf = 'tbr')
     ORDER BY b.tbr_priority IS NULL, b.tbr_priority, b.created_at, b.rowid`);
  const books: LibBook[] = rows.map((r) => ({ id: r.id, title: r.title, authors: r.authors, series_id: r.series_id, series: r.series, position: r.position, shelf: r.shelf === 'tbr' || r.shelf === 'up_next' ? r.shelf : null, read: !!r.read, unreleased: !!r.unreleased }));
  return buildPool(books);
}

// The books go to the end of Up Next, in the order given (a series in series order).
export async function addToUpNext(db: Db, bookIds: string[]): Promise<void> {
  for (const id of bookIds) await moveToShelf(db, id, 'up_next');
}

import type { Db } from '../db/adapter';

export type LibraryStatus = 'tbr' | 'up_next' | 'reading' | 'finished' | 'on_hold' | 'dnf';
export interface LibraryBook {
  id: string; title: string; authors: string | null; series: string | null; series_id: string | null; position: number | null;
  status: LibraryStatus | null; // where the book is now: a shelf, or the state of its latest read
  finish_date: string | null; rating: number | null; is_favorite: number; has_cover: number; placeholder_permanent?: number; read_id: string | null; added: string;
  format: 'physical' | 'audio' | 'ebook' | null; narrators: string | null; characters: string | null;
}

// Every book you have added, without the cover pictures (those are loaded separately, a page at a time).
export const listLibrary = (db: Db) => db.select<LibraryBook>(
  `SELECT b.id AS id, b.title AS title, b.series_id AS series_id, b.series_position AS position, b.is_favorite AS is_favorite, b.created_at AS added,
     (SELECT s.title FROM series s WHERE s.id = b.series_id) AS series,
     (SELECT group_concat(x.name, ', ') FROM (SELECT au.name AS name FROM book_author ba JOIN author au ON au.id = ba.author_id WHERE ba.book_id = b.id AND ba.deleted_at IS NULL AND au.deleted_at IS NULL ORDER BY ba.sort_order) x) AS authors,
     COALESCE(b.shelf, (SELECT r.status FROM read r WHERE r.book_id = b.id AND r.deleted_at IS NULL ORDER BY r.created_at DESC, r.rowid DESC LIMIT 1)) AS status,
     (SELECT r.finish_date FROM read r WHERE r.book_id = b.id AND r.status = 'finished' AND r.deleted_at IS NULL ORDER BY r.finish_date DESC LIMIT 1) AS finish_date,
     (SELECT v.avg_stars FROM v_book_rating v WHERE v.book_id = b.id) AS rating,
     EXISTS (SELECT 1 FROM image i WHERE i.id = b.cover_image_id AND i.deleted_at IS NULL) AS has_cover, b.placeholder_permanent AS placeholder_permanent,
     (SELECT r.id FROM read r WHERE r.book_id = b.id AND r.deleted_at IS NULL ORDER BY r.created_at DESC, r.rowid DESC LIMIT 1) AS read_id,
     (SELECT r.format FROM read r WHERE r.book_id = b.id AND r.deleted_at IS NULL ORDER BY r.created_at DESC, r.rowid DESC LIMIT 1) AS format,
     (SELECT group_concat(x.name, ', ') FROM (SELECT DISTINCT n.name AS name FROM read_narrator rn JOIN read r ON r.id = rn.read_id JOIN narrator n ON n.id = rn.narrator_id
        WHERE r.book_id = b.id AND rn.deleted_at IS NULL AND r.deleted_at IS NULL AND n.deleted_at IS NULL) x) AS narrators,
     (SELECT group_concat(x.name, ', ') FROM (SELECT c.name AS name FROM book_character bc JOIN character c ON c.id = bc.character_id WHERE bc.book_id = b.id AND bc.deleted_at IS NULL AND c.deleted_at IS NULL) x) AS characters
   FROM book b WHERE b.deleted_at IS NULL ORDER BY CASE WHEN lower(b.title) LIKE \'the %\' THEN lower(substr(b.title, 5)) ELSE lower(b.title) END`);

// The cover pictures for some books, as { bookId: picture }.
export async function getCovers(db: Db, bookIds: string[]): Promise<Record<string, string>> {
  if (!bookIds.length) return {};
  const rows = await db.select<{ id: string; cover: string }>(
    `SELECT b.id AS id, i.file_path AS cover FROM book b JOIN image i ON i.id = b.cover_image_id AND i.deleted_at IS NULL WHERE b.id IN (${bookIds.map(() => '?').join(',')})`, bookIds);
  return Object.fromEntries(rows.map((r) => [r.id, r.cover]));
}

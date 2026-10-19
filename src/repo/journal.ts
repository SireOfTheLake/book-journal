import type { Db } from '../db/adapter';

export interface ListRow {
  book_id: string;
  read_id: string | null;
  title: string;
  authors: string | null;
  narrators: string | null;
  series: string | null;
  characters: string | null;
  status: 'reading' | 'finished' | 'on_hold' | 'dnf' | null;
  start_date: string | null;
  finish_date: string | null;
  format: 'physical' | 'audio' | 'ebook' | null;
  rating: number | null;
  year_number: number | null;
}

export interface JournalYear {
  finished: ListRow[]; // newest first
  reading: ListRow[]; // in progress or paused, any year
  upNext: ListRow[]; // the Up Next queue, in order
}

const PEOPLE = `
  (SELECT group_concat(x.name, ', ') FROM (SELECT au.name AS name FROM book_author ba JOIN author au ON au.id = ba.author_id
     WHERE ba.book_id = b.id AND ba.deleted_at IS NULL AND au.deleted_at IS NULL ORDER BY ba.sort_order) x) AS authors,
  (SELECT s.title FROM series s WHERE s.id = b.series_id) AS series,
  (SELECT group_concat(x.name, ', ') FROM (SELECT c.name AS name FROM book_character bc JOIN character c ON c.id = bc.character_id
     WHERE bc.book_id = b.id AND bc.role = 'main' AND bc.deleted_at IS NULL AND c.deleted_at IS NULL ORDER BY bc.sort_order) x) AS characters`;

const READ_SELECT = `
  SELECT b.id AS book_id, r.id AS read_id, b.title, r.status, r.start_date, r.finish_date, r.format, r.rating, n.year_number,
  (SELECT group_concat(x.name, ', ') FROM (SELECT nr.name AS name FROM read_narrator rn JOIN narrator nr ON nr.id = rn.narrator_id
     WHERE rn.read_id = r.id AND rn.deleted_at IS NULL ORDER BY rn.sort_order) x) AS narrators,
  ${PEOPLE}
  FROM read r JOIN book b ON b.id = r.book_id LEFT JOIN v_read_year_number n ON n.read_id = r.id`;

export async function listJournalYear(db: Db, year: number): Promise<JournalYear> {
  const finished = await db.select<ListRow>(
    `${READ_SELECT}
     WHERE r.deleted_at IS NULL AND b.deleted_at IS NULL AND r.status = 'finished' AND substr(r.finish_date, 1, 4) = ?
     ORDER BY r.finish_date DESC, COALESCE(r.finish_time, '') DESC, r.rowid DESC`, [String(year)]);
  const reading = await db.select<ListRow>(
    `${READ_SELECT}
     WHERE r.deleted_at IS NULL AND b.deleted_at IS NULL AND r.status IN ('reading', 'on_hold') AND b.shelf IS NULL
     ORDER BY r.start_date DESC, r.rowid DESC`);
  const upNext = await db.select<ListRow>(
    `SELECT b.id AS book_id, NULL AS read_id, b.title, NULL AS status, NULL AS start_date, NULL AS finish_date, NULL AS format, NULL AS rating, NULL AS year_number,
       NULL AS narrators, ${PEOPLE}
     FROM book b WHERE b.deleted_at IS NULL AND b.shelf = 'up_next' ORDER BY b.tbr_priority, b.rowid`);
  return { finished, reading, upNext };
}

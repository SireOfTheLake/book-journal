import type { Db } from '../db/adapter';
import { progressOf } from '../domain/progress';

// Small queries for the phone's lists. Covers are passed as an image id; the picture itself comes from the phone's cover storage.
const AUTHORS = `(SELECT group_concat(x.name, ', ') FROM (SELECT au.name AS name FROM book_author ba JOIN author au ON au.id = ba.author_id WHERE ba.book_id = b.id AND ba.deleted_at IS NULL AND au.deleted_at IS NULL ORDER BY ba.sort_order) x) AS authors`;
const TITLE_SORT = `CASE WHEN lower(b.title) LIKE 'the %' THEN lower(substr(b.title, 5)) ELSE lower(b.title) END`;

export interface PhoneBook { id: string; title: string; authors: string | null; cover_image_id: string | null }
export interface ReadingNow extends PhoneBook { read_id: string; status: 'reading' | 'on_hold'; progress: number | null; where: string }
export interface RecentBook extends PhoneBook { label: string }

export const STATUS_LABEL: Record<string, string> = { tbr: 'TBR', up_next: 'Up Next', reading: 'Reading', finished: 'Read', on_hold: 'Paused', dnf: 'DNF' };

export async function readingNow(db: Db): Promise<ReadingNow[]> {
  const raw = await db.select<PhoneBook & { read_id: string; status: 'reading' | 'on_hold'; format: 'physical' | 'audio' | 'ebook' | null; page_count: number | null; audio_length_seconds: number | null }>(
    `SELECT b.id AS id, b.title AS title, b.cover_image_id AS cover_image_id, ${AUTHORS}, r.id AS read_id, r.status AS status, r.format AS format, b.page_count AS page_count, r.audio_length_seconds AS audio_length_seconds
     FROM read r JOIN book b ON b.id = r.book_id
     WHERE r.deleted_at IS NULL AND b.deleted_at IS NULL AND r.status IN ('reading', 'on_hold') AND b.shelf IS NULL
     ORDER BY r.status = 'on_hold', r.start_date DESC, r.created_at DESC, r.rowid DESC`);
  const out: ReadingNow[] = [];
  for (const r of raw) {
    const [last] = await db.select<{ entry_date: string; page: number | null; percent: number | null; seconds: number | null }>(
      'SELECT entry_date, position_page AS page, position_percent AS percent, position_seconds AS seconds FROM day_entry WHERE read_id = ? AND deleted_at IS NULL ORDER BY entry_date DESC, created_at DESC, rowid DESC LIMIT 1', [r.read_id]);
    const progress = progressOf(last ? { page: last.page, percent: last.percent, seconds: last.seconds } : null, { format: r.format, pageCount: r.page_count, audioSeconds: r.audio_length_seconds });
    const where = r.status === 'on_hold' ? 'Paused' : last?.page ? `Page ${last.page}${r.page_count ? ` of ${r.page_count}` : ''}` : last?.percent ? `${Math.round(last.percent)}%` : r.format === 'audio' ? 'Audio' : 'Just started';
    out.push({ id: r.id, title: r.title, authors: r.authors, cover_image_id: r.cover_image_id, read_id: r.read_id, status: r.status, progress, where });
  }
  return out;
}

export const upNextBooks = (db: Db) => db.select<PhoneBook>(
  `SELECT b.id AS id, b.title AS title, b.cover_image_id AS cover_image_id, ${AUTHORS} FROM book b WHERE b.deleted_at IS NULL AND b.shelf = 'up_next' ORDER BY b.tbr_priority, b.created_at, b.rowid`);

/** The books whose log, reads or character links were changed most recently, on any device. */
export async function recentlyEdited(db: Db, limit = 8): Promise<RecentBook[]> {
  const rows = await db.select<PhoneBook & { shelf: string | null; status: string | null }>(
    `SELECT b.id AS id, b.title AS title, b.cover_image_id AS cover_image_id, ${AUTHORS}, b.shelf AS shelf,
       (SELECT r.status FROM read r WHERE r.book_id = b.id AND r.deleted_at IS NULL ORDER BY COALESCE(r.finish_date, '9999') DESC, r.created_at DESC, r.rowid DESC LIMIT 1) AS status
     FROM book b WHERE b.deleted_at IS NULL AND b.is_draft = 0
     ORDER BY MAX(b.updated_at, COALESCE((SELECT max(r.updated_at) FROM read r WHERE r.book_id = b.id), '')) DESC LIMIT ?`, [limit]);
  return rows.map((r) => ({ id: r.id, title: r.title, authors: r.authors, cover_image_id: r.cover_image_id, label: STATUS_LABEL[r.shelf ?? r.status ?? ''] ?? '' }));
}

export interface PersonRow { id: string; name: string; sub: string }
export async function listPeople(db: Db): Promise<PersonRow[]> {
  const rows = await db.select<{ id: string; name: string; titles: string | null }>(
    `SELECT c.id AS id, c.name AS name,
       (SELECT group_concat(x.title, ' · ') FROM (SELECT b.title AS title FROM book_character bc JOIN book b ON b.id = bc.book_id WHERE bc.character_id = c.id AND bc.deleted_at IS NULL AND b.deleted_at IS NULL ORDER BY bc.role, b.title LIMIT 3) x) AS titles
     FROM character c WHERE c.deleted_at IS NULL ORDER BY CASE WHEN lower(c.name) LIKE 'the %' THEN lower(substr(c.name, 5)) ELSE lower(c.name) END`);
  return rows.map((r) => ({ id: r.id, name: r.name, sub: r.titles ?? '' }));
}
export { TITLE_SORT };

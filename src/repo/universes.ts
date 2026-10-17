import type { Db } from '../db/adapter';
import { newId } from '../domain/ids';
import { listSeriesLedger, type LedgerRow } from './series';

// A book belongs to a universe through its series, or on its own. A book's own universe wins,
// so one book of a big shared series can sit in a universe while the others do not.
const EFFECTIVE = 'COALESCE(b.universe_id, s.universe_id)';
const FROM_BOOKS = `FROM book b LEFT JOIN series s ON s.id = b.series_id AND s.deleted_at IS NULL WHERE b.deleted_at IS NULL`;
const FINISHED = `EXISTS (SELECT 1 FROM read r WHERE r.book_id = b.id AND r.status = 'finished' AND r.deleted_at IS NULL)`;
const AUTHORS = `(SELECT group_concat(x.name, ', ') FROM (SELECT au.name AS name FROM book_author ba JOIN author au ON au.id = ba.author_id WHERE ba.book_id = b.id AND ba.deleted_at IS NULL AND au.deleted_at IS NULL ORDER BY ba.sort_order) x)`;

export interface UniverseRow { id: string; name: string; color: string | null; series: number; books: number; read: number; authors: number }

export async function listUniverseRows(db: Db): Promise<UniverseRow[]> {
  const unis = await db.select<{ id: string; name: string; color: string | null }>('SELECT id, name, color FROM universe WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE');
  const rows: UniverseRow[] = [];
  for (const u of unis) {
    const [{ n: series }] = await db.select<{ n: number }>('SELECT count(*) AS n FROM series WHERE universe_id = ? AND deleted_at IS NULL', [u.id]);
    const [c] = await db.select<{ books: number; read: number }>(`SELECT count(*) AS books, coalesce(sum(${FINISHED}), 0) AS read ${FROM_BOOKS} AND ${EFFECTIVE} = ?`, [u.id]);
    const [{ n: authors }] = await db.select<{ n: number }>(
      `SELECT count(DISTINCT ba.author_id) AS n FROM book b LEFT JOIN series s ON s.id = b.series_id AND s.deleted_at IS NULL
         JOIN book_author ba ON ba.book_id = b.id AND ba.deleted_at IS NULL WHERE b.deleted_at IS NULL AND ${EFFECTIVE} = ?`, [u.id]);
    rows.push({ ...u, series: Number(series), books: Number(c.books), read: Number(c.read), authors: Number(authors) });
  }
  return rows;
}

export interface UniverseBook { id: string; title: string; authors: string | null; series: string | null; position: number | null; read: boolean; rating: number | null; cover: string | null }
export interface UniversePage {
  universe: { id: string; name: string; color: string | null; notes: string | null };
  series: LedgerRow[];
  books: UniverseBook[]; // books placed in the universe on their own, not through one of its series
  authors: { id: string; name: string; books: number }[];
  totals: { books: number; read: number; avgStars: number | null; rated: number };
}

export async function getUniversePage(db: Db, universeId: string): Promise<UniversePage | null> {
  const [universe] = await db.select<UniversePage['universe']>('SELECT id, name, color, notes FROM universe WHERE id = ? AND deleted_at IS NULL', [universeId]);
  if (!universe) return null;
  const series = (await listSeriesLedger(db)).filter((r) => r.universe_id === universeId);
  const books = await db.select<Omit<UniverseBook, 'read' | 'cover'> & { read: number; cover: string | null }>(
    `SELECT b.id AS id, b.title AS title, ${AUTHORS} AS authors, s.title AS series, b.series_position AS position, ${FINISHED} AS read,
       (SELECT v.avg_stars FROM v_book_rating v WHERE v.book_id = b.id) AS rating,
       (SELECT i.file_path FROM image i WHERE i.id = b.cover_image_id AND i.deleted_at IS NULL) AS cover
     ${FROM_BOOKS} AND b.universe_id = ? AND (b.series_id IS NULL OR s.universe_id IS NOT ?) ORDER BY lower(b.title)`, [universeId, universeId]);
  const authors = await db.select<{ id: string; name: string; books: number }>(
    `SELECT au.id AS id, au.name AS name, count(DISTINCT b.id) AS books FROM book b LEFT JOIN series s ON s.id = b.series_id AND s.deleted_at IS NULL
       JOIN book_author ba ON ba.book_id = b.id AND ba.deleted_at IS NULL JOIN author au ON au.id = ba.author_id AND au.deleted_at IS NULL
     WHERE b.deleted_at IS NULL AND ${EFFECTIVE} = ? GROUP BY au.id ORDER BY books DESC, au.name COLLATE NOCASE`, [universeId]);
  const [t] = await db.select<{ books: number; read: number; avg: number | null; rated: number }>(
    `SELECT count(*) AS books, coalesce(sum(${FINISHED}), 0) AS read,
       avg((SELECT v.avg_stars FROM v_book_rating v WHERE v.book_id = b.id)) AS avg,
       count((SELECT v.avg_stars FROM v_book_rating v WHERE v.book_id = b.id)) AS rated ${FROM_BOOKS} AND ${EFFECTIVE} = ?`, [universeId]);
  return {
    universe, series,
    books: books.map((b) => ({ ...b, read: Number(b.read) === 1 })),
    authors: authors.map((a) => ({ ...a, books: Number(a.books) })),
    totals: { books: Number(t.books), read: Number(t.read), avgStars: t.avg, rated: Number(t.rated) },
  };
}

const UNIVERSE_COLS = new Set(['name', 'color', 'notes']);
export async function updateUniverse(db: Db, id: string, fields: Record<string, string | null>) {
  const keys = Object.keys(fields);
  if (keys.some((k) => !UNIVERSE_COLS.has(k))) throw new Error('That universe field cannot be changed.');
  if (!keys.length) return;
  if ('name' in fields) {
    const name = (fields.name ?? '').trim();
    if (!name) return;
    const dupe = await db.select<{ id: string }>('SELECT id FROM universe WHERE lower(name) = lower(?) AND id <> ? AND deleted_at IS NULL', [name, id]);
    if (dupe.length) throw new Error(`A universe called "${name}" already exists.`);
    fields = { ...fields, name };
  }
  await db.execute(`UPDATE universe SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => fields[k]), id]);
}

// Deleting a universe only removes the grouping. Series and books stay.
export async function deleteUniverse(db: Db, id: string) {
  await db.execute('UPDATE series SET universe_id = NULL WHERE universe_id = ?', [id]);
  await db.execute('UPDATE book SET universe_id = NULL WHERE universe_id = ?', [id]);
  await db.execute("UPDATE universe SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?", [id]);
}

export async function createUniverseNamed(db: Db, name: string): Promise<string> {
  const n = name.trim();
  const [existing] = await db.select<{ id: string }>('SELECT id FROM universe WHERE lower(name) = lower(?) AND deleted_at IS NULL', [n]);
  if (existing) return existing.id;
  const id = newId();
  await db.execute('INSERT INTO universe (id, name) VALUES (?, ?)', [id, n]);
  return id;
}

// The universe of one book on its own (null takes it out). A series' universe is set on the series.
export const setBookUniverse = (db: Db, bookId: string, universeId: string | null) =>
  db.execute('UPDATE book SET universe_id = ? WHERE id = ?', [universeId, bookId]);

export const setSeriesUniverse = (db: Db, seriesId: string, universeId: string | null) =>
  db.execute('UPDATE series SET universe_id = ? WHERE id = ?', [universeId, seriesId]);

import type { Db } from '../db/adapter';
import { FMTS, type Fmt } from '../domain/releases';
import { addToShelf } from './shelf';
import { setFormatRelease } from './series';

export interface FormatDate { status: 'dated' | 'tba' | 'not_planned'; date: string | null }
export interface ReleaseBook {
  id: string; title: string; authors: string | null; series: string | null; series_id: string | null; position: number | null;
  shelf: 'tbr' | 'up_next' | null; read: boolean; // read = you have finished it before
  formats: Partial<Record<Fmt, FormatDate>>;
  next: string | null; // the soonest date that is today or later, null when every unreleased format is TBA
}

interface Row { id: string; title: string; authors: string | null; series: string | null; series_id: string | null; position: number | null; shelf: 'tbr' | 'up_next' | null; read: number }
const BOOKS = `SELECT b.id AS id, b.title AS title, b.series_id AS series_id, b.series_position AS position, b.shelf AS shelf,
   (SELECT s.title FROM series s WHERE s.id = b.series_id) AS series,
   (SELECT group_concat(x.name, ', ') FROM (SELECT au.name AS name FROM book_author ba JOIN author au ON au.id = ba.author_id WHERE ba.book_id = b.id AND ba.deleted_at IS NULL AND au.deleted_at IS NULL ORDER BY ba.sort_order) x) AS authors,
   EXISTS (SELECT 1 FROM read r WHERE r.book_id = b.id AND r.status = 'finished' AND r.deleted_at IS NULL) AS read
 FROM book b WHERE b.deleted_at IS NULL`;

async function withFormats(db: Db, rows: Row[]): Promise<ReleaseBook[]> {
  if (!rows.length) return [];
  const rels = await db.select<{ book_id: string; format: Fmt; status: FormatDate['status']; release_date: string | null }>(
    `SELECT book_id, format, status, release_date FROM format_release WHERE deleted_at IS NULL AND book_id IN (${rows.map(() => '?').join(',')})`, rows.map((r) => r.id));
  return rows.map((r) => {
    const formats: ReleaseBook['formats'] = {};
    for (const f of rels.filter((x) => x.book_id === r.id)) if (FMTS.includes(f.format)) formats[f.format] = { status: f.status, date: f.release_date };
    return { ...r, read: !!r.read, formats, next: null };
  });
}
const futureDates = (b: ReleaseBook, today: string) => Object.values(b.formats).flatMap((f) => (f && f.status === 'dated' && f.date && f.date >= today ? [f.date] : []));
const hasTba = (b: ReleaseBook) => Object.values(b.formats).some((f) => f?.status === 'tba');

// Books with something still to come: a format dated today or later, or announced without a date. Soonest first, books with only TBA formats last.
export async function listUpcoming(db: Db, today: string): Promise<ReleaseBook[]> {
  const ids = await db.select<{ book_id: string }>(
    `SELECT DISTINCT book_id FROM format_release WHERE deleted_at IS NULL AND (status = 'tba' OR (status = 'dated' AND release_date >= ?))`, [today]);
  if (!ids.length) return [];
  const rows = (await db.select<Row>(`${BOOKS} AND b.id IN (${ids.map(() => '?').join(',')})`, ids.map((i) => i.book_id)));
  const books = (await withFormats(db, rows)).map((b) => ({ ...b, next: futureDates(b, today).sort()[0] ?? null }));
  return books.filter((b) => b.next || hasTba(b)).sort((a, b) => (a.next ?? '9999') < (b.next ?? '9999') ? -1 : (a.next ?? '9999') > (b.next ?? '9999') ? 1 : a.title.localeCompare(b.title));
}

// Books that came out in the last `days` days that you have not read or started and that have nothing else still to come.
export async function listJustReleased(db: Db, today: string, days = 30): Promise<ReleaseBook[]> {
  const from = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)) - days)).toISOString().slice(0, 10);
  const ids = await db.select<{ book_id: string }>(
    `SELECT DISTINCT f.book_id AS book_id FROM format_release f WHERE f.deleted_at IS NULL AND f.status = 'dated' AND f.release_date >= ? AND f.release_date < ?
       AND NOT EXISTS (SELECT 1 FROM read r WHERE r.book_id = f.book_id AND r.deleted_at IS NULL)`, [from, today]);
  if (!ids.length) return [];
  const rows = await db.select<Row>(`${BOOKS} AND b.id IN (${ids.map(() => '?').join(',')})`, ids.map((i) => i.book_id));
  const books = await withFormats(db, rows);
  const recent = (b: ReleaseBook) => Object.values(b.formats).flatMap((f) => (f?.status === 'dated' && f.date && f.date >= from && f.date < today ? [f.date] : [])).sort().reverse()[0] ?? '';
  return books.filter((b) => !futureDates(b, today).length && !hasTba(b)).map((b) => ({ ...b, next: recent(b) })).sort((a, b) => (a.next! < b.next! ? 1 : -1));
}

// A book you are waiting for: goes on the TBR with whatever release dates you know.
export async function addUpcoming(db: Db, input: { title: string; authors: string[]; dates: Partial<Record<Fmt, string | 'tba'>> }): Promise<string> {
  if (!input.title.trim()) throw new Error('Type the book\'s title first.');
  const given = FMTS.filter((f) => input.dates[f]);
  if (!given.length) throw new Error('Add at least one release date, or mark a format TBA.');
  for (const f of given) { const v = input.dates[f]!; if (v !== 'tba' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error('Type dates as 2026-10-05.'); }
  const id = await addToShelf(db, { title: input.title, authors: input.authors, shelf: 'tbr' });
  for (const f of given) await setFormatRelease(db, id, f, input.dates[f]!);
  return id;
}

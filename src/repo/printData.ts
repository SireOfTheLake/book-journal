import type { Db } from '../db/adapter';
import type { PrintData } from '../domain/printPlan';

/** What there is to print for a year (or one month of it): the months with reading in them, the books finished, the series read, the challenges. */
export async function getPrintData(db: Db, year: number, month: number | null): Promise<PrintData> {
  const ym = `${year}-`;
  const dates = await db.select<{ d: string }>(
    `SELECT DISTINCT substr(d, 1, 7) AS d FROM (
       SELECT r.finish_date AS d FROM read r WHERE r.deleted_at IS NULL AND r.finish_date LIKE ?
       UNION SELECT r.start_date FROM read r WHERE r.deleted_at IS NULL AND r.start_date LIKE ?
       UNION SELECT e.entry_date FROM day_entry e JOIN read r ON r.id = e.read_id WHERE e.deleted_at IS NULL AND r.deleted_at IS NULL AND e.entry_date LIKE ?
     ) WHERE d IS NOT NULL`, [`${ym}%`, `${ym}%`, `${ym}%`]);
  const activeMonths = [...new Set(dates.map((x) => Number(x.d.slice(5, 7))))].sort((a, b) => a - b);
  const from = month ? `${ym}${String(month).padStart(2, '0')}-01` : `${ym}01-01`;
  const to = month ? `${ym}${String(month).padStart(2, '0')}-31` : `${ym}12-31`;
  const reads = await db.select<{ bookId: string; readId: string; title: string }>(
    `SELECT b.id AS bookId, r.id AS readId, b.title AS title FROM read r JOIN book b ON b.id = r.book_id
     WHERE r.deleted_at IS NULL AND b.deleted_at IS NULL AND r.status IN ('finished', 'dnf') AND r.finish_date BETWEEN ? AND ?
     ORDER BY r.finish_date, r.created_at, r.rowid`, [from, to]);
  const series = await db.select<{ id: string; title: string }>(
    `SELECT s.id AS id, s.title AS title FROM series s
     WHERE s.deleted_at IS NULL AND EXISTS (SELECT 1 FROM book b JOIN read r ON r.book_id = b.id WHERE b.series_id = s.id AND b.deleted_at IS NULL AND r.deleted_at IS NULL AND r.status IN ('finished', 'dnf') AND r.finish_date BETWEEN ? AND ?)
     ORDER BY (SELECT min(r.finish_date) FROM book b JOIN read r ON r.book_id = b.id WHERE b.series_id = s.id AND b.deleted_at IS NULL AND r.deleted_at IS NULL AND r.finish_date BETWEEN ? AND ?), s.title`, [from, to, from, to]);
  const challenges = await db.select<{ id: string; name: string }>(
    `SELECT c.id AS id, c.name AS name FROM challenge c JOIN journal_year y ON y.id = c.journal_year_id
     WHERE y.year = ? AND y.deleted_at IS NULL AND c.deleted_at IS NULL ORDER BY c.sort_order, c.created_at, c.rowid`, [year]);
  return { activeMonths, reads, series, challenges };
}

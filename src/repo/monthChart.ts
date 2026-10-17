import type { Db } from '../db/adapter';
import { pagesPerDay, type PageRead } from '../domain/pages';

export interface ChartBook { read_id: string; book_id: string; title: string; finish_date: string }
export interface ChartMonth { month: number; books: ChartBook[]; pages: number }

// For each month of a journal year: the books finished (in finish order) and the pages read in total.
// Pages use the same rule as the Calendar chart, so a book that spans two months is split between them.
export async function getMonthChart(db: Db, year: number): Promise<ChartMonth[]> {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const reads = await db.select<{ read_id: string; book_id: string; title: string; page_count: number | null; status: string; start_date: string | null; finish_date: string | null }>(
    `SELECT r.id AS read_id, b.id AS book_id, b.title, b.page_count, r.status, r.start_date, r.finish_date
     FROM read r JOIN book b ON b.id = r.book_id
     WHERE r.deleted_at IS NULL AND b.deleted_at IS NULL
       AND ((r.finish_date BETWEEN ? AND ?) OR (r.start_date IS NOT NULL AND r.start_date <= ? AND (r.finish_date IS NULL OR r.finish_date >= ?)))
     ORDER BY r.finish_date, COALESCE(r.finish_time, ''), r.rowid`, [start, end, end, start]);
  const ids = reads.map((r) => r.read_id);
  const entries = ids.length ? await db.select<{ read_id: string; date: string; page: number | null; percent: number | null }>(
    `SELECT read_id, entry_date AS date, position_page AS page, position_percent AS percent FROM day_entry WHERE deleted_at IS NULL AND read_id IN (${ids.map(() => '?').join(',')})`, ids) : [];
  const perDay = pagesPerDay(reads.map((r): PageRead => ({
    start: r.start_date, finish: r.status === 'finished' ? r.finish_date : null, pages: r.page_count,
    entries: entries.filter((e) => e.read_id === r.read_id).map((e) => ({ date: e.date, page: e.page, percent: e.percent })),
  })));
  const months: ChartMonth[] = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, books: [], pages: 0 }));
  for (const r of reads) if (r.status === 'finished' && r.finish_date && r.finish_date >= start && r.finish_date <= end)
    months[Number(r.finish_date.slice(5, 7)) - 1].books.push({ read_id: r.read_id, book_id: r.book_id, title: r.title, finish_date: r.finish_date });
  for (const [date, n] of perDay) if (date >= start && date <= end) months[Number(date.slice(5, 7)) - 1].pages += n;
  for (const m of months) m.pages = Math.round(m.pages);
  return months;
}

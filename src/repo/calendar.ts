import type { Db } from '../db/adapter';
import { addDays, pagesPerDay, type PageRead } from '../domain/pages';

export interface CalFinish { read_id: string; book_id: string; title: string; authors: string | null; format: 'physical' | 'audio' | 'ebook' | null; color_index: number | null; finish_date: string; cover: string | null }
export interface CalLine { read_id: string; book_id: string; title: string; color_index: number | null; from: string; to: string; open: boolean }
export interface CalEntry { read_id: string; book_id: string; title: string; date: string; page: number | null; percent: number | null; seconds: number | null; text: string | null }
export interface CalendarMonth {
  year: number; month: number; start: string; end: string;
  finishes: CalFinish[]; lines: CalLine[]; entries: CalEntry[];
  pages: Record<string, number>; // date -> pages, for days in this month
}

const pad = (n: number) => String(n).padStart(2, '0');
const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate();

interface ReadRow { cover: string | null; read_id: string; book_id: string; title: string; page_count: number | null; status: string; start_date: string | null; finish_date: string | null; format: CalFinish['format']; color_index: number | null; authors: string | null }

export async function getCalendarMonth(db: Db, year: number, month: number, today: string): Promise<CalendarMonth> {
  const start = `${year}-${pad(month)}-01`;
  const end = `${year}-${pad(month)}-${pad(lastDay(year, month))}`;
  const reads = await db.select<ReadRow>(
    `SELECT (SELECT i.file_path FROM image i WHERE i.id = b.cover_image_id AND i.deleted_at IS NULL) AS cover, r.id AS read_id, b.id AS book_id, b.title, b.page_count, r.status, r.start_date, r.finish_date, r.format, r.color_index,
       (SELECT group_concat(x.name, ', ') FROM (SELECT au.name AS name FROM book_author ba JOIN author au ON au.id = ba.author_id
          WHERE ba.book_id = b.id AND ba.deleted_at IS NULL AND au.deleted_at IS NULL ORDER BY ba.sort_order) x) AS authors
     FROM read r JOIN book b ON b.id = r.book_id
     WHERE r.deleted_at IS NULL AND b.deleted_at IS NULL
       AND ((r.finish_date BETWEEN ? AND ?) OR (r.start_date IS NOT NULL AND r.start_date <= ? AND (r.finish_date IS NULL OR r.finish_date >= ?)))
     ORDER BY COALESCE(r.finish_date, r.start_date), r.created_at, r.rowid`, [start, end, end, start]);
  const ids = reads.map((r) => r.read_id);
  const entries = ids.length ? await db.select<CalEntry & { read_id: string }>(
    `SELECT e.read_id AS read_id, r.book_id AS book_id, b.title AS title, e.entry_date AS date, e.position_page AS page, e.position_percent AS percent, e.position_seconds AS seconds, e.text AS text
     FROM day_entry e JOIN read r ON r.id = e.read_id JOIN book b ON b.id = r.book_id
     WHERE e.deleted_at IS NULL AND e.read_id IN (${ids.map(() => '?').join(',')}) ORDER BY e.entry_date`, ids) : [];

  const finishes: CalFinish[] = reads.filter((r) => r.status === 'finished' && r.finish_date && r.finish_date >= start && r.finish_date <= end)
    .map((r) => ({ read_id: r.read_id, book_id: r.book_id, title: r.title, authors: r.authors, format: r.format, color_index: r.color_index, finish_date: r.finish_date!, cover: r.cover }));
  // A reading line runs from the start date to the finish date (or to today for a book still being read).
  const lines: CalLine[] = reads.filter((r) => r.start_date && (r.finish_date || r.status === 'reading' || r.status === 'on_hold'))
    .map((r) => ({ read_id: r.read_id, book_id: r.book_id, title: r.title, color_index: r.color_index, from: r.start_date!, to: r.finish_date ?? (today < r.start_date! ? r.start_date! : today), open: !r.finish_date }))
    .filter((l) => l.to > l.from || l.open)
    .filter((l) => l.from <= end && l.to >= start); // only a line that touches this month: a book still being read does not reach into months after today

  const pageReads: PageRead[] = reads.map((r) => ({
    start: r.start_date, finish: r.status === 'finished' ? r.finish_date : null, pages: r.page_count,
    entries: entries.filter((e) => e.read_id === r.read_id).map((e) => ({ date: e.date, page: e.page, percent: e.percent })),
  }));
  const perDay = pagesPerDay(pageReads);
  const pages: Record<string, number> = {};
  for (let d = start; d <= end; d = addDays(d, 1)) { const v = perDay.get(d); if (v) pages[d] = Math.round(v); }
  return { year, month, start, end, finishes, lines, entries: entries.filter((e) => e.date >= start && e.date <= end), pages };
}

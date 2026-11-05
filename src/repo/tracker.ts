import type { Db } from '../db/adapter';
import { dayAmounts, type PageRead } from '../domain/pages';
import { autoBounds, validBounds } from '../domain/tracker';

export interface TrackerDay { pages: number; read: boolean; finished: number }
export interface Tracker { year: number; days: Map<string, TrackerDay>; bounds: number[]; custom: boolean; readDays: number; pages: number; finished: number }

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const KEY = 'tracker_ranges';

export async function saveBounds(db: Db, bounds: number[] | null): Promise<void> {
  if (!bounds) { await db.execute('DELETE FROM app_setting WHERE key = ?', [KEY]); return; }
  await db.execute(`INSERT INTO app_setting (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = ${NOW}`, [KEY, JSON.stringify(bounds)]);
}

/** What was read on each day of the year (the same rule as the Calendar), and the books finished each day. */
export async function getTracker(db: Db, year: number): Promise<Tracker> {
  const start = `${year}-01-01`, end = `${year}-12-31`;
  const reads = await db.select<{ read_id: string; page_count: number | null; audio_length_seconds: number | null; format: 'physical' | 'audio' | 'ebook' | null; status: string; start_date: string | null; finish_date: string | null }>(
    `SELECT r.id AS read_id, b.page_count, r.audio_length_seconds, r.format, r.status, r.start_date, r.finish_date
     FROM read r JOIN book b ON b.id = r.book_id
     WHERE r.deleted_at IS NULL AND b.deleted_at IS NULL
       AND ((r.finish_date BETWEEN ? AND ?) OR (r.start_date IS NOT NULL AND r.start_date <= ? AND (r.finish_date IS NULL OR r.finish_date >= ?)))`, [start, end, end, start]);
  const ids = reads.map((r) => r.read_id);
  const entries = ids.length ? await db.select<{ read_id: string; date: string; page: number | null; percent: number | null; seconds: number | null }>(
    `SELECT read_id, entry_date AS date, position_page AS page, position_percent AS percent, position_seconds AS seconds FROM day_entry WHERE deleted_at IS NULL AND read_id IN (${ids.map(() => '?').join(',')})`, ids) : [];
  const days = new Map<string, TrackerDay>();
  const day = (d: string) => { let x = days.get(d); if (!x) { x = { pages: 0, read: false, finished: 0 }; days.set(d, x); } return x; };
  for (const r of reads) {
    const pr: PageRead = {
      start: r.start_date, finish: r.status === 'finished' ? r.finish_date : null, pages: r.page_count, format: r.format, audioSeconds: r.audio_length_seconds,
      entries: entries.filter((e) => e.read_id === r.read_id).map((e) => ({ date: e.date, page: e.page, percent: e.percent, seconds: e.seconds })),
    };
    for (const [date, a] of dayAmounts(pr)) {
      if (date < start || date > end) continue;
      const d = day(date); d.read = true; d.pages += a.pages && a.pages > 0 ? a.pages : 0;
    }
    if (r.status === 'finished' && r.finish_date && r.finish_date >= start && r.finish_date <= end) { const d = day(r.finish_date); d.read = true; d.finished++; }
  }
  for (const d of days.values()) d.pages = Math.round(d.pages);
  const [saved] = await db.select<{ value: string }>('SELECT value FROM app_setting WHERE key = ?', [KEY]);
  let custom: number[] | null = null;
  try { custom = saved ? validBounds(JSON.parse(saved.value)) : null; } catch { custom = null; }
  const all = [...days.values()];
  return {
    year, days, bounds: custom ?? autoBounds(all.map((d) => d.pages)), custom: !!custom,
    readDays: all.filter((d) => d.read).length, pages: all.reduce((n, d) => n + d.pages, 0), finished: all.reduce((n, d) => n + d.finished, 0),
  };
}

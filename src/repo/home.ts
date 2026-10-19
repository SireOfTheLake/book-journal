import { countPlacesNeedingUpdate } from './places';
import type { Db } from '../db/adapter';
import { daysBetween, progressOf } from '../domain/progress';
import { getMonthChart } from './monthChart';
import { listSeriesLedger } from './series';

export interface CurrentRead {
  read_id: string; book_id: string; title: string; authors: string | null; series: string | null; position: number | null; status: 'reading' | 'on_hold';
  format: 'physical' | 'audio' | 'ebook' | null; start_date: string | null; day: number | null; cover: string | null;
  progress: number | null; last_entry: { date: string; page: number | null; percent: number | null; seconds: number | null } | null; entries: number;
}
export interface HomeBook { id: string; title: string; authors: string | null; series: string | null; position: number | null; cover: string | null }
export interface RecentRead extends HomeBook { read_id: string; finish_date: string | null; rating: number | null; format: 'physical' | 'audio' | 'ebook' | null }
export interface HomeData {
  reading: CurrentRead[]; paused: CurrentRead[];
  upNext: HomeBook[]; upNextCount: number;
  recent: RecentRead[];
  upcoming: { book_id: string; title: string; authors: string | null; format: string; status: 'dated' | 'tba'; release_date: string | null }[];
  year: { year: number; finished: number; thisMonth: number; avgStars: number | null; ratedBooks: number; pages: number; audioSeconds: number };
  goals: GoalProgress[]; // the goals chosen to show on Home
  tidy: { noCover: number; unassignedCharacters: number; locations: number; caughtUp: { id: string; title: string }[]; backup: { lastAt: string | null; days: number | null } };
}

const AUTHORS = `(SELECT group_concat(x.name, ', ') FROM (SELECT au.name AS name FROM book_author ba JOIN author au ON au.id = ba.author_id WHERE ba.book_id = b.id AND ba.deleted_at IS NULL AND au.deleted_at IS NULL ORDER BY ba.sort_order) x) AS authors`;
const SERIES = '(SELECT s.title FROM series s WHERE s.id = b.series_id) AS series, b.series_position AS position';
const COVER = '(SELECT i.file_path FROM image i WHERE i.id = b.cover_image_id AND i.deleted_at IS NULL) AS cover';

import { listHomeGoals, type GoalProgress } from './goals';

export async function getHome(db: Db, today: string): Promise<HomeData> {
  const year = Number(today.slice(0, 4));
  const monthKey = today.slice(0, 7);

  const raw = await db.select<Omit<CurrentRead, 'day' | 'progress' | 'last_entry' | 'entries'> & { page_count: number | null; audio_length_seconds: number | null }>(
    `SELECT r.id AS read_id, b.id AS book_id, b.title AS title, r.status AS status, r.format AS format, r.start_date AS start_date, b.page_count AS page_count, r.audio_length_seconds AS audio_length_seconds,
       ${AUTHORS}, ${SERIES}, ${COVER}
     FROM read r JOIN book b ON b.id = r.book_id WHERE r.deleted_at IS NULL AND b.deleted_at IS NULL AND r.status IN ('reading', 'on_hold') AND b.shelf IS NULL
     ORDER BY r.status = 'on_hold', r.start_date DESC, r.rowid DESC`);
  const ids = raw.map((r) => r.read_id);
  const entries = ids.length ? await db.select<{ read_id: string; entry_date: string; page: number | null; percent: number | null; seconds: number | null }>(
    `SELECT read_id, entry_date, position_page AS page, position_percent AS percent, position_seconds AS seconds FROM day_entry
     WHERE deleted_at IS NULL AND read_id IN (${ids.map(() => '?').join(',')}) ORDER BY entry_date DESC, rowid DESC`, ids) : [];
  const current: CurrentRead[] = raw.map((r) => {
    const mine = entries.filter((e) => e.read_id === r.read_id);
    const last = mine[0] ?? null;
    return {
      read_id: r.read_id, book_id: r.book_id, title: r.title, authors: r.authors, series: r.series, position: r.position, status: r.status, format: r.format, start_date: r.start_date,
      cover: r.cover, day: r.start_date ? Math.max(1, daysBetween(r.start_date, today) + 1) : null,
      last_entry: last ? { date: last.entry_date, page: last.page, percent: last.percent, seconds: last.seconds } : null, entries: mine.length,
      progress: progressOf(last, { format: r.format, pageCount: r.page_count, audioSeconds: r.audio_length_seconds }),
    };
  });

  const upNext = await db.select<HomeBook>(
    `SELECT b.id AS id, b.title AS title, ${AUTHORS}, ${SERIES}, ${COVER} FROM book b WHERE b.deleted_at IS NULL AND b.shelf = 'up_next' ORDER BY b.tbr_priority, b.rowid LIMIT 6`);
  const [{ n: upNextCount }] = await db.select<{ n: number }>("SELECT count(*) AS n FROM book WHERE deleted_at IS NULL AND shelf = 'up_next'");
  const recent = await db.select<RecentRead>(
    `SELECT r.id AS read_id, b.id AS id, b.title AS title, r.finish_date AS finish_date, r.format AS format, r.rating / 4.0 AS rating, ${AUTHORS}, ${SERIES}, ${COVER}
     FROM read r JOIN book b ON b.id = r.book_id WHERE r.deleted_at IS NULL AND b.deleted_at IS NULL AND r.status = 'finished'
     ORDER BY r.finish_date DESC, COALESCE(r.finish_time, '') DESC, r.rowid DESC LIMIT 16`); // more than one row can hold; the card shows as many as fit across

  const upcoming = await db.select<HomeData['upcoming'][number]>(
    `SELECT f.book_id AS book_id, b.title AS title, f.format AS format, f.status AS status, f.release_date AS release_date, ${AUTHORS}
     FROM format_release f JOIN book b ON b.id = f.book_id AND b.deleted_at IS NULL
     WHERE f.deleted_at IS NULL AND (f.status = 'tba' OR f.release_date >= ?) ORDER BY f.release_date IS NULL, f.release_date, CASE WHEN lower(b.title) LIKE \'the %\' THEN lower(substr(b.title, 5)) ELSE lower(b.title) END LIMIT 5`, [today]);

  const [stats] = await db.select<{ finished: number; month: number; avg: number | null; rated: number; audio: number | null }>(
    `SELECT count(*) AS finished, sum(CASE WHEN substr(finish_date, 1, 7) = ? THEN 1 ELSE 0 END) AS month, avg(rating) / 4.0 AS avg, count(rating) AS rated,
       sum(CASE WHEN format = 'audio' THEN audio_length_seconds ELSE 0 END) AS audio
     FROM read WHERE deleted_at IS NULL AND status = 'finished' AND substr(finish_date, 1, 4) = ?`, [monthKey, String(year)]);
  const pages = (await getMonthChart(db, year)).reduce((n, m) => n + m.pages, 0);

  const [{ n: noCover }] = await db.select<{ n: number }>(
    `SELECT count(*) AS n FROM book b WHERE b.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM image i WHERE i.id = b.cover_image_id AND i.deleted_at IS NULL)`);
  const [{ n: unassigned }] = await db.select<{ n: number }>(
    `SELECT count(*) AS n FROM character c WHERE c.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM book_character bc WHERE bc.character_id = c.id AND bc.deleted_at IS NULL)`);
  const [last] = await db.select<{ value: string }>("SELECT value FROM app_setting WHERE key = 'last_backup_at'");
  const lastAt = last?.value ?? null;
  const backupDays = lastAt ? Math.max(0, daysBetween(lastAt.slice(0, 10), today)) : null;
  const caughtUp = (await listSeriesLedger(db)).filter((s) => s.status === 'caught_up').map((s) => ({ id: s.id, title: s.title }));

  return {
    reading: current.filter((c) => c.status === 'reading'), paused: current.filter((c) => c.status === 'on_hold'),
    upNext, upNextCount: Number(upNextCount), recent, upcoming,
    year: { year, finished: Number(stats.finished), thisMonth: Number(stats.month ?? 0), avgStars: stats.avg, ratedBooks: Number(stats.rated), pages, audioSeconds: Number(stats.audio ?? 0) },
    goals: await listHomeGoals(db, today),
    tidy: { noCover: Number(noCover), unassignedCharacters: Number(unassigned), locations: await countPlacesNeedingUpdate(db), caughtUp, backup: { lastAt, days: backupDays } },
  };
}

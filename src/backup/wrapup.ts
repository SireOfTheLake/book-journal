import type { Db } from '../db/adapter';
import { getBookLog, listItems } from '../repo/bookLog';
import { listBookQuotes } from '../repo/quotes';
import { getReason } from '../repo/reason';
import { listChallenges, listReadChallenges } from '../repo/challenges';
import { getTracker } from '../repo/tracker';
import { MONTHS } from '../domain/printPlan';
import { dataUrlBytes, makeZip, type ZipFile } from './zip';
import { stampOf, type BackupEnv } from './backup';

const pad = (n: number) => String(n).padStart(2, '0');
export interface WrapupPeriod { year: number; month: number | null }

const ABOUT = [
  'This file is a reading journal for one period, prepared so it can be analysed (for a "wrapped" style review and reading recommendations).',
  'period: the dates covered. books: every read finished (or stopped) in the period, with all the details written about it.',
  'inProgress: reads started but not finished by the end of the period. history: every other finished read, kept small, to show taste over time.',
  'daily: pages read each day (worked out from logged positions; audio shows seconds listened). series, challenges and quotes follow.',
  'Ratings are 1 to 5 stars (half stars allowed). Heat level is 0 to 5. Dates are YYYY-MM-DD. Cover pictures, when included, are in covers/ and named in each book\'s "cover".',
];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'book';
const names = (xs: { name: string }[]) => xs.map((x) => x.name);

/** Everything about a period of reading, as plain data. Covers are collected separately so they can go in a ZIP next to it. */
export async function buildWrapup(db: Db, period: WrapupPeriod, opts: { includeCovers: boolean; now: Date }): Promise<{ data: Record<string, unknown>; covers: ZipFile[]; books: number }> {
  const { year, month } = period;
  const from = month ? `${year}-${pad(month)}-01` : `${year}-01-01`;
  const to = month ? `${year}-${pad(month)}-31` : `${year}-12-31`;
  const rows = await db.select<{ book_id: string; read_id: string }>(
    `SELECT b.id AS book_id, r.id AS read_id FROM read r JOIN book b ON b.id = r.book_id
     WHERE r.deleted_at IS NULL AND b.deleted_at IS NULL AND r.status IN ('finished', 'dnf') AND r.finish_date BETWEEN ? AND ?
     ORDER BY r.finish_date, r.created_at, r.rowid`, [from, to]);
  const sources = new Map((await listItems(db, 'source')).map((s) => [s.id, s.name]));
  const periods = new Map((await listItems(db, 'time_period')).map((s) => [s.id, s.name]));
  const covers: ZipFile[] = [];
  const books: Record<string, unknown>[] = [];
  let n = 0;
  for (const r of rows) {
    const log = await getBookLog(db, r.book_id, r.read_id);
    if (!log || !log.read) continue;
    n++;
    const rd = log.read;
    let cover: string | null = null;
    if (opts.includeCovers) {
      const pic = dataUrlBytes(log.cover);
      if (pic) { cover = `covers/${String(n).padStart(3, '0')}-${slug(log.book.title)}.${pic.ext}`; covers.push({ name: cover, data: pic.bytes }); }
    }
    const [reason, challenges, quotes] = await Promise.all([getReason(db, rd.id), listReadChallenges(db, rd.id), listBookQuotes(db, r.book_id)]);
    const days = rd.start_date && rd.finish_date ? Math.round((Date.parse(rd.finish_date) - Date.parse(rd.start_date)) / 86400000) + 1 : null;
    books.push({
      title: log.book.title, authors: names(log.authors), status: rd.status, favorite: log.book.is_favorite === 1,
      series: log.series ? { title: log.series.title, position: log.book.series_position, mainBooks: log.series.main_total } : null,
      universe: (log.universe ?? log.seriesUniverse)?.name ?? null,
      started: rd.start_date, finished: rd.finish_date, daysToFinish: days, rating: rd.rating, format: rd.format,
      pages: log.book.page_count, audioHours: rd.audio_length_seconds ? Math.round(rd.audio_length_seconds / 360) / 10 : null,
      narrators: log.narrators.map((x) => ({ name: x.name, rating: x.rating, accent: x.accent ?? (names(x.accents).join(', ') || null) })), narrationStyle: rd.narration_style,
      genres: names(log.genres), themes: names(log.themes), tropes: names(log.tropes), moods: names(log.moods), pace: names(log.paces), contentWarnings: names(log.warnings),
      pov: log.book.pov, perspective: log.book.perspective, heatLevel: log.book.heat_level,
      timePeriod: (log.book.time_period_id ? periods.get(log.book.time_period_id) : null) ?? log.book.time_period_detail ?? null,
      settings: log.places.map((p) => [p.name, p.city, p.area, p.country].filter(Boolean).join(', ')),
      published: log.book.original_publication_date, source: rd.source_id ? sources.get(rd.source_id) ?? null : null,
      couples: log.makeup, characters: log.characters.map((c) => ({ name: c.name, role: c.role, gender: c.gender, occupations: c.occupations, partners: c.partners })),
      whyIReadIt: reason.kind ? { kind: reason.kind, detail: reason.sub, prompt: reason.prompt } : null,
      challenges: challenges.map((c) => ({ challenge: c.name, prompt: c.label })),
      stoppedBecause: rd.stopped_reason ?? null, stoppedAt: rd.stopped_where ?? null,
      synopsis: log.book.synopsis, notes: rd.notes,
      dayLog: log.entries.map((e) => ({ date: e.entry_date, page: e.position_page, percent: e.position_percent, seconds: e.position_seconds, text: e.text })).filter((e) => e.date <= to),
      quotes: quotes.map((q) => ({ text: q.text, page: q.page, favorite: q.is_favorite === 1, note: q.note })), cover,
    });
  }
  const inProgress = await db.select<{ title: string; start_date: string | null; status: string; authors: string | null }>(
    `SELECT b.title AS title, r.start_date AS start_date, r.status AS status,
       (SELECT group_concat(x.name, ', ') FROM (SELECT au.name AS name FROM book_author ba JOIN author au ON au.id = ba.author_id WHERE ba.book_id = b.id AND ba.deleted_at IS NULL AND au.deleted_at IS NULL ORDER BY ba.sort_order) x) AS authors
     FROM read r JOIN book b ON b.id = r.book_id WHERE r.deleted_at IS NULL AND b.deleted_at IS NULL AND r.status IN ('reading', 'on_hold') AND r.start_date <= ? ORDER BY r.start_date`, [to]);
  const history = await db.select<{ title: string; authors: string | null; rating: number | null; finished: string; genres: string | null }>(
    `SELECT b.title AS title, r.rating AS rating, r.finish_date AS finished,
       (SELECT group_concat(x.name, ', ') FROM (SELECT au.name AS name FROM book_author ba JOIN author au ON au.id = ba.author_id WHERE ba.book_id = b.id AND ba.deleted_at IS NULL AND au.deleted_at IS NULL ORDER BY ba.sort_order) x) AS authors,
       (SELECT group_concat(g.name, ', ') FROM book_genre j JOIN genre g ON g.id = j.genre_id WHERE j.book_id = b.id AND j.deleted_at IS NULL) AS genres
     FROM read r JOIN book b ON b.id = r.book_id
     WHERE r.deleted_at IS NULL AND b.deleted_at IS NULL AND r.status = 'finished' AND r.finish_date IS NOT NULL AND NOT (r.finish_date BETWEEN ? AND ?) ORDER BY r.finish_date`, [from, to]);
  const tracker = await getTracker(db, year);
  const daily = [...tracker.days.entries()].filter(([d, v]) => v.read && d >= from && d <= to).sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, v]) => ({ date, pages: v.pages, finishedBooks: v.finished }));
  const series = await db.select<{ title: string; total_books: number | null; read_in_period: number; read_ever: number }>(
    `SELECT s.title AS title, s.total_books AS total_books,
       (SELECT count(DISTINCT b.id) FROM book b JOIN read r ON r.book_id = b.id WHERE b.series_id = s.id AND b.deleted_at IS NULL AND r.deleted_at IS NULL AND r.status = 'finished' AND r.finish_date BETWEEN ? AND ?) AS read_in_period,
       (SELECT count(DISTINCT b.id) FROM book b JOIN read r ON r.book_id = b.id WHERE b.series_id = s.id AND b.deleted_at IS NULL AND r.deleted_at IS NULL AND r.status = 'finished') AS read_ever
     FROM series s WHERE s.deleted_at IS NULL ORDER BY s.title`, [from, to]);
  const challenges = (await listChallenges(db, year)).map((c) => ({ name: c.name, kind: c.kind, done: c.done, total: c.total, percent: c.percent }));

  const finished = books.filter((b) => b.status === 'finished');
  const rated = finished.map((b) => b.rating as number | null).filter((x): x is number => typeof x === 'number');
  const count = (xs: string[]) => Object.entries(xs.reduce<Record<string, number>>((m, x) => { m[x] = (m[x] ?? 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]).map(([name, books]) => ({ name, books }));
  const pagesTotal = daily.reduce((s, d) => s + d.pages, 0);
  const dates = daily.map((d) => d.date);
  let streak = 0, best = 0, prev: string | null = null;
  for (const d of dates) { streak = prev && Date.parse(d) - Date.parse(prev) === 86400000 ? streak + 1 : 1; best = Math.max(best, streak); prev = d; }
  const summary = {
    booksFinished: finished.length, booksStopped: books.length - finished.length, pagesRead: pagesTotal, daysRead: dates.length, longestStreakDays: best,
    averageRating: rated.length ? Math.round((rated.reduce((a, b) => a + b, 0) / rated.length) * 100) / 100 : null,
    audioHoursFinished: Math.round(finished.reduce((s, b) => s + ((b.audioHours as number | null) ?? 0), 0) * 10) / 10,
    byMonth: Array.from({ length: 12 }, (_, i) => ({ month: MONTHS[i], finished: finished.filter((b) => String(b.finished).slice(5, 7) === pad(i + 1)).length })).filter((m) => !month || MONTHS[month - 1] === m.month),
    byFormat: count(finished.map((b) => String(b.format ?? 'unknown'))),
    topAuthors: count(finished.flatMap((b) => b.authors as string[])).slice(0, 10),
    topGenres: count(finished.flatMap((b) => b.genres as string[])).slice(0, 10), topTropes: count(finished.flatMap((b) => b.tropes as string[])).slice(0, 10),
    topThemes: count(finished.flatMap((b) => b.themes as string[])).slice(0, 10), topMoods: count(finished.flatMap((b) => b.moods as string[])).slice(0, 10),
    favorites: finished.filter((b) => b.favorite).map((b) => b.title),
  };
  const data = {
    app: 'Book Journal', kind: 'reading wrap-up', exportedAt: opts.now.toISOString(), about: ABOUT,
    period: { label: month ? `${MONTHS[month - 1]} ${year}` : String(year), from, to }, summary, books, inProgress, daily, series: series.filter((s) => s.read_in_period > 0 || s.read_ever > 0), challenges, history,
  };
  return { data, covers, books: books.length };
}

export interface WrapupResult { path: string; books: number; covers: number }

/** Asks where to save, then writes the wrap-up: a ZIP with the data and the covers, or just the JSON when there are no covers to include. Null if cancelled. */
export async function exportWrapup(db: Db, env: BackupEnv, period: WrapupPeriod, opts: { includeCovers: boolean }): Promise<WrapupResult | null> {
  const now = env.now();
  const stamp = stampOf(now);
  const label = period.month ? `${period.year}-${pad(period.month)}` : String(period.year);
  const built = await buildWrapup(db, period, { includeCovers: opts.includeCovers, now });
  const json = JSON.stringify(built.data, null, 2);
  if (opts.includeCovers && built.covers.length > 0) {
    const target = await env.pickSavePath(`book-journal-wrapup-${label}.zip`, 'Zip file', 'zip');
    if (!target) return null;
    const zip = makeZip([{ name: 'wrapup.json', data: new TextEncoder().encode(json) }, ...built.covers], now);
    await env.writeBytes(target, zip);
    return { path: target, books: built.books, covers: built.covers.length };
  }
  void stamp;
  const target = await env.pickSavePath(`book-journal-wrapup-${label}.json`, 'JSON', 'json');
  if (!target) return null;
  await env.writeText(target, json);
  return { path: target, books: built.books, covers: 0 };
}

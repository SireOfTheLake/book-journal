import type { Db, SqlValue } from '../db/adapter';
import { newId } from '../domain/ids';
import { first } from '../import/writer';
import { createBook, findOrCreateAuthor } from './books';
import { sortGenres } from '../domain/genres';

export type MarkState = 'read' | 'dnf' | 'unread' | 'unreleased' | 'missing';
export interface Mark { state: MarkState; position: number | null; bookId: string | null }
export type SeriesStatus = 'finished' | 'caught_up' | 'in_progress' | 'on_hold' | 'dnf' | 'not_started';

export interface LedgerRow {
  id: string; title: string; total_books: number | null; publication_status: 'complete' | 'incomplete';
  universe: string | null; universe_id: string | null; is_favorite: number; flagged: number; marks: Mark[]; status: SeriesStatus;
  read: number; total: number; // main books only (whole-number positions): "1 of 5"
  allBooks: number; novellas: number; // every known book, and how many of them are novellas: "7 books"
}

// A series' length counts the numbered books (positions 1, 2, 3...). Novellas and extras have a fractional
// position (0.5, 5.5) and are not part of that count, but they are still books in the series.
export interface SeriesLength { mainTotal: number; mainRead: number; novellas: number; allBooks: number }
export function seriesLength(series: { total_books: number | null }, books: { position: number | null; is_read: number }[]): SeriesLength {
  const isNovella = (b: { position: number | null }) => b.position !== null && !Number.isInteger(b.position);
  const main = books.filter((b) => !isNovella(b));
  const novellas = books.length - main.length;
  const mainTotal = Math.max(series.total_books ?? 0, main.length);
  return { mainTotal, mainRead: main.filter((b) => b.is_read).length, novellas, allBooks: mainTotal + novellas };
}

interface SeriesDbRow {
  id: string; title: string; universe_id: string | null; total_books: number | null; is_ongoing: number; publication_status: 'complete' | 'incomplete';
  reading_status_override: 'completed' | 'in_progress' | 'on_hold' | 'dnf' | null; interconnected_standalones: number; is_favorite: number; flagged: number; notes: string | null;
}
interface BookDbRow { id: string; series_id: string; title: string; position: number | null; shelf: string | null; is_read: number; is_dnf: number; is_reading: number; unreleased: number | null }

const BOOKS_SQL = `
  SELECT b.id, b.series_id, b.title, b.series_position AS position, b.shelf,
    EXISTS (SELECT 1 FROM read r WHERE r.book_id = b.id AND r.status = 'finished' AND r.deleted_at IS NULL) AS is_read,
    EXISTS (SELECT 1 FROM read r WHERE r.book_id = b.id AND r.status = 'dnf' AND r.deleted_at IS NULL) AS is_dnf,
    EXISTS (SELECT 1 FROM read r WHERE r.book_id = b.id AND r.status IN ('reading', 'on_hold') AND b.shelf IS NULL AND r.deleted_at IS NULL) AS is_reading,
    (SELECT is_unreleased FROM v_book_release v WHERE v.book_id = b.id) AS unreleased
  FROM book b WHERE b.series_id IS NOT NULL AND b.deleted_at IS NULL
  ORDER BY b.series_id, b.series_position IS NULL, b.series_position, b.created_at, b.rowid`;

const stateOf = (b: BookDbRow): MarkState => (b.is_read ? 'read' : b.is_dnf ? 'dnf' : b.unreleased ? 'unreleased' : 'unread');

// Marks for each book in order, plus a "not added yet" mark for any book the series is known to have but you have not added.
function buildMarks(series: SeriesDbRow, books: BookDbRow[]): Mark[] {
  const marks: Mark[] = books.map((b) => ({ state: stateOf(b), position: b.position, bookId: b.id }));
  const total = series.total_books ?? 0;
  const mainBooks = books.filter((b) => b.position === null || Number.isInteger(b.position));
  if (total > mainBooks.length) {
    const have = new Set(books.map((b) => b.position).filter((p): p is number => p !== null));
    if (books.every((b) => b.position !== null)) {
      for (let p = 1; p <= total; p++) if (!have.has(p)) marks.push({ state: 'missing', position: p, bookId: null });
      marks.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    } else for (let i = 0; i < total - mainBooks.length; i++) marks.push({ state: 'missing', position: null, bookId: null });
  }
  return marks;
}

export function seriesStatus(series: SeriesDbRow, books: BookDbRow[]): SeriesStatus {
  if (series.reading_status_override) return series.reading_status_override === 'completed' ? 'finished' : series.reading_status_override;
  const read = books.filter((b) => b.is_read).length;
  const len = seriesLength(series, books.map((b) => ({ position: b.position, is_read: b.is_read })));
  if (books.some((b) => !b.is_read && b.is_dnf)) return 'dnf';
  if (books.length > 0 && read === books.length && len.allBooks === books.length) return series.publication_status === 'complete' ? 'finished' : 'caught_up';
  if (read > 0 || books.some((b) => b.is_reading)) return 'in_progress';
  return 'not_started';
}

export async function listSeriesLedger(db: Db): Promise<LedgerRow[]> {
  const series = await db.select<SeriesDbRow & { universe: string | null }>(
    `SELECT s.*, (SELECT u.name FROM universe u WHERE u.id = s.universe_id) AS universe FROM series s WHERE s.deleted_at IS NULL ORDER BY CASE WHEN lower(s.title) LIKE \'the %\' THEN lower(substr(s.title, 5)) ELSE lower(s.title) END`);
  const books = await db.select<BookDbRow>(BOOKS_SQL);
  return series.map((s) => {
    const mine = books.filter((b) => b.series_id === s.id);
    const marks = buildMarks(s, mine);
    const len = seriesLength(s, mine.map((b) => ({ position: b.position, is_read: b.is_read })));
    return { id: s.id, title: s.title, total_books: s.total_books, publication_status: s.publication_status, universe: s.universe, universe_id: s.universe_id, is_favorite: s.is_favorite, flagged: s.flagged,
      marks, status: seriesStatus(s, mine), read: len.mainRead, total: len.mainTotal, allBooks: len.allBooks, novellas: len.novellas };
  });
}

// ---------- one series ----------
export interface Release { format: 'ebook' | 'physical' | 'audio'; status: 'dated' | 'tba' | 'not_planned'; release_date: string | null }
export interface SeriesBook {
  id: string; title: string; position: number | null; shelf: 'tbr' | 'up_next' | null; state: MarkState; authors: string | null;
  finish_date: string | null; format: 'physical' | 'audio' | 'ebook' | null; rating: number | null; tropes: string | null; read_id: string | null; releases: Release[];
  status: 'tbr' | 'up_next' | 'reading' | 'finished' | 'on_hold' | 'dnf' | null;
  cover: string | null;
}
export interface SeriesPage {
  series: SeriesDbRow; universe: { id: string; name: string } | null; authors: { id: string; name: string }[];
  books: SeriesBook[]; genres: { id: string; name: string; color: string | null; locked?: boolean }[];
  read: number; total: number; allBooks: number; novellas: number; avgStars: number | null; ratedBooks: number; status: SeriesStatus;
}

export async function getSeriesPage(db: Db, seriesId: string): Promise<SeriesPage | null> {
  const [series] = await db.select<SeriesDbRow>('SELECT * FROM series WHERE id = ? AND deleted_at IS NULL', [seriesId]);
  if (!series) return null;
  const rows = (await db.select<BookDbRow>(BOOKS_SQL)).filter((b) => b.series_id === seriesId);
  const books: SeriesBook[] = [];
  for (const b of rows) {
    const [info] = await db.select<{ authors: string | null; finish_date: string | null; format: SeriesBook['format']; rating: number | null; tropes: string | null; read_id: string | null; read_status: SeriesBook['status'] }>(
      `SELECT (SELECT group_concat(x.name, ', ') FROM (SELECT au.name AS name FROM book_author ba JOIN author au ON au.id = ba.author_id WHERE ba.book_id = b.id AND ba.deleted_at IS NULL ORDER BY ba.sort_order) x) AS authors,
         (SELECT r.finish_date FROM read r WHERE r.book_id = b.id AND r.status = 'finished' AND r.deleted_at IS NULL ORDER BY r.finish_date DESC LIMIT 1) AS finish_date,
         (SELECT r.format FROM read r WHERE r.book_id = b.id AND r.deleted_at IS NULL ORDER BY r.created_at DESC, r.rowid DESC LIMIT 1) AS format,
         (SELECT avg_stars FROM v_book_rating v WHERE v.book_id = b.id) AS rating,
         (SELECT group_concat(t.name, ', ') FROM book_trope bt JOIN trope t ON t.id = bt.trope_id WHERE bt.book_id = b.id AND bt.deleted_at IS NULL) AS tropes,
         (SELECT r.id FROM read r WHERE r.book_id = b.id AND r.deleted_at IS NULL ORDER BY r.created_at DESC, r.rowid DESC LIMIT 1) AS read_id,
         (SELECT r.status FROM read r WHERE r.book_id = b.id AND r.deleted_at IS NULL ORDER BY r.created_at DESC, r.rowid DESC LIMIT 1) AS read_status
       FROM book b WHERE b.id = ?`, [b.id]);
    const releases = await db.select<Release>("SELECT format, status, release_date FROM format_release WHERE book_id = ? AND deleted_at IS NULL ORDER BY format", [b.id]);
    const [cv] = await db.select<{ cover: string | null }>('SELECT (SELECT i.file_path FROM image i WHERE i.id = b.cover_image_id AND i.deleted_at IS NULL) AS cover FROM book b WHERE b.id = ?', [b.id]);
    const { read_status, ...rest } = info;
    books.push({ id: b.id, title: b.title, position: b.position, shelf: b.shelf as SeriesBook['shelf'], state: stateOf(b), ...rest, status: (b.shelf as SeriesBook['status']) ?? read_status ?? null, cover: cv?.cover ?? null, releases });
  }
  const rated = books.filter((b) => b.rating !== null);
  const [universe] = series.universe_id ? await db.select<{ id: string; name: string }>('SELECT id, name FROM universe WHERE id = ?', [series.universe_id]) : [];
  const authors = await seriesAuthors(db, seriesId);
  return {
    series, universe: universe ?? null, authors, books,
    genres: sortGenres(await seriesGenres(db, seriesId)),
    ...(() => { const l = seriesLength(series, rows.map((b) => ({ position: b.position, is_read: b.is_read }))); return { read: l.mainRead, total: l.mainTotal, allBooks: l.allBooks, novellas: l.novellas }; })(),
    avgStars: rated.length ? rated.reduce((n, b) => n + b.rating!, 0) / rated.length : null, ratedBooks: rated.length,
    status: seriesStatus(series, rows),
  };
}

// ---------- editing ----------
const SERIES_COLS = new Set(['title', 'universe_id', 'total_books', 'is_ongoing', 'publication_status', 'reading_status_override', 'interconnected_standalones', 'is_favorite', 'flagged', 'notes']);
export async function updateSeries(db: Db, id: string, fields: Record<string, SqlValue>) {
  const cols = Object.keys(fields).filter((c) => SERIES_COLS.has(c));
  if (cols.length) await db.execute(`UPDATE series SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [...cols.map((c) => fields[c]), id]);
}

export async function createSeries(db: Db, title: string, opts: { authors?: string[]; totalBooks?: number | null } = {}): Promise<string> {
  const t = title.trim();
  if (!t) throw new Error('A series needs a title.');
  const existing = await first(db, 'SELECT id FROM series WHERE lower(title) = lower(?) AND deleted_at IS NULL', [t]);
  if (existing) return existing;
  const id = newId();
  await db.execute('INSERT INTO series (id, title, total_books) VALUES (?, ?, ?)', [id, t, opts.totalBooks && opts.totalBooks > 0 ? Math.floor(opts.totalBooks) : null]);
  for (const name of (opts.authors ?? []).map((a) => a.trim()).filter(Boolean)) await addSeriesAuthor(db, id, { name });
  return id;
}

export const listSeriesOptions = (db: Db) => db.select<{ id: string; name: string }>('SELECT id, title AS name FROM series WHERE deleted_at IS NULL ORDER BY CASE WHEN lower(title) LIKE \'the %\' THEN lower(substr(title, 5)) ELSE lower(title) END');
export const listUniverses = (db: Db) => db.select<{ id: string; name: string }>('SELECT id, name FROM universe WHERE deleted_at IS NULL ORDER BY CASE WHEN lower(name) LIKE \'the %\' THEN lower(substr(name, 5)) ELSE lower(name) END');
export async function createUniverse(db: Db, name: string): Promise<string> {
  const existing = await first(db, 'SELECT id FROM universe WHERE lower(name) = lower(?) AND deleted_at IS NULL', [name.trim()]);
  if (existing) return existing;
  const id = newId();
  await db.execute('INSERT INTO universe (id, name) VALUES (?, ?)', [id, name.trim()]);
  return id;
}

// Adds a book to the series on the TBR shelf, as the next position, with the series' usual authors.
// A series that was marked finished goes back to not finished, and the total grows if needed.
export async function addBookToSeries(db: Db, seriesId: string, title: string): Promise<string> {
  const [{ n, m }] = await db.select<{ n: number; m: number | null }>('SELECT count(*) AS n, max(series_position) AS m FROM book WHERE series_id = ? AND deleted_at IS NULL', [seriesId]);
  const unique = (await seriesAuthors(db, seriesId)).map((a) => a.name);
  const id = await createBook(db, { title, authors: unique, seriesId, seriesPosition: Number(n) > 0 ? Math.floor(m ?? Number(n)) + 1 : 1, shelf: 'tbr' });
  const [s] = await db.select<{ total_books: number | null; publication_status: string }>('SELECT total_books, publication_status FROM series WHERE id = ?', [seriesId]);
  const total = Math.max(Number(n) + 1, s.total_books ?? 0);
  await db.execute('UPDATE series SET total_books = ?, publication_status = ? WHERE id = ?', [total, 'incomplete', seriesId]);
  return id;
}

// Adds a book you already have to this series, at a position (a fractional position makes it a novella).
export async function addExistingBook(db: Db, seriesId: string, bookId: string, position: number | null): Promise<void> {
  await setBookSeries(db, bookId, seriesId, position);
  const [s] = await db.select<{ total_books: number | null }>('SELECT total_books FROM series WHERE id = ?', [seriesId]);
  if (position !== null && Number.isInteger(position) && position > (s.total_books ?? 0)) await db.execute('UPDATE series SET total_books = ? WHERE id = ?', [position, seriesId]);
}

export async function setBookSeries(db: Db, bookId: string, seriesId: string | null, position: number | null = null) {
  await db.execute('UPDATE book SET series_id = ?, series_position = ? WHERE id = ?', [seriesId, seriesId ? position : null, bookId]);
}

export async function addSeriesGenre(db: Db, seriesId: string, name: string) {
  if (!name.trim()) return;
  const gid = (await findGenre(db, name)) ?? (await newGenre(db, name));
  if (!(await first(db, 'SELECT id FROM series_genre WHERE series_id = ? AND genre_id = ? AND deleted_at IS NULL', [seriesId, gid])))
    await db.execute('INSERT INTO series_genre (id, series_id, genre_id) VALUES (?, ?, ?)', [newId(), seriesId, gid]);
}
const findGenre = (db: Db, name: string) => first(db, 'SELECT id FROM genre WHERE lower(name) = lower(?) AND deleted_at IS NULL LIMIT 1', [name.trim()]);
async function newGenre(db: Db, name: string) {
  const { randomTagColor } = await import('../domain/colors');
  const id = newId();
  await db.execute('INSERT INTO genre (id, name, color) VALUES (?, ?, ?)', [id, name.trim(), randomTagColor()]);
  return id;
}
export const removeSeriesGenre = (db: Db, seriesId: string, genreId: string) =>
  db.execute("UPDATE series_genre SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE series_id = ? AND genre_id = ? AND deleted_at IS NULL", [seriesId, genreId]);

// The book is out: forget any upcoming or TBA release dates left on it.
export async function markReleased(db: Db, bookId: string) {
  await db.execute("UPDATE format_release SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE book_id = ? AND deleted_at IS NULL", [bookId]);
}

// A release date for one format. date = null clears it; 'tba' marks it announced without a date.
export async function setFormatRelease(db: Db, bookId: string, format: Release['format'], date: string | 'tba' | null) {
  const existing = await first(db, 'SELECT id FROM format_release WHERE book_id = ? AND format = ? AND deleted_at IS NULL', [bookId, format]);
  if (date === null) {
    if (existing) await db.execute("UPDATE format_release SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?", [existing]);
    return;
  }
  const status = date === 'tba' ? 'tba' : 'dated';
  const when = date === 'tba' ? null : date;
  if (existing) await db.execute('UPDATE format_release SET status = ?, release_date = ? WHERE id = ?', [status, when, existing]);
  else await db.execute('INSERT INTO format_release (id, book_id, format, status, release_date) VALUES (?, ?, ?, ?, ?)', [newId(), bookId, format, status, when]);
}


// ---------- a series' own authors ----------
const derivedAuthors = (db: Db, seriesId: string) => db.select<{ id: string; name: string }>(
  `SELECT a.id AS id, a.name AS name FROM book b JOIN book_author ba ON ba.book_id = b.id AND ba.deleted_at IS NULL JOIN author a ON a.id = ba.author_id AND a.deleted_at IS NULL
   WHERE b.series_id = ? AND b.deleted_at IS NULL GROUP BY a.id ORDER BY min(b.created_at), min(ba.sort_order), a.created_at`, [seriesId]);

// The series' authors: the ones set on the series, or (if none are set) the authors of its books.
export async function seriesAuthors(db: Db, seriesId: string): Promise<{ id: string; name: string }[]> {
  const set = await db.select<{ id: string; name: string }>('SELECT a.id AS id, a.name AS name FROM series_author sa JOIN author a ON a.id = sa.author_id WHERE sa.series_id = ? AND sa.deleted_at IS NULL AND a.deleted_at IS NULL ORDER BY sa.sort_order, sa.created_at, sa.rowid', [seriesId]);
  return set.length ? set : derivedAuthors(db, seriesId);
}

// Before the first change, turn the worked-out authors into real ones so nothing disappears.
async function materializeAuthors(db: Db, seriesId: string) {
  if (await first(db, 'SELECT id FROM series_author WHERE series_id = ? AND deleted_at IS NULL', [seriesId])) return;
  for (const [i, a] of (await derivedAuthors(db, seriesId)).entries()) await db.execute('INSERT INTO series_author (id, series_id, author_id, sort_order) VALUES (?, ?, ?, ?)', [newId(), seriesId, a.id, i]);
}

export async function addSeriesAuthor(db: Db, seriesId: string, who: { id?: string; name?: string }): Promise<void> {
  const authorId = who.id ?? (who.name?.trim() ? await findOrCreateAuthor(db, who.name.trim()) : null);
  if (!authorId) throw new Error('Choose or type an author.');
  await materializeAuthors(db, seriesId);
  if (await first(db, 'SELECT id FROM series_author WHERE series_id = ? AND author_id = ? AND deleted_at IS NULL', [seriesId, authorId])) return;
  const [{ n }] = await db.select<{ n: number }>('SELECT count(*) AS n FROM series_author WHERE series_id = ? AND deleted_at IS NULL', [seriesId]);
  await db.execute('INSERT INTO series_author (id, series_id, author_id, sort_order) VALUES (?, ?, ?, ?)', [newId(), seriesId, authorId, Number(n)]);
}
export async function removeSeriesAuthor(db: Db, seriesId: string, authorId: string): Promise<void> {
  await materializeAuthors(db, seriesId);
  await db.execute("UPDATE series_author SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE series_id = ? AND author_id = ? AND deleted_at IS NULL", [seriesId, authorId]);
}

// A series shows every genre its books have (these follow the books and cannot be removed here) plus any you added to the series yourself.
async function seriesGenres(db: Db, seriesId: string) {
  type G = { id: string; name: string; color: string | null; locked?: boolean };
  const own = await db.select<G>('SELECT g.id AS id, g.name AS name, g.color AS color FROM series_genre sg JOIN genre g ON g.id = sg.genre_id WHERE sg.series_id = ? AND sg.deleted_at IS NULL', [seriesId]);
  const fromBooks = await db.select<G>('SELECT DISTINCT g.id AS id, g.name AS name, g.color AS color FROM book b JOIN book_genre bg ON bg.book_id = b.id AND bg.deleted_at IS NULL JOIN genre g ON g.id = bg.genre_id AND g.deleted_at IS NULL WHERE b.series_id = ? AND b.deleted_at IS NULL', [seriesId]);
  const map = new Map<string, G>(own.map((g) => [g.id, g]));
  for (const g of fromBooks) map.set(g.id, { ...g, locked: true });
  return [...map.values()];
}

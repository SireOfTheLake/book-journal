import { findOrCreatePlace } from './places';
import type { Db, SqlValue } from '../db/adapter';
import { newId } from '../domain/ids';
import { voicesOf } from './voicing';
import { first } from '../import/writer';
import { randomTagColor } from '../domain/colors';
import { PARTNERS_SQL } from './sql';
import { findOrCreateAuthor } from './books';
import { sortGenres } from '../domain/genres';

export type Status = 'tbr' | 'up_next' | 'reading' | 'finished' | 'on_hold' | 'dnf';
export type TagTable = 'genre' | 'theme' | 'trope' | 'mood' | 'pace' | 'content_warning';
// Things a book can have several of; places (settings) share the same join-table shape.
export type BookListTable = TagTable | 'place';
export interface Item { id: string; name: string; color?: string | null }

export interface BookRow {
  id: string; title: string; synopsis: string | null; page_count: number | null;
  pov: 'single' | 'dual' | 'multi' | null; perspective: '1st' | '2nd' | '3rd' | null; heat_level: number | null;
  time_period_id: string | null; time_period_detail: string | null; setting_text: string | null;
  original_publication_date: string | null; is_favorite: number; shelf: 'tbr' | 'up_next' | null;
  series_id: string | null; series_position: number | null; universe_id: string | null; cover_image_id: string | null;
  own_physical?: number; own_ebook?: number; recommended_by?: string | null;
  own_audio?: number; // 1 = you own that format
  is_draft?: number; // 1 = a blank page made by the Prompt Randomizer, waiting for a book
}
export interface ReadRow {
  id: string; status: 'reading' | 'finished' | 'on_hold' | 'dnf'; start_date: string | null; finish_date: string | null;
  finish_time: string | null; rating: number | null; format: 'physical' | 'audio' | 'ebook' | null; source_id: string | null;
  audio_length_seconds: number | null; narration_style: 'solo' | 'dual' | 'duet' | 'full_cast' | 'immersive' | null;
  notes: string | null; color_index: number | null; year_number: number | null;
  stopped_reason?: string | null; stopped_where?: string | null;
}
export interface LogCharacter {
  id: string; bc_id: string; name: string; origin: string | null; role: 'main' | 'side'; gender: string | null;
  age_min: number | null; age_max: number | null; occupations: string | null; partners: string | null;
}
export interface LogNarrator { id: string; narrator_id: string; name: string; accent_id: string | null; accent: string | null; rating: 'up' | 'neutral' | 'down' | null; voiced: string | null; chars?: { id: string; name: string }[] }
export interface DayEntry { id: string; entry_date: string; position_page: number | null; position_percent: number | null; position_seconds: number | null; text: string | null }

export interface LogPlace extends Item { city: string | null; area: string | null; country: string | null; fictional: boolean; needsUpdate: boolean }
export interface SeriesStep { id: string; title: string }
export interface BookLog {
  book: BookRow;
  seriesNav: { prev: SeriesStep | null; next: SeriesStep | null }; // the books either side of this one in its series, novellas included
  cover: string | null; // the cover picture, if one has been added
  authors: Item[];
  series: { id: string; title: string; total_books: number | null; main_total: number } | null;
  universe: Item | null;
  seriesUniverse: Item | null; // the universe the series is in, shown when the book has none of its own
  places: LogPlace[];
  genres: Item[]; themes: Item[]; tropes: Item[];
  moods: Item[]; paces: Item[]; warnings: Item[];
  characters: LogCharacter[];
  makeup: string | null; bucket: string | null;
  reads: ReadRow[];
  read: ReadRow | null;
  narrators: LogNarrator[];
  entries: DayEntry[];
}

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const nowTime = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

// The books before and after this one in the series, in series order (unnumbered books last). Novellas are in the order too.
async function seriesNav(db: Db, book: BookRow): Promise<BookLog['seriesNav']> {
  if (!book.series_id) return { prev: null, next: null };
  const all = await db.select<SeriesStep>('SELECT id, title FROM book WHERE series_id = ? AND deleted_at IS NULL ORDER BY series_position IS NULL, series_position, rowid', [book.series_id]);
  const i = all.findIndex((b) => b.id === book.id);
  return { prev: i > 0 ? all[i - 1] : null, next: i >= 0 && i < all.length - 1 ? all[i + 1] : null };
}

export async function getBookLog(db: Db, bookId: string, readId?: string | null): Promise<BookLog | null> {
  const [book] = await db.select<BookRow>('SELECT * FROM book WHERE id = ? AND deleted_at IS NULL', [bookId]);
  if (!book) return null;
  if (book.shelf === 'up_next' && !book.is_draft) await ensurePlannedRead(db, bookId); // books put on Up Next before this existed get their read now
  const items = (sql: string) => db.select<Item>(sql, [bookId]);
  const tag = (t: TagTable) => items(`SELECT x.id AS id, x.name AS name, x.color AS color FROM book_${t} j JOIN ${t} x ON x.id = j.${t}_id WHERE j.book_id = ? AND j.deleted_at IS NULL ORDER BY CASE WHEN lower(x.name) LIKE \'the %\' THEN lower(substr(x.name, 5)) ELSE lower(x.name) END`);
  const [seriesRow] = book.series_id ? await db.select<{ id: string; title: string; total_books: number | null }>('SELECT id, title, total_books FROM series WHERE id = ?', [book.series_id]) : [];
  // The series length counts the numbered books only; novellas (fractional positions) are extra.
  const [{ n: numbered }] = book.series_id ? await db.select<{ n: number }>('SELECT count(*) AS n FROM book WHERE series_id = ? AND deleted_at IS NULL AND (series_position IS NULL OR series_position = CAST(series_position AS INTEGER))', [book.series_id]) : [{ n: 0 }];
  const series = seriesRow ? { ...seriesRow, main_total: Math.max(seriesRow.total_books ?? 0, Number(numbered)) } : undefined;
  const [universe] = book.universe_id ? await db.select<Item>('SELECT id, name FROM universe WHERE id = ?', [book.universe_id]) : [];
  const [seriesUniverse] = seriesRow ? await db.select<Item>('SELECT u.id AS id, u.name AS name FROM series s JOIN universe u ON u.id = s.universe_id AND u.deleted_at IS NULL WHERE s.id = ?', [seriesRow.id]) : [];
  const places: LogPlace[] = (await db.select<{ id: string; name: string; city: string | null; area: string | null; country: string | null; fictional: number; needs: number }>(
    'SELECT x.id AS id, x.name AS name, x.city AS city, x.state_region AS area, x.country AS country, x.is_fictional AS fictional, (x.located = 0 AND x.is_fictional = 0) AS needs FROM book_place j JOIN place x ON x.id = j.place_id WHERE j.book_id = ? AND j.deleted_at IS NULL AND x.deleted_at IS NULL ORDER BY j.sort_order, j.rowid', [bookId]))
    .map((r) => ({ id: r.id, name: r.name, city: r.city, area: r.area, country: r.country, fictional: !!r.fictional, needsUpdate: !!r.needs }));
  const [mk] = await db.select<{ makeup: string | null; dashboard_bucket: string }>('SELECT makeup, dashboard_bucket FROM v_book_bucket WHERE book_id = ?', [bookId]);
  const reads = await db.select<ReadRow>(
    `SELECT r.id, r.status, r.start_date, r.finish_date, r.finish_time, r.rating, r.format, r.source_id, r.audio_length_seconds, r.narration_style, r.notes, r.stopped_reason, r.stopped_where, r.color_index, n.year_number
     FROM read r LEFT JOIN v_read_year_number n ON n.read_id = r.id WHERE r.book_id = ? AND r.deleted_at IS NULL
     ORDER BY COALESCE(r.finish_date, '9999'), r.rowid`, [bookId]);
  const read = reads.find((r) => r.id === readId) ?? reads[reads.length - 1] ?? null;
  const narrators = read ? await db.select<LogNarrator>(
    `SELECT rn.id, rn.narrator_id, n.name, rn.accent_id, a.name AS accent, rn.rating,
       (SELECT group_concat(c.name, ', ') FROM read_narrator_character rnc JOIN character c ON c.id = rnc.character_id WHERE rnc.read_narrator_id = rn.id AND rnc.deleted_at IS NULL) AS voiced
     FROM read_narrator rn JOIN narrator n ON n.id = rn.narrator_id LEFT JOIN accent a ON a.id = rn.accent_id
     WHERE rn.read_id = ? AND rn.deleted_at IS NULL ORDER BY rn.sort_order`, [read.id]) : [];
  for (const n of narrators) n.chars = await voicesOf(db, n.id);
  const entries = read ? await db.select<DayEntry>('SELECT id, entry_date, position_page, position_percent, position_seconds, text FROM day_entry WHERE read_id = ? AND deleted_at IS NULL ORDER BY entry_date', [read.id]) : [];
  const [coverRow] = book.cover_image_id ? await db.select<{ cover: string }>('SELECT file_path AS cover FROM image WHERE id = ? AND deleted_at IS NULL', [book.cover_image_id]) : [];
  return {
    book,
    cover: coverRow?.cover ?? null,
    authors: await items('SELECT a.id AS id, a.name AS name FROM book_author ba JOIN author a ON a.id = ba.author_id WHERE ba.book_id = ? AND ba.deleted_at IS NULL ORDER BY ba.sort_order'),
    seriesNav: await seriesNav(db, book),
    series: series ?? null, universe: universe ?? null, seriesUniverse: seriesUniverse ?? null, places,
    genres: sortGenres(await tag('genre')), themes: await tag('theme'), tropes: await tag('trope'),
    moods: await tag('mood'), paces: await tag('pace'), warnings: await tag('content_warning'),
    characters: await db.select<LogCharacter>(
      `SELECT c.id, bc.id AS bc_id, c.name, c.origin_note AS origin, bc.role, c.gender, c.age_min, c.age_max,
         (SELECT group_concat(o.name, ', ') FROM character_occupation co JOIN occupation o ON o.id = co.occupation_id WHERE co.character_id = c.id AND co.deleted_at IS NULL) AS occupations,
         ${PARTNERS_SQL} AS partners
       FROM book_character bc JOIN character c ON c.id = bc.character_id WHERE bc.book_id = ? AND bc.deleted_at IS NULL AND c.deleted_at IS NULL ORDER BY bc.role, bc.sort_order`, [bookId]),
    makeup: mk?.makeup ?? null, bucket: mk?.dashboard_bucket ?? null,
    reads, read, narrators, entries,
  };
}

export const listItems = (db: Db, table: 'source' | 'time_period' | 'accent' | 'place') =>
  db.select<Item>(`SELECT id, name FROM ${table} WHERE deleted_at IS NULL ORDER BY CASE WHEN lower(name) LIKE \'the %\' THEN lower(substr(name, 5)) ELSE lower(name) END`);

// ---------- editing ----------
const BOOK_COLS = new Set(['title', 'synopsis', 'page_count', 'pov', 'perspective', 'heat_level', 'time_period_id', 'time_period_detail', 'setting_text', 'original_publication_date', 'is_favorite', 'series_position', 'own_physical', 'own_ebook', 'own_audio', 'recommended_by']);
const READ_COLS = new Set(['status', 'start_date', 'finish_date', 'finish_time', 'rating', 'format', 'source_id', 'audio_length_seconds', 'narration_style', 'notes', 'stopped_reason', 'stopped_where']);

async function patch(db: Db, table: 'book' | 'read', allowed: Set<string>, id: string, fields: Record<string, SqlValue>) {
  const cols = Object.keys(fields).filter((c) => allowed.has(c));
  if (!cols.length) return;
  await db.execute(`UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [...cols.map((c) => fields[c]), id]);
}

export const updateBook = (db: Db, id: string, fields: Record<string, SqlValue>) => patch(db, 'book', BOOK_COLS, id, fields);

export async function updateRead(db: Db, id: string, fields: Record<string, SqlValue>) {
  const [cur] = await db.select<{ start_date: string | null; finish_date: string | null }>('SELECT start_date, finish_date FROM read WHERE id = ?', [id]);
  const f = { ...fields };
  // Starting or finishing fills in today's date, and finishing also saves the time (it orders same-day finishes).
  if (f.status === 'reading' && !cur.start_date && f.start_date === undefined) f.start_date = today();
  if (f.status === 'finished' && !cur.finish_date && f.finish_date === undefined) { f.finish_date = today(); f.finish_time = nowTime(); }
  await patch(db, 'read', READ_COLS, id, f);
}

export async function createRead(db: Db, bookId: string, status: ReadRow['status'] = 'reading'): Promise<string> {
  const [{ n }] = await db.select<{ n: number }>('SELECT count(*) AS n FROM read WHERE deleted_at IS NULL');
  const id = newId();
  await db.execute('INSERT INTO read (id, book_id, status, color_index) VALUES (?, ?, ?, ?)', [id, bookId, 'reading', Number(n) % 10]);
  // Narrators on the book are the starting point for this listen.
  const defaults = await db.select<{ narrator_id: string; sort_order: number }>('SELECT narrator_id, sort_order FROM book_narrator WHERE book_id = ? AND deleted_at IS NULL ORDER BY sort_order', [bookId]);
  for (const d of defaults) await db.execute('INSERT INTO read_narrator (id, read_id, narrator_id, sort_order) VALUES (?, ?, ?, ?)', [newId(), id, d.narrator_id, d.sort_order]);
  await updateRead(db, id, { status });
  return id;
}

// Removes one read: its rating, notes, narrators, daily log and any bracket or challenge picks go with it.
// The book and its other reads stay. Returns the read to show next (the latest one left), if any.
export async function deleteRead(db: Db, readId: string): Promise<{ bookId: string; nextReadId: string | null }> {
  const [r] = await db.select<{ book_id: string }>('SELECT book_id FROM read WHERE id = ? AND deleted_at IS NULL', [readId]);
  if (!r) throw new Error('That read has already been deleted.');
  await db.execute(`UPDATE read_narrator_character SET deleted_at = ${NOW} WHERE deleted_at IS NULL AND read_narrator_id IN (SELECT id FROM read_narrator WHERE read_id = ?)`, [readId]);
  for (const t of ['read_narrator', 'day_entry', 'challenge_completion', 'bracket_pick']) await db.execute(`UPDATE ${t} SET deleted_at = ${NOW} WHERE read_id = ? AND deleted_at IS NULL`, [readId]);
  await db.execute(`UPDATE read SET deleted_at = ${NOW} WHERE id = ?`, [readId]);
  const left = await db.select<{ id: string }>("SELECT id FROM read WHERE book_id = ? AND deleted_at IS NULL ORDER BY COALESCE(finish_date, '9999') DESC, rowid DESC", [r.book_id]);
  return { bookId: r.book_id, nextReadId: left[0]?.id ?? null };
}

// Removes a whole book: every read (with its rating, notes, daily log and challenge picks), its tags, authors, characters, places and release dates.
// Authors, characters, series and the like stay as records of their own.
export async function deleteBook(db: Db, bookId: string): Promise<void> {
  const [b] = await db.select<{ id: string }>('SELECT id FROM book WHERE id = ? AND deleted_at IS NULL', [bookId]);
  if (!b) throw new Error('That book has already been deleted.');
  for (const r of await db.select<{ id: string }>('SELECT id FROM read WHERE book_id = ? AND deleted_at IS NULL', [bookId])) await deleteRead(db, r.id);
  for (const t of ['book_author', 'book_narrator', 'book_genre', 'book_theme', 'book_trope', 'book_mood', 'book_pace', 'book_content_warning', 'book_character', 'book_place', 'format_release']) {
    await db.execute(`UPDATE ${t} SET deleted_at = ${NOW} WHERE book_id = ? AND deleted_at IS NULL`, [bookId]);
  }
  await db.execute(`UPDATE book SET deleted_at = ${NOW}, shelf = NULL, tbr_priority = NULL WHERE id = ?`, [bookId]);
}

// One status control for both shelves (stored on the book) and reading states (stored on the read).
// An Up Next book carries a "planned" read: a paused read with no dates, so the Why I'm Reading This, Format and Source cards have somewhere to live.
// Starting the book turns that same read into the real one; moving the book back to TBR deletes it.
export async function plannedReadId(db: Db, bookId: string): Promise<string | null> {
  return first(db, "SELECT id FROM read WHERE book_id = ? AND status = 'on_hold' AND start_date IS NULL AND finish_date IS NULL AND deleted_at IS NULL ORDER BY rowid LIMIT 1", [bookId]);
}
export async function ensurePlannedRead(db: Db, bookId: string): Promise<string> {
  const open = await first(db, "SELECT id FROM read WHERE book_id = ? AND status IN ('reading', 'on_hold') AND deleted_at IS NULL ORDER BY rowid LIMIT 1", [bookId]);
  return open ?? createRead(db, bookId, 'on_hold');
}
export async function dropPlannedReads(db: Db, bookId: string): Promise<void> {
  for (const r of await db.select<{ id: string }>("SELECT id FROM read WHERE book_id = ? AND status = 'on_hold' AND start_date IS NULL AND finish_date IS NULL AND deleted_at IS NULL", [bookId])) await deleteRead(db, r.id);
}

export async function setStatus(db: Db, bookId: string, readId: string | null, status: Status): Promise<string | null> {
  if (status === 'tbr' || status === 'up_next') {
    const [{ m }] = await db.select<{ m: number | null }>('SELECT max(tbr_priority) AS m FROM book WHERE shelf IS NOT NULL AND deleted_at IS NULL');
    const [was] = await db.select<{ shelf: string | null }>('SELECT shelf FROM book WHERE id = ?', [bookId]);
    await db.execute('UPDATE book SET shelf = ?, tbr_priority = coalesce(tbr_priority, ?) WHERE id = ?', [status, (m ?? 0) + 1, bookId]);
    // Already planned for Up Next: nothing to redo, and what you entered on the read stays.
    if (status === 'up_next' && was?.shelf === 'up_next' && (await plannedReadId(db, bookId))) return readId;
    // Moving a book back to a shelf means it is no longer being read, so a read that was started but not
    // finished (reading or paused) is dropped. Finished reads, and DNF reads, are history and stay.
    const open = await db.select<{ id: string }>("SELECT id FROM read WHERE book_id = ? AND status IN ('reading', 'on_hold') AND deleted_at IS NULL", [bookId]);
    for (const r of open) await deleteRead(db, r.id);
    if (status === 'up_next') return createRead(db, bookId, 'on_hold');
    return open.some((r) => r.id === readId) ? null : readId;
  }
  const planned = readId ? null : await plannedReadId(db, bookId);
  await db.execute('UPDATE book SET shelf = NULL, tbr_priority = NULL WHERE id = ?', [bookId]);
  const id = readId ?? planned ?? (await createRead(db, bookId, status));
  if (readId || planned) await updateRead(db, id, { status });
  return id;
}

async function findOrCreateItem(db: Db, table: BookListTable | 'accent' | 'source' | 'time_period', name: string): Promise<string> {
  const id = await first(db, `SELECT id FROM ${table} WHERE lower(name) = lower(?) AND deleted_at IS NULL LIMIT 1`, [name.trim()]);
  if (id) return id;
  const nid = newId();
  if (table === 'genre' || table === 'theme' || table === 'trope' || table === 'mood' || table === 'pace' || table === 'content_warning') await db.execute(`INSERT INTO ${table} (id, name, color) VALUES (?, ?, ?)`, [nid, name.trim(), randomTagColor()]);
  else await db.execute(`INSERT INTO ${table} (id, name) VALUES (?, ?)`, [nid, name.trim()]);
  return nid;
}

export async function addTag(db: Db, bookId: string, table: BookListTable, name: string) {
  if (!name.trim()) return;
  const tagId = table === 'place' ? await findOrCreatePlace(db, name) : await findOrCreateItem(db, table, name);
  if (await first(db, `SELECT id FROM book_${table} WHERE book_id = ? AND ${table}_id = ? AND deleted_at IS NULL`, [bookId, tagId])) return;
  await db.execute(`INSERT INTO book_${table} (id, book_id, ${table}_id) VALUES (?, ?, ?)`, [newId(), bookId, tagId]);
}

export const removeTag = (db: Db, bookId: string, table: BookListTable, tagId: string) =>
  db.execute(`UPDATE book_${table} SET deleted_at = ${NOW} WHERE book_id = ? AND ${table}_id = ? AND deleted_at IS NULL`, [bookId, tagId]);

export const setNarratorRating = (db: Db, readNarratorId: string, rating: 'up' | 'neutral' | 'down' | null) =>
  db.execute('UPDATE read_narrator SET rating = ? WHERE id = ?', [rating, readNarratorId]);

export async function setNarratorAccent(db: Db, readNarratorId: string, accent: string | null) {
  await db.execute('UPDATE read_narrator SET accent_id = ? WHERE id = ?', [accent?.trim() ? await findOrCreateItem(db, 'accent', accent) : null, readNarratorId]);
}

export async function saveDayEntry(db: Db, readId: string, e: { date: string; page?: number | null; percent?: number | null; seconds?: number | null; text?: string | null }) {
  const existing = await first(db, 'SELECT id FROM day_entry WHERE read_id = ? AND entry_date = ? AND deleted_at IS NULL', [readId, e.date]);
  const vals = [e.page ?? null, e.percent ?? null, e.seconds ?? null, e.text?.trim() || null];
  if (existing) await db.execute('UPDATE day_entry SET position_page = ?, position_percent = ?, position_seconds = ?, text = ? WHERE id = ?', [...vals, existing]);
  else await db.execute('INSERT INTO day_entry (id, read_id, entry_date, position_page, position_percent, position_seconds, text) VALUES (?, ?, ?, ?, ?, ?, ?)', [newId(), readId, e.date, ...vals]);
}

export const deleteDayEntry = (db: Db, id: string) => db.execute(`UPDATE day_entry SET deleted_at = ${NOW} WHERE id = ?`, [id]);

export async function addPlace(db: Db, p: { name: string; state?: string; country?: string; fictional?: boolean }): Promise<string> {
  const id = newId();
  await db.execute('INSERT INTO place (id, name, state_region, country, is_fictional) VALUES (?, ?, ?, ?, ?)', [id, p.name.trim(), p.state?.trim() || null, p.country?.trim() || null, p.fictional ? 1 : 0]);
  return id;
}

// The "+ New book" quick add: a title is enough. Returns where to go next.
export async function quickAdd(db: Db, input: { title: string; authors: string[]; status: Status }): Promise<{ bookId: string; readId: string | null }> {
  const { createBook } = await import('./books');
  const bookId = await createBook(db, { title: input.title, authors: input.authors, shelf: input.status === 'tbr' || input.status === 'up_next' ? input.status : null });
  if (input.status === 'up_next') await ensurePlannedRead(db, bookId);
  if (input.status === 'tbr' || input.status === 'up_next') return { bookId, readId: null };
  return { bookId, readId: await createRead(db, bookId, input.status) };
}

export const createListItem = (db: Db, table: 'source' | 'time_period', name: string) => findOrCreateItem(db, table, name);

// Every genre, theme, or trope you have, for the type-ahead list.
export const listTagOptions = async (db: Db, table: TagTable) => {
  const rows = await db.select<Item>(`SELECT id, name, color FROM ${table} WHERE deleted_at IS NULL ORDER BY CASE WHEN lower(name) LIKE \'the %\' THEN lower(substr(name, 5)) ELSE lower(name) END`);
  return table === 'genre' ? sortGenres(rows) : rows;
};

// Renames a tag everywhere it is used (for example "sports" to "Sports").
export async function renameTag(db: Db, table: BookListTable, id: string, name: string) {
  const next = name.trim();
  if (!next) throw new Error('A name cannot be empty.');
  const clash = await first(db, `SELECT id FROM ${table} WHERE lower(name) = lower(?) AND id != ? AND deleted_at IS NULL`, [next, id]);
  if (clash) throw new Error(`There is already a ${table} called "${next}".`);
  await db.execute(`UPDATE ${table} SET name = ? WHERE id = ?`, [next, id]);
}

// ---------- previous and next book ----------
export interface Neighbor { book_id: string; read_id: string; title: string }
export interface Neighbors { prev: Neighbor | null; next: Neighbor | null }

// The books finished just before and just after this read, in finish order. A book that is not finished yet
// has the most recently finished book as its previous one, and no next one.
export async function getNeighbors(db: Db, readId: string | null): Promise<Neighbors> {
  if (!readId) return { prev: null, next: null };
  const [cur] = await db.select<{ status: string; finish_date: string | null; ft: string; rid: number }>("SELECT status, finish_date, COALESCE(finish_time, '') AS ft, rowid AS rid FROM read WHERE id = ?", [readId]);
  if (!cur) return { prev: null, next: null };
  const base = `SELECT r.id AS read_id, b.id AS book_id, b.title AS title FROM read r JOIN book b ON b.id = r.book_id
    WHERE r.deleted_at IS NULL AND b.deleted_at IS NULL AND r.status = 'finished' AND r.finish_date IS NOT NULL`;
  const key = "(r.finish_date, COALESCE(r.finish_time, ''), r.rowid)";
  if (cur.status !== 'finished' || !cur.finish_date) {
    return { prev: (await db.select<Neighbor>(`${base} ORDER BY r.finish_date DESC, COALESCE(r.finish_time, '') DESC, r.rowid DESC LIMIT 1`))[0] ?? null, next: null };
  }
  const args = [cur.finish_date, cur.ft, cur.rid];
  return {
    prev: (await db.select<Neighbor>(`${base} AND ${key} < (?, ?, ?) ORDER BY r.finish_date DESC, COALESCE(r.finish_time, '') DESC, r.rowid DESC LIMIT 1`, args))[0] ?? null,
    next: (await db.select<Neighbor>(`${base} AND ${key} > (?, ?, ?) ORDER BY r.finish_date, COALESCE(r.finish_time, ''), r.rowid LIMIT 1`, args))[0] ?? null,
  };
}

// ---------- authors on a book ----------
export const listAuthorOptions = (db: Db) => db.select<Item>('SELECT id, name FROM author WHERE deleted_at IS NULL ORDER BY CASE WHEN lower(name) LIKE \'the %\' THEN lower(substr(name, 5)) ELSE lower(name) END');

export async function addBookAuthor(db: Db, bookId: string, who: { id?: string; name?: string }): Promise<void> {
  const authorId = who.id ?? (who.name?.trim() ? await findOrCreateAuthor(db, who.name.trim()) : null);
  if (!authorId) throw new Error('Choose or type an author.');
  if (await first(db, 'SELECT id FROM book_author WHERE book_id = ? AND author_id = ? AND deleted_at IS NULL', [bookId, authorId])) return;
  const [{ n }] = await db.select<{ n: number }>('SELECT count(*) AS n FROM book_author WHERE book_id = ? AND deleted_at IS NULL', [bookId]);
  await db.execute('INSERT INTO book_author (id, book_id, author_id, sort_order) VALUES (?, ?, ?, ?)', [newId(), bookId, authorId, Number(n)]);
}
export const removeBookAuthor = (db: Db, bookId: string, authorId: string) =>
  db.execute(`UPDATE book_author SET deleted_at = ${NOW} WHERE book_id = ? AND author_id = ? AND deleted_at IS NULL`, [bookId, authorId]);

// ---------- narrators on a book ----------
export const listNarratorOptions = (db: Db) => db.select<Item>('SELECT id, name FROM narrator WHERE deleted_at IS NULL ORDER BY CASE WHEN lower(name) LIKE \'the %\' THEN lower(substr(name, 5)) ELSE lower(name) END');

export async function createNarrator(db: Db, name: string): Promise<string> {
  const n = name.trim();
  if (!n) throw new Error('A narrator needs a name.');
  const existing = await first(db, 'SELECT id FROM narrator WHERE lower(name) = lower(?) AND deleted_at IS NULL', [n]);
  if (existing) return existing;
  const id = newId();
  await db.execute('INSERT INTO narrator (id, name) VALUES (?, ?)', [id, n]);
  return id;
}

// Adds a narrator to this read, and to the book's usual narrators so the next read starts with them.
export async function addNarratorToRead(db: Db, readId: string, narratorId: string): Promise<void> {
  const [r] = await db.select<{ book_id: string }>('SELECT book_id FROM read WHERE id = ?', [readId]);
  if (!r) throw new Error('That read could not be found.');
  if (!(await first(db, 'SELECT id FROM read_narrator WHERE read_id = ? AND narrator_id = ? AND deleted_at IS NULL', [readId, narratorId]))) {
    const [{ n }] = await db.select<{ n: number }>('SELECT count(*) AS n FROM read_narrator WHERE read_id = ? AND deleted_at IS NULL', [readId]);
    await db.execute('INSERT INTO read_narrator (id, read_id, narrator_id, sort_order) VALUES (?, ?, ?, ?)', [newId(), readId, narratorId, Number(n)]);
  }
  await ensureBookNarrator(db, r.book_id, narratorId);
}
export async function ensureBookNarrator(db: Db, bookId: string, narratorId: string): Promise<void> {
  if (await first(db, 'SELECT id FROM book_narrator WHERE book_id = ? AND narrator_id = ? AND deleted_at IS NULL', [bookId, narratorId])) return;
  const [{ n }] = await db.select<{ n: number }>('SELECT count(*) AS n FROM book_narrator WHERE book_id = ? AND deleted_at IS NULL', [bookId]);
  await db.execute('INSERT INTO book_narrator (id, book_id, narrator_id, sort_order) VALUES (?, ?, ?, ?)', [newId(), bookId, narratorId, Number(n)]);
}

// Removes a narrator from this read. If no other read of the book uses them, they stop being a usual narrator too.
export async function removeNarratorFromRead(db: Db, readNarratorId: string): Promise<void> {
  const [rn] = await db.select<{ narrator_id: string; read_id: string; book_id: string }>('SELECT rn.narrator_id AS narrator_id, rn.read_id AS read_id, r.book_id AS book_id FROM read_narrator rn JOIN read r ON r.id = rn.read_id WHERE rn.id = ?', [readNarratorId]);
  if (!rn) return;
  await db.execute(`UPDATE read_narrator SET deleted_at = ${NOW} WHERE id = ?`, [readNarratorId]);
  const stillUsed = await first(db, 'SELECT rn.id FROM read_narrator rn JOIN read r ON r.id = rn.read_id WHERE r.book_id = ? AND rn.narrator_id = ? AND rn.deleted_at IS NULL AND r.deleted_at IS NULL', [rn.book_id, rn.narrator_id]);
  if (!stillUsed) await db.execute(`UPDATE book_narrator SET deleted_at = ${NOW} WHERE book_id = ? AND narrator_id = ? AND deleted_at IS NULL`, [rn.book_id, rn.narrator_id]);
}

// ---------- covers ----------
export async function setBookCover(db: Db, bookId: string, img: { dataUrl: string; width?: number; height?: number; mime?: string }): Promise<void> {
  const imageId = newId();
  await db.execute('INSERT INTO image (id, file_path, mime_type, width, height) VALUES (?, ?, ?, ?, ?)', [imageId, img.dataUrl, img.mime ?? null, img.width ?? null, img.height ?? null]);
  await removeBookCover(db, bookId);
  await db.execute('UPDATE book SET cover_image_id = ? WHERE id = ?', [imageId, bookId]);
}
export async function removeBookCover(db: Db, bookId: string): Promise<void> {
  const [b] = await db.select<{ cover_image_id: string | null }>('SELECT cover_image_id FROM book WHERE id = ?', [bookId]);
  if (b?.cover_image_id) await db.execute(`UPDATE image SET deleted_at = ${NOW} WHERE id = ?`, [b.cover_image_id]);
  await db.execute('UPDATE book SET cover_image_id = NULL WHERE id = ?', [bookId]);
}

// ---------- reads in progress (for the Daily Log) ----------
export interface InProgressRead { read_id: string; book_id: string; title: string; authors: string | null; start_date: string | null }
export const listInProgressReads = (db: Db) => db.select<InProgressRead>(
  `SELECT r.id AS read_id, b.id AS book_id, b.title AS title, r.start_date AS start_date,
     (SELECT group_concat(x.name, ', ') FROM (SELECT au.name AS name FROM book_author ba JOIN author au ON au.id = ba.author_id WHERE ba.book_id = b.id AND ba.deleted_at IS NULL ORDER BY ba.sort_order) x) AS authors
   FROM read r JOIN book b ON b.id = r.book_id WHERE r.deleted_at IS NULL AND b.deleted_at IS NULL AND r.status = 'reading' ORDER BY r.start_date DESC, r.rowid DESC`);

// ---------- time periods ----------
export const RECENT_DECADES = ['1950s', '1960s', '1970s', '1980s', '1990s', '2000s', '2010s'];
// Taking a period off the list: books that used it simply have no period any more.
export async function removeTimePeriod(db: Db, id: string) {
  await db.execute("UPDATE book SET time_period_id = NULL, time_period_detail = NULL WHERE time_period_id = ?", [id]);
  await db.execute("UPDATE time_period SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND deleted_at IS NULL", [id]);
}

// Renaming or removing an entry in a simple list (time period, source). Removing clears it from whatever used it.
export async function renameListItem(db: Db, table: 'source' | 'time_period', id: string, name: string) {
  const n = name.trim();
  if (!n) return;
  const clash = await first(db, `SELECT id FROM ${table} WHERE lower(name) = lower(?) AND id <> ? AND deleted_at IS NULL`, [n, id]);
  if (clash) throw new Error(`There is already one called "${n}".`);
  await db.execute(`UPDATE ${table} SET name = ? WHERE id = ?`, [n, id]);
}
export async function removeSource(db: Db, id: string) {
  await db.execute('UPDATE read SET source_id = NULL WHERE source_id = ?', [id]);
  await db.execute(`UPDATE source SET deleted_at = ${NOW} WHERE id = ? AND deleted_at IS NULL`, [id]);
}

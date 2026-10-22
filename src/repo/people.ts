import { bookCharacters, voicesOf, type Voice } from './voicing';
import type { Db, SqlValue } from '../db/adapter';
import { newId } from '../domain/ids';
import { first } from '../import/writer';
import type { Item } from './bookLog';

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
export type PersonKind = 'author' | 'narrator';
export interface LinkRef { label: string; url: string }
export interface Counted { id: string; name: string; n: number; color?: string | null }

// ---------- shared: photo, aliases, links ----------
interface PersonCore { id: string; name: string; sort_name: string | null; is_favorite: number; notes: string | null; links: LinkRef[]; photo: string | null }

async function core(db: Db, kind: PersonKind, id: string): Promise<PersonCore | null> {
  const [r] = await db.select<{ id: string; name: string; sort_name: string | null; is_favorite: number; notes: string | null; links: string | null; photo: string | null }>(
    `SELECT p.id, p.name, p.sort_name, p.is_favorite, p.notes, p.links, (SELECT i.file_path FROM image i WHERE i.id = p.photo_image_id AND i.deleted_at IS NULL) AS photo
     FROM ${kind} p WHERE p.id = ? AND p.deleted_at IS NULL`, [id]);
  if (!r) return null;
  let links: LinkRef[] = [];
  try { links = r.links ? (JSON.parse(r.links) as LinkRef[]) : []; } catch { links = []; }
  return { ...r, links };
}

const COLS = new Set(['name', 'sort_name', 'is_favorite', 'notes']);
export async function updatePerson(db: Db, kind: PersonKind, id: string, fields: Record<string, SqlValue>) {
  const cols = Object.keys(fields).filter((c) => COLS.has(c));
  if (cols.length) await db.execute(`UPDATE ${kind} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [...cols.map((c) => fields[c]), id]);
}
export async function addAlias(db: Db, kind: PersonKind, id: string, name: string) {
  const n = name.trim();
  if (!n) return;
  if (await first(db, `SELECT id FROM ${kind}_alias WHERE ${kind}_id = ? AND lower(name) = lower(?) AND deleted_at IS NULL`, [id, n])) return;
  await db.execute(`INSERT INTO ${kind}_alias (id, ${kind}_id, name) VALUES (?, ?, ?)`, [newId(), id, n]);
}
export const removeAlias = (db: Db, kind: PersonKind, aliasId: string) => db.execute(`UPDATE ${kind}_alias SET deleted_at = ${NOW} WHERE id = ?`, [aliasId]);
export const listAliases = (db: Db, kind: PersonKind, id: string) => db.select<Item>(`SELECT id, name FROM ${kind}_alias WHERE ${kind}_id = ? AND deleted_at IS NULL ORDER BY created_at, rowid`, [id]);

export async function addLink(db: Db, kind: PersonKind, id: string, label: string, url: string) {
  if (!url.trim()) throw new Error('Type the address of the link.');
  const c = await core(db, kind, id);
  const links = [...(c?.links ?? []), { label: label.trim() || url.trim(), url: url.trim() }];
  await db.execute(`UPDATE ${kind} SET links = ? WHERE id = ?`, [JSON.stringify(links), id]);
}
export async function updateLink(db: Db, kind: PersonKind, id: string, index: number, label: string, url: string) {
  if (!url.trim()) throw new Error('Type the address of the link.');
  const c = await core(db, kind, id);
  const links = [...(c?.links ?? [])];
  if (!links[index]) throw new Error('That link is no longer there.');
  links[index] = { label: label.trim() || url.trim(), url: url.trim() };
  await db.execute(`UPDATE ${kind} SET links = ? WHERE id = ?`, [JSON.stringify(links), id]);
}
export async function removeLink(db: Db, kind: PersonKind, id: string, index: number) {
  const c = await core(db, kind, id);
  await db.execute(`UPDATE ${kind} SET links = ? WHERE id = ?`, [JSON.stringify((c?.links ?? []).filter((_, i) => i !== index)), id]);
}

// Pictures live inside the database (a data URL in image.file_path), already shrunk by the screen.
export async function setPhoto(db: Db, kind: PersonKind, id: string, img: { dataUrl: string; width?: number; height?: number; mime?: string }) {
  const imageId = newId();
  await db.execute('INSERT INTO image (id, file_path, mime_type, width, height) VALUES (?, ?, ?, ?, ?)', [imageId, img.dataUrl, img.mime ?? null, img.width ?? null, img.height ?? null]);
  await removePhoto(db, kind, id);
  await db.execute(`UPDATE ${kind} SET photo_image_id = ? WHERE id = ?`, [imageId, id]);
}
export async function removePhoto(db: Db, kind: PersonKind, id: string) {
  const [r] = await db.select<{ photo_image_id: string | null }>(`SELECT photo_image_id FROM ${kind} WHERE id = ?`, [id]);
  if (r?.photo_image_id) await db.execute(`UPDATE image SET deleted_at = ${NOW} WHERE id = ?`, [r.photo_image_id]);
  await db.execute(`UPDATE ${kind} SET photo_image_id = NULL WHERE id = ?`, [id]);
}

// ---------- the lists ----------
export interface PersonListRow { id: string; name: string; is_favorite: number; books: number; read: number; avg_stars: number | null; extra: number }

export const listAuthors = (db: Db) => db.select<PersonListRow>(
  `SELECT a.id, a.name, a.is_favorite,
     (SELECT count(*) FROM book_author ba JOIN book b ON b.id = ba.book_id WHERE ba.author_id = a.id AND ba.deleted_at IS NULL AND b.deleted_at IS NULL) AS books,
     (SELECT count(*) FROM book_author ba JOIN book b ON b.id = ba.book_id WHERE ba.author_id = a.id AND ba.deleted_at IS NULL AND b.deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM read r WHERE r.book_id = b.id AND r.status = 'finished' AND r.deleted_at IS NULL)) AS read,
     (SELECT avg(v.avg_stars) FROM book_author ba JOIN v_book_rating v ON v.book_id = ba.book_id WHERE ba.author_id = a.id AND ba.deleted_at IS NULL) AS avg_stars,
     (SELECT count(DISTINCT b.series_id) FROM book_author ba JOIN book b ON b.id = ba.book_id WHERE ba.author_id = a.id AND ba.deleted_at IS NULL AND b.series_id IS NOT NULL AND b.deleted_at IS NULL) AS extra
   FROM author a WHERE a.deleted_at IS NULL ORDER BY CASE WHEN lower(a.name) LIKE \'the %\' THEN lower(substr(a.name, 5)) ELSE lower(a.name) END`);

export const listNarrators = (db: Db) => db.select<PersonListRow>(
  `SELECT n.id, n.name, n.is_favorite,
     (SELECT count(*) FROM read_narrator rn JOIN read r ON r.id = rn.read_id WHERE rn.narrator_id = n.id AND rn.deleted_at IS NULL AND r.deleted_at IS NULL AND r.format = 'audio') AS books,
     (SELECT count(*) FROM read_narrator rn JOIN read r ON r.id = rn.read_id WHERE rn.narrator_id = n.id AND rn.deleted_at IS NULL AND r.deleted_at IS NULL AND r.format = 'audio' AND r.status = 'finished') AS read,
     (SELECT avg(CASE rn.rating WHEN 'up' THEN 1.0 WHEN 'neutral' THEN 0.5 WHEN 'down' THEN 0.0 END) FROM read_narrator rn JOIN read r ON r.id = rn.read_id WHERE rn.narrator_id = n.id AND rn.deleted_at IS NULL AND r.deleted_at IS NULL AND r.format = 'audio' AND rn.rating IS NOT NULL) AS avg_stars,
     (SELECT coalesce(sum(r.audio_length_seconds), 0) FROM read_narrator rn JOIN read r ON r.id = rn.read_id WHERE rn.narrator_id = n.id AND rn.deleted_at IS NULL AND r.deleted_at IS NULL AND r.format = 'audio') AS extra
   FROM narrator n WHERE n.deleted_at IS NULL ORDER BY CASE WHEN lower(n.name) LIKE \'the %\' THEN lower(substr(n.name, 5)) ELSE lower(n.name) END`);

// ---------- an author ----------
export interface AuthorBook { id: string; title: string; series: string | null; series_id: string | null; position: number | null; shelf: string | null; is_read: number; finish_date: string | null; format: 'physical' | 'audio' | 'ebook' | null; rating: number | null; read_id: string | null; page_count: number | null }
export interface UpcomingRelease { book_id: string; title: string; format: string; status: 'dated' | 'tba'; release_date: string | null }
export interface AuthorDetail {
  core: PersonCore; aliases: Item[]; books: AuthorBook[]; series: Item[]; coAuthors: Counted[];
  booksRead: number; totalPages: number; avgStars: number | null; ratedBooks: number;
  byFormat: { format: string; stars: number; n: number }[]; genres: Counted[]; tropes: Counted[];
  unread: AuthorBook[]; upcoming: UpcomingRelease[];
}

const tagCounts = (db: Db, kind: 'genre' | 'trope', whereBooks: string, params: SqlValue[]) => db.select<Counted>(
  `SELECT t.id AS id, t.name AS name, t.color AS color, count(DISTINCT b.id) AS n FROM book_${kind} j JOIN ${kind} t ON t.id = j.${kind}_id AND t.deleted_at IS NULL
   JOIN book b ON b.id = j.book_id AND b.deleted_at IS NULL WHERE j.deleted_at IS NULL AND b.id IN (${whereBooks}) GROUP BY t.id ORDER BY n DESC, CASE WHEN lower(t.name) LIKE \'the %\' THEN lower(substr(t.name, 5)) ELSE lower(t.name) END LIMIT 6`, params);

export async function getAuthor(db: Db, id: string): Promise<AuthorDetail | null> {
  const c = await core(db, 'author', id);
  if (!c) return null;
  const books = await db.select<AuthorBook>(
    `SELECT b.id, b.title, b.series_id, (SELECT s.title FROM series s WHERE s.id = b.series_id) AS series, b.series_position AS position, b.shelf, b.page_count,
       EXISTS (SELECT 1 FROM read r WHERE r.book_id = b.id AND r.status = 'finished' AND r.deleted_at IS NULL) AS is_read,
       (SELECT r.finish_date FROM read r WHERE r.book_id = b.id AND r.status = 'finished' AND r.deleted_at IS NULL ORDER BY r.finish_date DESC LIMIT 1) AS finish_date,
       (SELECT r.format FROM read r WHERE r.book_id = b.id AND r.deleted_at IS NULL ORDER BY r.created_at DESC, r.rowid DESC LIMIT 1) AS format,
       (SELECT v.avg_stars FROM v_book_rating v WHERE v.book_id = b.id) AS rating,
       (SELECT r.id FROM read r WHERE r.book_id = b.id AND r.deleted_at IS NULL ORDER BY r.created_at DESC, r.rowid DESC LIMIT 1) AS read_id
     FROM book b JOIN book_author ba ON ba.book_id = b.id AND ba.deleted_at IS NULL WHERE ba.author_id = ? AND b.deleted_at IS NULL
     ORDER BY finish_date IS NULL, finish_date DESC, CASE WHEN lower(b.title) LIKE \'the %\' THEN lower(substr(b.title, 5)) ELSE lower(b.title) END`, [id]);
  const ids = `SELECT ba.book_id FROM book_author ba WHERE ba.author_id = ? AND ba.deleted_at IS NULL`;
  const rated = books.filter((b) => b.rating !== null);
  return {
    core: c,
    aliases: await listAliases(db, 'author', id),
    books,
    series: await db.select<Item>(`SELECT DISTINCT s.id AS id, s.title AS name FROM series s JOIN book b ON b.series_id = s.id AND b.deleted_at IS NULL JOIN book_author ba ON ba.book_id = b.id AND ba.deleted_at IS NULL WHERE ba.author_id = ? AND s.deleted_at IS NULL ORDER BY CASE WHEN lower(s.title) LIKE \'the %\' THEN lower(substr(s.title, 5)) ELSE lower(s.title) END`, [id]),
    coAuthors: await db.select<Counted>(
      `SELECT a.id AS id, a.name AS name, count(*) AS n FROM book_author mine JOIN book_author other ON other.book_id = mine.book_id AND other.author_id != mine.author_id AND other.deleted_at IS NULL
       JOIN author a ON a.id = other.author_id AND a.deleted_at IS NULL WHERE mine.author_id = ? AND mine.deleted_at IS NULL GROUP BY a.id ORDER BY n DESC, CASE WHEN lower(a.name) LIKE \'the %\' THEN lower(substr(a.name, 5)) ELSE lower(a.name) END`, [id]),
    booksRead: books.filter((b) => b.is_read).length,
    totalPages: books.filter((b) => b.is_read).reduce((n, b) => n + (b.page_count ?? 0), 0),
    avgStars: rated.length ? rated.reduce((n, b) => n + b.rating!, 0) / rated.length : null, ratedBooks: rated.length,
    byFormat: await db.select(
      `SELECT r.format AS format, avg(r.rating) / 4.0 AS stars, count(*) AS n FROM read r WHERE r.deleted_at IS NULL AND r.rating IS NOT NULL AND r.format IS NOT NULL AND r.book_id IN (${ids}) GROUP BY r.format ORDER BY r.format`, [id]),
    genres: await tagCounts(db, 'genre', ids, [id]), tropes: await tagCounts(db, 'trope', ids, [id]),
    unread: books.filter((b) => !b.is_read),
    upcoming: await db.select<UpcomingRelease>(
      `SELECT f.book_id AS book_id, b.title AS title, f.format AS format, f.status AS status, f.release_date AS release_date FROM format_release f JOIN book b ON b.id = f.book_id AND b.deleted_at IS NULL
       WHERE f.deleted_at IS NULL AND f.book_id IN (${ids}) AND (f.status = 'tba' OR f.release_date > date('now')) ORDER BY f.release_date IS NULL, f.release_date, CASE WHEN lower(b.title) LIKE \'the %\' THEN lower(substr(b.title, 5)) ELSE lower(b.title) END`, [id]),
  };
}

// ---------- a narrator ----------
export interface Listen { rn_id: string; read_id: string; book_id: string; title: string; finish_date: string | null; status: string; narration_style: string | null; audio_length_seconds: number | null; accent: string | null; rating: 'up' | 'neutral' | 'down' | null; voiced: string | null; chars: Voice[]; options: Voice[] }
export interface NarratorDetail {
  core: PersonCore; aliases: Item[]; usualAccents: Item[]; listens: Listen[];
  totalSeconds: number; tally: { up: number; neutral: number; down: number; unrated: number };
  coNarrators: Counted[]; voiced: { id: string; name: string; book: string }[]; commonAccents: Counted[];
  genres: Counted[]; tropes: Counted[]; notListened: { id: string; title: string }[];
}
const LISTEN = `rn.narrator_id = ? AND rn.deleted_at IS NULL AND r.deleted_at IS NULL AND r.format = 'audio'`;

export async function getNarrator(db: Db, id: string): Promise<NarratorDetail | null> {
  const c = await core(db, 'narrator', id);
  if (!c) return null;
  const listens = await db.select<Listen>(
    `SELECT rn.id AS rn_id, r.id AS read_id, b.id AS book_id, b.title, r.finish_date, r.status, r.narration_style, r.audio_length_seconds, (SELECT group_concat(a.name, ', ') FROM read_narrator_accent x JOIN accent a ON a.id = x.accent_id AND a.deleted_at IS NULL WHERE x.read_narrator_id = rn.id AND x.deleted_at IS NULL) AS accent, rn.rating,
       (SELECT group_concat(ch.name, ', ') FROM read_narrator_character rnc JOIN character ch ON ch.id = rnc.character_id WHERE rnc.read_narrator_id = rn.id AND rnc.deleted_at IS NULL) AS voiced
     FROM read_narrator rn JOIN read r ON r.id = rn.read_id JOIN book b ON b.id = r.book_id AND b.deleted_at IS NULL
     WHERE ${LISTEN} ORDER BY COALESCE(r.finish_date, '9999') DESC, r.created_at DESC, r.rowid DESC`, [id]);
  for (const l of listens) { l.chars = await voicesOf(db, l.rn_id); l.options = (await bookCharacters(db, l.book_id)).filter((o) => !l.chars.some((c) => c.id === o.id)); }
  const books = `SELECT r.book_id FROM read_narrator rn JOIN read r ON r.id = rn.read_id WHERE ${LISTEN}`;
  return {
    core: c, aliases: await listAliases(db, 'narrator', id),
    usualAccents: await db.select<Item>('SELECT a.id AS id, a.name AS name FROM narrator_accent na JOIN accent a ON a.id = na.accent_id WHERE na.narrator_id = ? AND na.deleted_at IS NULL ORDER BY CASE WHEN lower(a.name) LIKE \'the %\' THEN lower(substr(a.name, 5)) ELSE lower(a.name) END', [id]),
    listens,
    totalSeconds: listens.reduce((n, l) => n + (l.audio_length_seconds ?? 0), 0),
    tally: { up: listens.filter((l) => l.rating === 'up').length, neutral: listens.filter((l) => l.rating === 'neutral').length, down: listens.filter((l) => l.rating === 'down').length, unrated: listens.filter((l) => !l.rating).length },
    coNarrators: await db.select<Counted>(
      `SELECT n.id AS id, n.name AS name, count(*) AS n FROM read_narrator rn JOIN read r ON r.id = rn.read_id JOIN read_narrator other ON other.read_id = r.id AND other.narrator_id != rn.narrator_id AND other.deleted_at IS NULL
       JOIN narrator n ON n.id = other.narrator_id AND n.deleted_at IS NULL WHERE ${LISTEN} GROUP BY n.id ORDER BY n DESC, CASE WHEN lower(n.name) LIKE \'the %\' THEN lower(substr(n.name, 5)) ELSE lower(n.name) END`, [id]),
    voiced: await db.select(
      `SELECT DISTINCT ch.id AS id, ch.name AS name, b.title AS book FROM read_narrator rn JOIN read r ON r.id = rn.read_id JOIN book b ON b.id = r.book_id JOIN read_narrator_character rnc ON rnc.read_narrator_id = rn.id AND rnc.deleted_at IS NULL
       JOIN character ch ON ch.id = rnc.character_id AND ch.deleted_at IS NULL WHERE ${LISTEN} ORDER BY CASE WHEN lower(ch.name) LIKE \'the %\' THEN lower(substr(ch.name, 5)) ELSE lower(ch.name) END`, [id]),
    commonAccents: await db.select<Counted>(
      `SELECT a.id AS id, a.name AS name, count(*) AS n FROM read_narrator rn JOIN read r ON r.id = rn.read_id JOIN read_narrator_accent x ON x.read_narrator_id = rn.id AND x.deleted_at IS NULL JOIN accent a ON a.id = x.accent_id AND a.deleted_at IS NULL WHERE ${LISTEN} GROUP BY a.id ORDER BY n DESC, CASE WHEN lower(a.name) LIKE \'the %\' THEN lower(substr(a.name, 5)) ELSE lower(a.name) END`, [id]),
    genres: await tagCounts(db, 'genre', books, [id]), tropes: await tagCounts(db, 'trope', books, [id]),
    // Books where this narrator is a default narrator but you have not listened to them narrate.
    notListened: await db.select(
      `SELECT b.id AS id, b.title AS title FROM book_narrator bn JOIN book b ON b.id = bn.book_id AND b.deleted_at IS NULL
       WHERE bn.narrator_id = ? AND bn.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM read_narrator rn JOIN read r ON r.id = rn.read_id WHERE rn.narrator_id = bn.narrator_id AND rn.deleted_at IS NULL AND r.deleted_at IS NULL AND r.book_id = b.id AND r.format = 'audio')
       ORDER BY CASE WHEN lower(b.title) LIKE \'the %\' THEN lower(substr(b.title, 5)) ELSE lower(b.title) END`, [id]),
  };
}

export async function addUsualAccent(db: Db, narratorId: string, name: string) {
  const n = name.trim();
  if (!n) return;
  let accentId = await first(db, 'SELECT id FROM accent WHERE lower(name) = lower(?) AND deleted_at IS NULL', [n]);
  if (!accentId) { accentId = newId(); await db.execute('INSERT INTO accent (id, name) VALUES (?, ?)', [accentId, n]); }
  if (!(await first(db, 'SELECT id FROM narrator_accent WHERE narrator_id = ? AND accent_id = ? AND deleted_at IS NULL', [narratorId, accentId])))
    await db.execute('INSERT INTO narrator_accent (id, narrator_id, accent_id) VALUES (?, ?, ?)', [newId(), narratorId, accentId]);
}
export const removeUsualAccent = (db: Db, narratorId: string, accentId: string) =>
  db.execute(`UPDATE narrator_accent SET deleted_at = ${NOW} WHERE narrator_id = ? AND accent_id = ? AND deleted_at IS NULL`, [narratorId, accentId]);

// Adds a book to a narrator: they become one of the book's usual narrators, and if the book's latest read
// is an audio read they are added to it too (so it counts as a listen).
export async function addBookToNarrator(db: Db, narratorId: string, bookId: string): Promise<void> {
  const { ensureBookNarrator } = await import('./bookLog');
  await ensureBookNarrator(db, bookId, narratorId);
  const [latest] = await db.select<{ id: string; format: string | null }>('SELECT id, format FROM read WHERE book_id = ? AND deleted_at IS NULL ORDER BY created_at DESC, rowid DESC LIMIT 1', [bookId]);
  if (latest?.format === 'audio' && !(await first(db, 'SELECT id FROM read_narrator WHERE read_id = ? AND narrator_id = ? AND deleted_at IS NULL', [latest.id, narratorId]))) {
    const [{ n }] = await db.select<{ n: number }>('SELECT count(*) AS n FROM read_narrator WHERE read_id = ? AND deleted_at IS NULL', [latest.id]);
    await db.execute('INSERT INTO read_narrator (id, read_id, narrator_id, sort_order) VALUES (?, ?, ?, ?)', [newId(), latest.id, narratorId, Number(n)]);
  }
}
// Takes a book off a narrator's "not listened yet" list (they are no longer one of its usual narrators).
export const removeBookFromNarrator = (db: Db, narratorId: string, bookId: string) =>
  db.execute(`UPDATE book_narrator SET deleted_at = ${NOW} WHERE book_id = ? AND narrator_id = ? AND deleted_at IS NULL`, [bookId, narratorId]);

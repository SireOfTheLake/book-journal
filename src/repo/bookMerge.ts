import type { Db, SqlValue } from '../db/adapter';
import { deleteRead } from './bookLog';
import { combineText, SIMILAR_FROM, titleSimilarity } from '../domain/bookMerge';

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const first = async <T,>(db: Db, sql: string, params: SqlValue[] = []) => (await db.select<T>(sql, params))[0];

export interface MergeCandidate { id: string; title: string; authors: string | null; reads: number; score: number; same: boolean }

const CANDIDATES = `SELECT b.id AS id, b.title AS title,
    (SELECT group_concat(x.name, ', ') FROM (SELECT au.name AS name FROM book_author ba JOIN author au ON au.id = ba.author_id WHERE ba.book_id = b.id AND ba.deleted_at IS NULL AND au.deleted_at IS NULL ORDER BY ba.sort_order) x) AS authors,
    (SELECT count(*) FROM read r WHERE r.book_id = b.id AND r.deleted_at IS NULL) AS reads
  FROM book b WHERE b.deleted_at IS NULL AND b.is_draft = 0 AND b.id <> ?`;

// Every other book, with how alike its title is to this one, most alike first. `similar` are the ones close enough to suggest.
export async function listMergeCandidates(db: Db, bookId: string): Promise<{ similar: MergeCandidate[]; all: MergeCandidate[] }> {
  const me = await first<{ title: string }>(db, 'SELECT title FROM book WHERE id = ? AND deleted_at IS NULL', [bookId]);
  if (!me) throw new Error('That book could not be found.');
  const rows = await db.select<{ id: string; title: string; authors: string | null; reads: number }>(CANDIDATES, [bookId]);
  const all = rows.map((r) => { const score = titleSimilarity(me.title, r.title); return { ...r, score, same: score >= 0.95 }; }).sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  return { similar: all.filter((c) => c.score >= SIMILAR_FROM), all };
}

// ---------- the review ----------
export type FieldKey = 'title' | 'cover' | 'synopsis' | 'page_count' | 'pov' | 'perspective' | 'heat_level' | 'time_period' | 'setting_place' | 'setting_text' | 'original_publication_date' | 'universe' | 'series' | 'makeup_override' | 'planned_format' | 'shelf';
const COLUMNS: Record<FieldKey, string[]> = {
  title: ['title'], cover: ['cover_image_id'], synopsis: ['synopsis'], page_count: ['page_count'], pov: ['pov'], perspective: ['perspective'], heat_level: ['heat_level'],
  time_period: ['time_period_id', 'time_period_detail'], setting_place: ['setting_place_id'], setting_text: ['setting_text'], original_publication_date: ['original_publication_date'],
  universe: ['universe_id'], series: ['series_id', 'series_position'], makeup_override: ['makeup_override'], planned_format: ['planned_format'], shelf: ['shelf', 'tbr_priority'],
};
const LABEL: Record<FieldKey, string> = {
  title: 'Title', cover: 'Cover', synopsis: 'Synopsis', page_count: 'Pages', pov: 'Point of view', perspective: 'Perspective', heat_level: 'Heat level', time_period: 'Time period',
  setting_place: 'Setting (place)', setting_text: 'Setting (notes)', original_publication_date: 'First published', universe: 'Universe', series: 'Series', makeup_override: 'Character makeup', planned_format: 'Planned format', shelf: 'Shelf',
};
// Text that can be kept from one book, taken from the other, or both put together.
const TEXT: FieldKey[] = ['synopsis', 'setting_text'];
export type Pick = 'a' | 'b' | 'both';
export type FieldState = 'same' | 'only_a' | 'only_b' | 'conflict'; // only_a: the other book has nothing here; only_b: this book has nothing here, so it is filled in from the other

export interface FieldPlan { key: FieldKey; label: string; text: boolean; a: string | null; b: string | null; state: FieldState; image?: boolean }
export interface MergeSide { id: string; title: string; authors: string | null; reads: number; cover: string | null }
export interface MergeRead { id: string; side: 'a' | 'b'; status: string; start_date: string | null; finish_date: string | null; rating: number | null; format: string | null; notes: string | null; days: number; challenges: string[] }
export interface MergePlan {
  a: MergeSide; b: MergeSide; fields: FieldPlan[]; reads: MergeRead[]; // every read of both books: you choose which to keep
  adds: { label: string; names: string[] }[]; // lists that are combined automatically: what the other book adds
  favorite: boolean;
}

type BookFull = Record<string, SqlValue> & { id: string; title: string };
const blank = (v: SqlValue | undefined) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
const SHELF: Record<string, string> = { tbr: 'TBR', up_next: 'Up Next' };
const FORMAT: Record<string, string> = { ebook: 'E-book', physical: 'Physical', audio: 'Audio' };
const POV: Record<string, string> = { single: 'Single', dual: 'Dual', multi: 'Multiple' };

async function load(db: Db, id: string): Promise<BookFull> {
  const b = await first<BookFull>(db, 'SELECT * FROM book WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!b) throw new Error('That book could not be found.');
  if (b.is_draft) throw new Error('A blank book from the Prompt Randomizer cannot be merged. Give it a title first.');
  return b;
}
async function side(db: Db, b: BookFull): Promise<MergeSide> {
  const authors = (await first<{ a: string | null }>(db, 'SELECT group_concat(x.name, \', \') AS a FROM (SELECT au.name AS name FROM book_author ba JOIN author au ON au.id = ba.author_id WHERE ba.book_id = ? AND ba.deleted_at IS NULL ORDER BY ba.sort_order) x', [b.id]))?.a ?? null;
  const reads = (await first<{ n: number }>(db, 'SELECT count(*) AS n FROM read WHERE book_id = ? AND deleted_at IS NULL', [b.id]))?.n ?? 0;
  const cover = b.cover_image_id ? (await first<{ p: string }>(db, 'SELECT file_path AS p FROM image WHERE id = ? AND deleted_at IS NULL', [b.cover_image_id as string]))?.p ?? null : null;
  return { id: b.id, title: b.title, authors, reads, cover };
}
const nameOf = async (db: Db, table: string, id: SqlValue) => (id ? (await first<{ n: string }>(db, `SELECT name AS n FROM ${table} WHERE id = ?`, [id as string]))?.n ?? null : null);

async function show(db: Db, key: FieldKey, b: BookFull, cover: string | null): Promise<string | null> {
  switch (key) {
    case 'cover': return cover ? 'Has a cover' : null;
    case 'time_period': { const n = await nameOf(db, 'time_period', b.time_period_id); return n && b.time_period_detail ? `${n} (${b.time_period_detail})` : n; }
    case 'setting_place': return nameOf(db, 'place', b.setting_place_id);
    case 'universe': return nameOf(db, 'universe', b.universe_id);
    case 'series': { const t = b.series_id ? (await first<{ t: string }>(db, 'SELECT title AS t FROM series WHERE id = ?', [b.series_id as string]))?.t : null; return t ? `${t}${b.series_position !== null ? ` #${b.series_position}` : ''}` : null; }
    case 'shelf': return b.shelf ? SHELF[b.shelf as string] ?? String(b.shelf) : null;
    case 'planned_format': return b.planned_format ? FORMAT[b.planned_format as string] ?? String(b.planned_format) : null;
    case 'pov': return b.pov ? POV[b.pov as string] ?? String(b.pov) : null;
    case 'heat_level': return b.heat_level === null ? null : String(b.heat_level);
    default: { const v = b[COLUMNS[key][0]]; return blank(v) ? null : String(v); }
  }
}
// Whether two books have the same value in a field (blank = nothing there).
const nothing = (key: FieldKey, b: BookFull) => COLUMNS[key].filter((c) => c !== 'series_position' && c !== 'tbr_priority').every((c) => blank(b[c]));
const equal = (key: FieldKey, a: BookFull, b: BookFull, ca: string | null, cb: string | null) => {
  if (key === 'cover') return ca === cb;
  if (key === 'title') return (a.title as string).trim() === (b.title as string).trim();
  return COLUMNS[key].every((c) => (blank(a[c]) && blank(b[c])) || a[c] === b[c] || (typeof a[c] === 'string' && typeof b[c] === 'string' && (a[c] as string).trim() === (b[c] as string).trim()));
};

const JOINS: { table: string; target: string; list: string; label: string }[] = [
  { table: 'book_author', target: 'author_id', list: 'author', label: 'Authors' },
  { table: 'book_narrator', target: 'narrator_id', list: 'narrator', label: 'Narrators' },
  { table: 'book_genre', target: 'genre_id', list: 'genre', label: 'Genres' },
  { table: 'book_theme', target: 'theme_id', list: 'theme', label: 'Themes' },
  { table: 'book_trope', target: 'trope_id', list: 'trope', label: 'Tropes' },
  { table: 'book_character', target: 'character_id', list: 'character', label: 'Characters' },
  { table: 'book_place', target: 'place_id', list: 'place', label: 'Places' },
];

export async function planMerge(db: Db, keepId: string, otherId: string): Promise<MergePlan> {
  if (keepId === otherId) throw new Error('Choose a different book to merge with.');
  const a = await load(db, keepId), b = await load(db, otherId);
  const sa = await side(db, a), sb = await side(db, b);
  const fields: FieldPlan[] = [];
  for (const key of Object.keys(COLUMNS) as FieldKey[]) {
    const na = nothing(key, a) || (key === 'cover' && !sa.cover), nb = nothing(key, b) || (key === 'cover' && !sb.cover);
    const state: FieldState = (na && nb) || (!na && !nb && equal(key, a, b, sa.cover, sb.cover)) ? 'same' : nb ? 'only_a' : na ? 'only_b' : 'conflict';
    if (state === 'same' && na) continue; // blank in both: nothing to show
    fields.push({ key, label: LABEL[key], text: TEXT.includes(key), image: key === 'cover', a: await show(db, key, a, sa.cover), b: await show(db, key, b, sb.cover), state });
  }
  const adds: MergePlan['adds'] = [];
  for (const j of JOINS) {
    const names = (await db.select<{ n: string }>(
      `SELECT x.name AS n FROM ${j.table} o JOIN ${j.list} x ON x.id = o.${j.target} WHERE o.book_id = ? AND o.deleted_at IS NULL AND x.deleted_at IS NULL
         AND o.${j.target} NOT IN (SELECT ${j.target} FROM ${j.table} WHERE book_id = ? AND deleted_at IS NULL)`, [otherId, keepId])).map((r) => r.n);
    if (names.length) adds.push({ label: j.label, names });
  }
  const rel = (await db.select<{ f: string }>('SELECT format AS f FROM format_release WHERE book_id = ? AND deleted_at IS NULL AND format NOT IN (SELECT format FROM format_release WHERE book_id = ? AND deleted_at IS NULL)', [otherId, keepId])).map((r) => FORMAT[r.f] ?? r.f);
  if (rel.length) adds.push({ label: 'Release dates', names: rel });
  const reads: MergeRead[] = [];
  for (const [which, id] of [['a', keepId], ['b', otherId]] as const) {
    for (const r of await db.select<Omit<MergeRead, 'side' | 'days' | 'challenges'>>("SELECT id, status, start_date, finish_date, rating, format, notes FROM read WHERE book_id = ? AND deleted_at IS NULL ORDER BY COALESCE(finish_date, start_date, '9999'), rowid", [id])) {
      const days = (await first<{ n: number }>(db, 'SELECT count(*) AS n FROM day_entry WHERE read_id = ? AND deleted_at IS NULL', [r.id]))?.n ?? 0;
      const challenges = (await db.select<{ n: string }>('SELECT c.name AS n FROM challenge_completion k JOIN challenge c ON c.id = k.challenge_id AND c.deleted_at IS NULL WHERE k.read_id = ? AND k.deleted_at IS NULL', [r.id])).map((x) => x.n);
      reads.push({ ...r, side: which, days, challenges });
    }
  }
  return { a: sa, b: sb, fields, reads, adds, favorite: !!b.is_favorite && !a.is_favorite };
}

// ---------- doing it ----------
// Merges `otherId` into `keepId`. `picks` says which version to use for every field where both books have something different; the rest is decided by the plan.
// The reads you keep (all of them unless `keepReads` lists some) move to the kept book with their ratings, notes, daily logs and challenge picks; none is combined. A read you do not keep is deleted.
export async function mergeBooks(db: Db, keepId: string, otherId: string, picks: Partial<Record<FieldKey, Pick>>, keepReads?: string[]): Promise<void> {
  const plan = await planMerge(db, keepId, otherId);
  const all = new Set(plan.reads.map((r) => r.id));
  if (keepReads && keepReads.some((id) => !all.has(id))) throw new Error('One of the reads you chose no longer exists.');
  const dropped = keepReads ? plan.reads.filter((r) => !keepReads.includes(r.id)).map((r) => r.id) : [];
  for (const f of plan.fields) {
    if (f.state !== 'conflict') continue;
    const p = picks[f.key];
    if (!p) throw new Error(`Choose which ${f.label.toLowerCase()} to use.`);
    if (p === 'both' && !f.text) throw new Error(`${f.label} cannot be combined. Choose one.`);
  }
  const a = await load(db, keepId), b = await load(db, otherId);
  const set: Record<string, SqlValue> = {};
  for (const f of plan.fields) {
    const p: Pick = f.state === 'only_b' ? 'b' : f.state === 'conflict' ? picks[f.key]! : 'a';
    if (p === 'b') for (const c of COLUMNS[f.key]) set[c] = b[c];
    else if (p === 'both') set[COLUMNS[f.key][0]] = combineText(a[COLUMNS[f.key][0]] as string | null, b[COLUMNS[f.key][0]] as string | null);
  }
  if (b.is_favorite) set.is_favorite = 1;
  try {
    const ids = { ...JSON.parse((b.external_ids as string) || '{}'), ...JSON.parse((a.external_ids as string) || '{}') };
    if (Object.keys(ids).length) set.external_ids = JSON.stringify(ids);
  } catch { /* ids that are not JSON are left as they are */ }

  // reads move over
  await db.execute('UPDATE read SET book_id = ? WHERE book_id = ? AND deleted_at IS NULL', [keepId, otherId]);
  for (const id of dropped) await deleteRead(db, id);
  // lists: what the kept book lacks moves over; what both have stays once
  for (const j of JOINS) {
    const rows = await db.select<{ id: string; t: string; role?: string }>(`SELECT id, ${j.target} AS t${j.table === 'book_character' ? ', role' : ''} FROM ${j.table} WHERE book_id = ? AND deleted_at IS NULL`, [otherId]);
    for (const r of rows) {
      const have = await first<{ id: string; role?: string }>(db, `SELECT id${j.table === 'book_character' ? ', role' : ''} FROM ${j.table} WHERE book_id = ? AND ${j.target} = ? AND deleted_at IS NULL`, [keepId, r.t]);
      if (have) {
        if (j.table === 'book_character' && r.role === 'main' && have.role !== 'main') await db.execute("UPDATE book_character SET role = 'main' WHERE id = ?", [have.id]);
        await db.execute(`UPDATE ${j.table} SET deleted_at = ${NOW} WHERE id = ?`, [r.id]);
      } else {
        if (j.table === 'book_author' || j.table === 'book_narrator' || j.table === 'book_character' || j.table === 'book_place') {
          const n = (await first<{ n: number | null }>(db, `SELECT max(sort_order) AS n FROM ${j.table} WHERE book_id = ? AND deleted_at IS NULL`, [keepId]))?.n ?? -1;
          await db.execute(`UPDATE ${j.table} SET book_id = ?, sort_order = ? WHERE id = ?`, [keepId, n + 1, r.id]);
        } else await db.execute(`UPDATE ${j.table} SET book_id = ? WHERE id = ?`, [keepId, r.id]);
      }
    }
  }
  // release dates: one per format; a real date beats "to be announced"
  for (const r of await db.select<{ id: string; format: string; status: string; release_date: string | null }>('SELECT id, format, status, release_date FROM format_release WHERE book_id = ? AND deleted_at IS NULL', [otherId])) {
    const mine = await first<{ id: string; status: string }>(db, 'SELECT id, status FROM format_release WHERE book_id = ? AND format = ? AND deleted_at IS NULL', [keepId, r.format]);
    if (!mine) await db.execute('UPDATE format_release SET book_id = ? WHERE id = ?', [keepId, r.id]);
    else {
      if (mine.status !== 'dated' && r.status === 'dated') await db.execute('UPDATE format_release SET status = ?, release_date = ? WHERE id = ?', [r.status, r.release_date, mine.id]);
      await db.execute(`UPDATE format_release SET deleted_at = ${NOW} WHERE id = ?`, [r.id]);
    }
  }
  // the other book's cover picture, when it is not the one in use
  const coverNow = (set.cover_image_id !== undefined ? set.cover_image_id : a.cover_image_id) as string | null;
  for (const c of [a.cover_image_id, b.cover_image_id] as (string | null)[]) if (c && c !== coverNow) await db.execute(`UPDATE image SET deleted_at = ${NOW} WHERE id = ?`, [c]);

  const cols = Object.keys(set);
  if (cols.length) await db.execute(`UPDATE book SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [...cols.map((c) => set[c]), keepId]);
  // a book that is being read is not on a shelf
  const open = await first<{ n: number }>(db, "SELECT count(*) AS n FROM read WHERE book_id = ? AND status IN ('reading', 'on_hold') AND deleted_at IS NULL", [keepId]);
  if (open?.n) await db.execute('UPDATE book SET shelf = NULL, tbr_priority = NULL WHERE id = ?', [keepId]);
  await db.execute(`UPDATE book SET deleted_at = ${NOW}, shelf = NULL, tbr_priority = NULL, cover_image_id = NULL WHERE id = ?`, [otherId]);
}

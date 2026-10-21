import type { Db, SqlValue } from '../db/adapter';
import { addTag, deleteBook, setStatus, updateBook, updateRead, type Status } from './bookLog';

// Changing or deleting several books at once from the Library.

export type Format = 'physical' | 'audio' | 'ebook';
export type Copy = 'physical' | 'ebook' | 'audio';
/** Anything left out (undefined or empty) is not touched. */
export interface BulkChanges {
  status?: Status;
  format?: Format;
  sourceId?: string; sourceName?: string; // a source you already have
  genres?: string[]; tropes?: string[]; // added to each book; any a book has already are left alone
  own?: Copy[]; // marked as owned
  placeholderPermanent?: boolean; // true: the placeholder cover is permanent; false: it is not
}

export const STATUS_NAME: Record<Status, string> = { tbr: 'TBR', up_next: 'Up Next', reading: 'In Progress', finished: 'Read', on_hold: 'Paused', dnf: 'DNF' };
const FORMAT_NAME: Record<Format, string> = { physical: 'Physical', audio: 'Audio', ebook: 'Ebook' };
const OWN_COL: Record<Copy, string> = { physical: 'own_physical', ebook: 'own_ebook', audio: 'own_audio' };

export const hasChanges = (c: BulkChanges): boolean =>
  !!(c.status || c.format || c.sourceId || c.genres?.length || c.tropes?.length || c.own?.length || c.placeholderPermanent !== undefined);

const marks = (ids: string[]) => ids.map(() => '?').join(', ');
const plural = (n: number, one = 'book', many = 'books') => `${n} ${n === 1 ? one : many}`;

async function readFacts(db: Db, ids: string[]): Promise<Map<string, { any: boolean; closed: boolean }>> {
  const out = new Map(ids.map((id) => [id, { any: false, closed: false }]));
  for (const r of await db.select<{ book_id: string; status: string }>(`SELECT book_id, status FROM read WHERE deleted_at IS NULL AND book_id IN (${marks(ids)})`, ids)) {
    const f = out.get(r.book_id)!;
    f.any = true; if (r.status === 'finished' || r.status === 'dnf') f.closed = true;
  }
  return out;
}

// Format and source belong to a book's reading. After the status change, will each book have one?
const willHaveRead = (status: Status | undefined, f: { any: boolean; closed: boolean }) => (status === undefined ? f.any : status === 'tbr' ? f.closed : true);

/** The changes in plain words, for the "are you sure?" step. Works out how many books each one really touches. */
export async function describeBulk(db: Db, ids: string[], c: BulkChanges): Promise<string[]> {
  if (!ids.length) return [];
  const lines: string[] = [];
  const n = ids.length;
  if (c.status) lines.push(`Status: set to ${STATUS_NAME[c.status]} on ${plural(n)}.`);
  if (c.format || c.sourceId) {
    const facts = await readFacts(db, ids);
    const skipped = ids.filter((id) => !willHaveRead(c.status, facts.get(id)!)).length;
    const note = skipped ? ` ${plural(skipped)} ${skipped === 1 ? 'has' : 'have'} no reading to put it on, so ${skipped === 1 ? 'it is' : 'they are'} skipped.` : '';
    if (c.format) lines.push(`Format: set to ${FORMAT_NAME[c.format]} on ${plural(n - skipped)}.${note}`);
    if (c.sourceId) lines.push(`Source: set to ${c.sourceName ?? 'the chosen source'} on ${plural(n - skipped)}.${skipped && !c.format ? note : ''}`);
  }
  for (const [label, table, names] of [['Genre', 'genre', c.genres], ['Trope', 'trope', c.tropes]] as const) {
    for (const name of names ?? []) {
      const have = await db.select<{ n: number }>(
        `SELECT count(DISTINCT j.book_id) AS n FROM book_${table} j JOIN ${table} t ON t.id = j.${table}_id AND t.deleted_at IS NULL
         WHERE j.deleted_at IS NULL AND lower(t.name) = lower(?) AND j.book_id IN (${marks(ids)})`, [name, ...ids]);
      const missing = n - Number(have[0]?.n ?? 0);
      lines.push(`${label}: add "${name}" to ${plural(missing)}${missing < n ? ` (${plural(n - missing)} already ${n - missing === 1 ? 'has' : 'have'} it)` : ''}.`);
    }
  }
  for (const k of c.own ?? []) {
    const rows = await db.select<{ n: number }>(`SELECT count(*) AS n FROM book WHERE id IN (${marks(ids)}) AND ${OWN_COL[k]} = 0`, ids);
    lines.push(`Copies I own: mark ${FORMAT_NAME[k]} as owned on ${plural(Number(rows[0]?.n ?? 0))}.`);
  }
  if (c.placeholderPermanent !== undefined) lines.push(`Placeholder cover: mark as ${c.placeholderPermanent ? 'permanent' : 'not permanent'} on ${plural(n)}.`);
  return lines;
}

export interface BulkResult { books: number; skippedNoRead: number }

/** Makes the changes, one book at a time. The status goes first, since format and source go on the book's reading. */
export async function applyBulk(db: Db, ids: string[], c: BulkChanges, onProgress?: (done: number, total: number) => void): Promise<BulkResult> {
  let skippedNoRead = 0; let done = 0;
  for (const id of ids) {
    if (c.status) {
      // A shelf status drops open readings itself; otherwise change the latest reading rather than starting another.
      const [latest] = c.status === 'tbr' || c.status === 'up_next' ? [] : await db.select<{ id: string }>('SELECT id FROM read WHERE book_id = ? AND deleted_at IS NULL ORDER BY created_at DESC, rowid DESC LIMIT 1', [id]);
      await setStatus(db, id, latest?.id ?? null, c.status);
    }
    if (c.format || c.sourceId) {
      const [read] = await db.select<{ id: string }>('SELECT id FROM read WHERE book_id = ? AND deleted_at IS NULL ORDER BY created_at DESC, rowid DESC LIMIT 1', [id]);
      if (read) {
        const fields: Record<string, SqlValue> = {};
        if (c.format) fields.format = c.format;
        if (c.sourceId) fields.source_id = c.sourceId;
        await updateRead(db, read.id, fields);
      } else skippedNoRead++;
    }
    for (const g of c.genres ?? []) await addTag(db, id, 'genre', g);
    for (const t of c.tropes ?? []) await addTag(db, id, 'trope', t);
    const book: Record<string, SqlValue> = {};
    for (const k of c.own ?? []) book[OWN_COL[k]] = 1;
    if (c.placeholderPermanent !== undefined) book.placeholder_permanent = c.placeholderPermanent ? 1 : 0;
    if (Object.keys(book).length) await updateBook(db, id, book);
    done++; onProgress?.(done, ids.length);
  }
  return { books: ids.length, skippedNoRead };
}

/** Deletes whole books (their readings, tags and links too); authors, series and characters stay. */
export async function deleteBooks(db: Db, ids: string[], onProgress?: (done: number, total: number) => void): Promise<number> {
  let done = 0;
  for (const id of ids) {
    try { await deleteBook(db, id); } catch { /* already gone */ }
    done++; onProgress?.(done, ids.length);
  }
  return done;
}

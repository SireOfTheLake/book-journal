import type { Db, SqlValue } from '../db/adapter';
import { first } from '../import/writer';
import { addSeriesAuthor, seriesAuthors } from './series';
import { makeField, resolveValue, type MergeChoice, type MergePlan } from './mergeReview';

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
interface SRow { id: string; title: string; universe_id: string | null; total_books: number | null; is_ongoing: number; publication_status: string; reading_status_override: string | null; interconnected_standalones: number; is_favorite: number; color: string | null; notes: string | null }
const load = async (db: Db, id: string) => (await db.select<SRow>('SELECT id, title, universe_id, total_books, is_ongoing, publication_status, reading_status_override, interconnected_standalones, is_favorite, color, notes FROM series WHERE id = ? AND deleted_at IS NULL', [id]))[0];
const YES = (v: number) => (v ? 'Yes' : 'No');
const STATUS: Record<string, string> = { completed: 'Completed', in_progress: 'In progress', on_hold: 'On hold', dnf: 'Did not finish' };

// Fields that can differ, as [key, label, text?]. The value shown is made readable; the value stored is the raw column.
const FIELDS = [['universe_id', 'Universe', false], ['total_books', 'Number of books', false], ['publication_status', 'Publication status', false], ['is_ongoing', 'Still ongoing', false],
  ['interconnected_standalones', 'Interconnected standalones', false], ['reading_status_override', 'Reading status set by you', false], ['color', 'Color', false], ['notes', 'Notes', true]] as const;

async function show(db: Db, key: string, row: SRow): Promise<string | null> {
  const v = row[key as keyof SRow];
  if (v === null || v === undefined || v === '') return null;
  if (key === 'universe_id') return (await db.select<{ name: string }>('SELECT name FROM universe WHERE id = ?', [v as string]))[0]?.name ?? null;
  if (key === 'is_ongoing' || key === 'interconnected_standalones') return YES(v as number);
  if (key === 'publication_status') return v === 'complete' ? 'Complete' : 'Incomplete';
  if (key === 'reading_status_override') return STATUS[v as string] ?? String(v);
  return String(v);
}

// What the review screen shows: fields that differ, then the duplicate's books (flagging clashing numbers), genres and authors.
export async function seriesMergePlan(db: Db, keepId: string, dupId: string): Promise<MergePlan> {
  const keep = await load(db, keepId), dup = await load(db, dupId);
  if (!keep || !dup) throw new Error('One of those series no longer exists.');
  const fields = [];
  for (const [k, label, text] of FIELDS) {
    const f = makeField(k, label, await show(db, k, keep), await show(db, k, dup), text);
    // The two booleans and the status are stored as 0/1, so a "No" is real information; compare the raw values for the default.
    const kr = keep[k], dr = dup[k];
    if (k === 'is_ongoing' || k === 'interconnected_standalones') { f.keep = YES(kr as number); f.dup = YES(dr as number); f.mode = kr === dr ? 'keep' : (dr ? 'dup' : 'keep'); }
    fields.push(f);
  }
  const items: MergePlan['items'] = [];
  const mine = await db.select<{ position: number | null; title: string }>('SELECT series_position AS position, title FROM book WHERE series_id = ? AND deleted_at IS NULL', [keepId]);
  for (const b of await db.select<{ id: string; title: string; position: number | null }>('SELECT id, title, series_position AS position FROM book WHERE series_id = ? AND deleted_at IS NULL ORDER BY series_position IS NULL, series_position, rowid', [dupId])) {
    const clash = b.position !== null ? mine.find((m) => m.position === b.position) : undefined;
    items.push({ key: `book:${b.id}`, group: 'Books', label: `${b.title}${b.position !== null ? ` (#${b.position})` : ''}${clash ? ` — same number as "${clash.title}"` : ''}` });
  }
  for (const g of await db.select<{ id: string; label: string }>('SELECT sg.id AS id, g.name AS label FROM series_genre sg JOIN genre g ON g.id = sg.genre_id WHERE sg.series_id = ? AND sg.deleted_at IS NULL ORDER BY g.name', [dupId])) items.push({ key: `series_genre:${g.id}`, group: 'Genres', label: g.label });
  for (const a of await seriesAuthors(db, dupId)) items.push({ key: `author:${a.id}`, group: 'Authors', label: a.name });
  return { fields, items };
}

// Folds `dupId` into `keepId`. Books move over with their numbers; without a choice everything comes and blank fields are filled in.
export async function mergeSeries(db: Db, keepId: string, dupId: string, choice?: MergeChoice): Promise<void> {
  if (keepId === dupId) throw new Error('Choose two different series.');
  const keep = await load(db, keepId), dup = await load(db, dupId);
  if (!keep || !dup) throw new Error('One of those series no longer exists.');
  const leave = new Set(choice?.leave ?? []);
  const dupAuthors = await seriesAuthors(db, dupId);

  for (const b of await db.select<{ id: string }>('SELECT id FROM book WHERE series_id = ? AND deleted_at IS NULL', [dupId])) {
    if (leave.has(`book:${b.id}`)) await db.execute('UPDATE book SET series_id = NULL, series_position = NULL WHERE id = ?', [b.id]);
    else await db.execute('UPDATE book SET series_id = ? WHERE id = ?', [keepId, b.id]);
  }
  for (const g of await db.select<{ id: string; genre_id: string }>('SELECT id, genre_id FROM series_genre WHERE series_id = ? AND deleted_at IS NULL', [dupId])) {
    if (leave.has(`series_genre:${g.id}`) || await first(db, 'SELECT id FROM series_genre WHERE series_id = ? AND genre_id = ? AND deleted_at IS NULL', [keepId, g.genre_id])) await db.execute(`UPDATE series_genre SET deleted_at = ${NOW} WHERE id = ?`, [g.id]);
    else await db.execute('UPDATE series_genre SET series_id = ? WHERE id = ?', [keepId, g.id]);
  }
  await db.execute(`UPDATE series_author SET deleted_at = ${NOW} WHERE series_id = ? AND deleted_at IS NULL`, [dupId]);
  for (const a of dupAuthors) if (!leave.has(`author:${a.id}`)) await addSeriesAuthor(db, keepId, { id: a.id });

  const set: Record<string, SqlValue> = {};
  for (const [k, , text] of FIELDS) {
    const kv = keep[k] as SqlValue, dv = dup[k] as SqlValue;
    if (choice) { const v = resolveValue<SqlValue>(choice.fields[k] ?? 'keep', kv, dv, text); if (v !== undefined) set[k] = v; }
    else if ((kv === null || kv === '') && dv !== null && dv !== '') set[k] = dv;
  }
  if (!keep.is_favorite && dup.is_favorite) set.is_favorite = 1;
  const cols = Object.keys(set);
  if (cols.length) await db.execute(`UPDATE series SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [...cols.map((c) => set[c]), keepId]);
  await db.execute(`UPDATE series SET deleted_at = ${NOW} WHERE id = ?`, [dupId]);
}

export async function seriesDeletePreview(db: Db, id: string) {
  const [r] = await db.select<{ n: number }>('SELECT count(*) AS n FROM book WHERE series_id = ? AND deleted_at IS NULL', [id]);
  return { books: Number(r?.n ?? 0) };
}

// Removes a series. Its books stay in the journal, just no longer in a series.
export async function deleteSeries(db: Db, id: string): Promise<void> {
  if (!(await load(db, id))) throw new Error('That series has already been deleted.');
  await db.execute('UPDATE book SET series_id = NULL, series_position = NULL WHERE series_id = ?', [id]);
  for (const t of ['series_genre', 'series_author']) await db.execute(`UPDATE ${t} SET deleted_at = ${NOW} WHERE series_id = ? AND deleted_at IS NULL`, [id]);
  await db.execute(`UPDATE series SET deleted_at = ${NOW} WHERE id = ?`, [id]);
}

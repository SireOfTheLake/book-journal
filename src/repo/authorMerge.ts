import type { Db } from '../db/adapter';
import { first } from '../import/writer';
import { addAlias } from './people';
import { loadPerson, mergePersonFields, NOW, personFieldPlan } from './narratorMerge';
import type { MergeChoice, MergePlan } from './mergeReview';

// What the review screen shows when two authors are being merged.
export async function authorMergePlan(db: Db, keepId: string, dupId: string): Promise<MergePlan> {
  const keep = await loadPerson(db, 'author', keepId), dup = await loadPerson(db, 'author', dupId);
  if (!keep || !dup) throw new Error('One of those authors no longer exists.');
  const items: MergePlan['items'] = [];
  const add = async (group: string, table: string, sql: string) => { for (const r of await db.select<{ id: string; label: string }>(sql, [dupId])) items.push({ key: `${table}:${r.id}`, group, label: r.label }); };
  await add('Other names', 'author_alias', 'SELECT id, name AS label FROM author_alias WHERE author_id = ? AND deleted_at IS NULL ORDER BY rowid');
  await add('Books', 'book_author', `SELECT ba.id AS id, b.title || COALESCE(' (' || (SELECT s.title FROM series s WHERE s.id = b.series_id) || ')', '') AS label
    FROM book_author ba JOIN book b ON b.id = ba.book_id WHERE ba.author_id = ? AND ba.deleted_at IS NULL AND b.deleted_at IS NULL ORDER BY CASE WHEN lower(b.title) LIKE \'the %\' THEN lower(substr(b.title, 5)) ELSE lower(b.title) END`);
  await add('Series', 'series_author', 'SELECT sa.id AS id, s.title AS label FROM series_author sa JOIN series s ON s.id = sa.series_id WHERE sa.author_id = ? AND sa.deleted_at IS NULL AND s.deleted_at IS NULL ORDER BY CASE WHEN lower(s.title) LIKE \'the %\' THEN lower(substr(s.title, 5)) ELSE lower(s.title) END');
  return { fields: personFieldPlan(keep, dup), items };
}

// Folds `dupId` into `keepId`. Without a choice, everything comes across and blank fields are filled in.
export async function mergeAuthors(db: Db, keepId: string, dupId: string, choice?: MergeChoice): Promise<void> {
  if (keepId === dupId) throw new Error('Choose two different authors.');
  const keep = await loadPerson(db, 'author', keepId), dup = await loadPerson(db, 'author', dupId);
  if (!keep || !dup) throw new Error('One of those authors no longer exists.');
  const leave = new Set(choice?.leave ?? []);
  const drop = (table: string, id: string) => db.execute(`UPDATE ${table} SET deleted_at = ${NOW} WHERE id = ?`, [id]);

  for (const [table, col] of [['book_author', 'book_id'], ['series_author', 'series_id']] as const) {
    for (const r of await db.select<{ id: string; v: string }>(`SELECT id, ${col} AS v FROM ${table} WHERE author_id = ? AND deleted_at IS NULL`, [dupId])) {
      if (leave.has(`${table}:${r.id}`) || await first(db, `SELECT id FROM ${table} WHERE author_id = ? AND ${col} = ? AND deleted_at IS NULL`, [keepId, r.v])) await drop(table, r.id);
      else await db.execute(`UPDATE ${table} SET author_id = ? WHERE id = ?`, [keepId, r.id]);
    }
  }
  for (const a of await db.select<{ id: string; name: string }>('SELECT id, name FROM author_alias WHERE author_id = ? AND deleted_at IS NULL', [dupId])) {
    await drop('author_alias', a.id);
    if (!leave.has(`author_alias:${a.id}`)) await addAlias(db, 'author', keepId, a.name);
  }
  if (dup.name.trim().toLowerCase() !== keep.name.trim().toLowerCase()) await addAlias(db, 'author', keepId, dup.name);
  await mergePersonFields(db, 'author', keep, dup, choice);
  await db.execute(`UPDATE author SET deleted_at = ${NOW} WHERE id = ?`, [dupId]);
}

export async function authorDeletePreview(db: Db, id: string) {
  const n = async (sql: string) => Number((await db.select<{ n: number }>(sql, [id]))[0]?.n ?? 0);
  return {
    books: await n('SELECT count(*) AS n FROM book_author ba JOIN book b ON b.id = ba.book_id WHERE ba.author_id = ? AND ba.deleted_at IS NULL AND b.deleted_at IS NULL'),
    series: await n('SELECT count(*) AS n FROM series_author sa JOIN series s ON s.id = sa.series_id WHERE sa.author_id = ? AND sa.deleted_at IS NULL AND s.deleted_at IS NULL'),
  };
}

// Removes an author. Their books stay in the journal, just without this author.
export async function deleteAuthor(db: Db, id: string): Promise<void> {
  const a = await loadPerson(db, 'author', id);
  if (!a) throw new Error('That author has already been deleted.');
  for (const t of ['book_author', 'series_author', 'author_alias']) await db.execute(`UPDATE ${t} SET deleted_at = ${NOW} WHERE author_id = ? AND deleted_at IS NULL`, [id]);
  if (a.photo_image_id) await db.execute(`UPDATE image SET deleted_at = ${NOW} WHERE id = ?`, [a.photo_image_id]);
  await db.execute(`UPDATE author SET deleted_at = ${NOW} WHERE id = ?`, [id]);
}

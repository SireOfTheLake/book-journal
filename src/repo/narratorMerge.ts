import type { Db } from '../db/adapter';
import { first } from '../import/writer';
import { addAlias, type LinkRef } from './people';
import { makeField, resolveValue, type MergeChoice, type MergePlan } from './mergeReview';

export const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
export interface Row { id: string; name: string; sort_name: string | null; is_favorite: number; notes: string | null; links: string | null; photo_image_id: string | null }
const parseLinks = (s: string | null): LinkRef[] => { try { return s ? (JSON.parse(s) as LinkRef[]) : []; } catch { return []; } };
const linkText = (s: string | null) => parseLinks(s).map((l) => l.label || l.url).join(', ');
export const loadPerson = async (db: Db, kind: 'author' | 'narrator', id: string) => (await db.select<Row>(`SELECT id, name, sort_name, is_favorite, notes, links, photo_image_id FROM ${kind} WHERE id = ? AND deleted_at IS NULL`, [id]))[0];
const load = (db: Db, id: string) => loadPerson(db, 'narrator', id);


// The fields every person (author or narrator) has: sort name, notes, picture and links.
export function personFieldPlan(keep: Row, dup: Row) {
  const fields = [
    makeField('sort_name', 'Sort name', keep.sort_name, dup.sort_name),
    makeField('notes', 'Notes', keep.notes, dup.notes, true),
    makeField('photo', 'Picture', keep.photo_image_id ? 'Has a picture' : null, dup.photo_image_id ? 'Has a picture' : null),
    makeField('links', 'Links', linkText(keep.links), linkText(dup.links)),
  ];
  // Pictures and links: "different" is always true when both have something, so the screen offers a real choice.
  if (keep.photo_image_id && dup.photo_image_id) { fields[2].keep = 'Current picture'; fields[2].dup = 'The other picture'; }
  const links = fields[3];
  if (links.keep && links.dup && links.keep !== links.dup) links.mode = 'both';
  return fields;
}

// What the review screen shows: the fields that differ, and everything the duplicate has that could come across.
export async function narratorMergePlan(db: Db, keepId: string, dupId: string): Promise<MergePlan> {
  const keep = await load(db, keepId), dup = await load(db, dupId);
  if (!keep || !dup) throw new Error('One of those narrators no longer exists.');
  const fields = personFieldPlan(keep, dup);
  const items: MergePlan['items'] = [];
  const add = async (group: string, table: string, sql: string) => { for (const r of await db.select<{ id: string; label: string }>(sql, [dupId])) items.push({ key: `${table}:${r.id}`, group, label: r.label }); };
  await add('Other names', 'narrator_alias', 'SELECT id, name AS label FROM narrator_alias WHERE narrator_id = ? AND deleted_at IS NULL ORDER BY created_at, rowid');
  await add('Usual accents', 'narrator_accent', 'SELECT na.id AS id, a.name AS label FROM narrator_accent na JOIN accent a ON a.id = na.accent_id WHERE na.narrator_id = ? AND na.deleted_at IS NULL ORDER BY CASE WHEN lower(a.name) LIKE \'the %\' THEN lower(substr(a.name, 5)) ELSE lower(a.name) END');
  await add('Books', 'book_narrator', 'SELECT bn.id AS id, b.title AS label FROM book_narrator bn JOIN book b ON b.id = bn.book_id WHERE bn.narrator_id = ? AND bn.deleted_at IS NULL AND b.deleted_at IS NULL ORDER BY CASE WHEN lower(b.title) LIKE \'the %\' THEN lower(substr(b.title, 5)) ELSE lower(b.title) END');
  await add('Listens', 'read_narrator', "SELECT rn.id AS id, b.title || COALESCE(' (' || r.finish_date || ')', '') AS label FROM read_narrator rn JOIN read r ON r.id = rn.read_id JOIN book b ON b.id = r.book_id WHERE rn.narrator_id = ? AND rn.deleted_at IS NULL AND r.deleted_at IS NULL AND b.deleted_at IS NULL ORDER BY CASE WHEN lower(b.title) LIKE \'the %\' THEN lower(substr(b.title, 5)) ELSE lower(b.title) END");
  return { fields, items };
}


// Applies the field choices (or, with no choice, fills what is blank) to the kept person.
export async function mergePersonFields(db: Db, kind: 'author' | 'narrator', keep: Row, dup: Row, choice?: MergeChoice) {
  const keepId = keep.id;
  const drop = (table: string, id: string) => db.execute(`UPDATE ${table} SET deleted_at = ${NOW} WHERE id = ?`, [id]);
  const set: Record<string, string | number | null> = {};
  const mode = (k: string) => (choice ? choice.fields[k] ?? 'keep' : 'dup');
  for (const [k, text] of [['sort_name', false], ['notes', true]] as const) {
    const v = resolveValue<string>(choice ? mode(k) : 'dup', keep[k], dup[k], text);
    if (v !== undefined && (choice || !keep[k])) set[k] = v;
  }
  if (!keep.is_favorite && dup.is_favorite) set.is_favorite = 1;
  const pm = mode('photo');
  if (dup.photo_image_id && (choice ? pm === 'dup' : !keep.photo_image_id)) {
    if (keep.photo_image_id) await drop('image', keep.photo_image_id);
    set.photo_image_id = dup.photo_image_id;
  }
  const lm = mode('links');
  const mine = parseLinks(keep.links), theirs = parseLinks(dup.links);
  const merged = lm === 'keep' ? mine : lm === 'dup' ? (choice ? theirs : [...mine, ...theirs.filter((t) => !mine.some((m) => m.url === t.url))]) : [...mine, ...theirs.filter((t) => !mine.some((m) => m.url === t.url))];
  if (JSON.stringify(merged) !== JSON.stringify(mine)) set.links = JSON.stringify(merged);
  const cols = Object.keys(set);
  if (cols.length) await db.execute(`UPDATE ${kind} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [...cols.map((c) => set[c]), keepId]);
}

// Folds `dupId` into `keepId`. Without a choice, everything comes across and empty fields are filled in.
export async function mergeNarrators(db: Db, keepId: string, dupId: string, choice?: MergeChoice): Promise<void> {
  if (keepId === dupId) throw new Error('Choose two different narrators.');
  const keep = await load(db, keepId), dup = await load(db, dupId);
  if (!keep || !dup) throw new Error('One of those narrators no longer exists.');
  const leave = new Set(choice?.leave ?? []);
  const drop = (table: string, id: string) => db.execute(`UPDATE ${table} SET deleted_at = ${NOW} WHERE id = ?`, [id]);

  // Listens: the narrator's place on a read moves over (with accent, rating and the characters voiced); if they already narrate that read, the two are combined.
  for (const rn of await db.select<{ id: string; read_id: string; accent_id: string | null; rating: string | null }>('SELECT id, read_id, accent_id, rating FROM read_narrator WHERE narrator_id = ? AND deleted_at IS NULL', [dupId])) {
    if (leave.has(`read_narrator:${rn.id}`)) {
      await drop('read_narrator', rn.id);
      for (const v of await db.select<{ id: string }>('SELECT id FROM read_narrator_character WHERE read_narrator_id = ? AND deleted_at IS NULL', [rn.id])) await drop('read_narrator_character', v.id);
      continue;
    }
    const mine = (await db.select<{ id: string }>('SELECT id FROM read_narrator WHERE read_id = ? AND narrator_id = ? AND deleted_at IS NULL', [rn.read_id, keepId]))[0];
    if (!mine) { await db.execute('UPDATE read_narrator SET narrator_id = ? WHERE id = ?', [keepId, rn.id]); continue; }
    await db.execute('UPDATE read_narrator SET accent_id = COALESCE(accent_id, ?), rating = COALESCE(rating, ?) WHERE id = ?', [rn.accent_id, rn.rating, mine.id]);
    for (const v of await db.select<{ id: string; character_id: string }>('SELECT id, character_id FROM read_narrator_character WHERE read_narrator_id = ? AND deleted_at IS NULL', [rn.id])) {
      if (await first(db, 'SELECT id FROM read_narrator_character WHERE read_narrator_id = ? AND character_id = ? AND deleted_at IS NULL', [mine.id, v.character_id])) await drop('read_narrator_character', v.id);
      else await db.execute('UPDATE read_narrator_character SET read_narrator_id = ? WHERE id = ?', [mine.id, v.id]);
    }
    await drop('read_narrator', rn.id);
  }

  // Default narrators of books, usual accents.
  for (const [table, col] of [['book_narrator', 'book_id'], ['narrator_accent', 'accent_id']] as const) {
    for (const r of await db.select<{ id: string; v: string }>(`SELECT id, ${col} AS v FROM ${table} WHERE narrator_id = ? AND deleted_at IS NULL`, [dupId])) {
      if (leave.has(`${table}:${r.id}`) || await first(db, `SELECT id FROM ${table} WHERE narrator_id = ? AND ${col} = ? AND deleted_at IS NULL`, [keepId, r.v])) await drop(table, r.id);
      else await db.execute(`UPDATE ${table} SET narrator_id = ? WHERE id = ?`, [keepId, r.id]);
    }
  }

  // Names: the duplicate's other names come over, and its main name becomes one too.
  for (const a of await db.select<{ id: string; name: string }>('SELECT id, name FROM narrator_alias WHERE narrator_id = ? AND deleted_at IS NULL', [dupId])) {
    await drop('narrator_alias', a.id);
    if (!leave.has(`narrator_alias:${a.id}`)) await addAlias(db, 'narrator', keepId, a.name);
  }
  if (dup.name.trim().toLowerCase() !== keep.name.trim().toLowerCase()) await addAlias(db, 'narrator', keepId, dup.name);

  await mergePersonFields(db, 'narrator', keep, dup, choice);
  await db.execute(`UPDATE narrator SET deleted_at = ${NOW} WHERE id = ?`, [dupId]);
}

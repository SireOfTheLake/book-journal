import { byTitle } from '../domain/sortKey';
import { voicingCandidates, voicingsOf, type Voicing } from './voicing';
import type { Db, SqlValue } from '../db/adapter';
import { newId } from '../domain/ids';
import { first } from '../import/writer';
import { makeField, resolveValue, type MergeChoice, type MergePlan } from './mergeReview';
import type { Item, LogPlace } from './bookLog';
import { PARTNERS_SQL } from './sql';

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
type Named = 'occupation' | 'sexuality' | 'name_type' | 'character_tag';

// ---------- the list ----------
export interface CharacterListRow {
  id: string; name: string; origin: string | null; is_featured: number; gender: string | null;
  occupations: string | null; partners: string | null; place: string | null; main_books: number; side_books: number; tags: string | null;
  main_titles: string | null; // JSON: the books they are a main character in
}

export const listCharacters = (db: Db) => db.select<CharacterListRow>(
  `SELECT c.id, c.name, c.origin_note AS origin, c.is_featured, c.gender,
     (SELECT group_concat(o.name, ', ') FROM character_occupation co JOIN occupation o ON o.id = co.occupation_id WHERE co.character_id = c.id AND co.deleted_at IS NULL) AS occupations,
     ${PARTNERS_SQL} AS partners,
     (SELECT group_concat(t.name, ', ') FROM character_tag_link l JOIN character_tag t ON t.id = l.character_tag_id WHERE l.character_id = c.id AND l.deleted_at IS NULL) AS tags,
     (SELECT p.name FROM place p WHERE p.id = c.current_place_id) AS place,
     (SELECT json_group_array(json_object('id', x.id, 'title', x.title)) FROM (SELECT b.id AS id, b.title AS title FROM book_character bc JOIN book b ON b.id = bc.book_id WHERE bc.character_id = c.id AND bc.role = 'main' AND bc.deleted_at IS NULL AND b.deleted_at IS NULL ORDER BY CASE WHEN lower(b.title) LIKE \'the %\' THEN lower(substr(b.title, 5)) ELSE lower(b.title) END) x) AS main_titles,
     (SELECT count(*) FROM book_character bc JOIN book b ON b.id = bc.book_id WHERE bc.character_id = c.id AND bc.role = 'main' AND bc.deleted_at IS NULL AND b.deleted_at IS NULL) AS main_books,
     (SELECT count(*) FROM book_character bc JOIN book b ON b.id = bc.book_id WHERE bc.character_id = c.id AND bc.role = 'side' AND bc.deleted_at IS NULL AND b.deleted_at IS NULL) AS side_books
   FROM character c WHERE c.deleted_at IS NULL ORDER BY CASE WHEN lower(c.name) LIKE \'the %\' THEN lower(substr(c.name, 5)) ELSE lower(c.name) END`);

// ---------- one character ----------
export interface CharacterCore {
  id: string; name: string; origin_note: string | null; is_featured: number; description: string | null; gender: 'male' | 'female' | 'non_binary' | 'other' | null;
  gender_detail: string | null; is_transgender: number; age_min: number | null; age_max: number | null; age_is_approximate: number;
  sexuality_id: string | null; organization: string | null; current_place_id: string | null; notes: string | null;
  life_status: 'alive' | 'dead' | 'undead' | null;
}
export type RelStatus = 'deceased' | 'estranged';
export interface Relationship { id: string; other_id: string; other_name: string; other_origin: string | null; other_featured: number; rel_type: 'partner' | 'family' | 'friend' | 'other'; is_current: number | null; label: string | null; status: RelStatus | null; other_life: 'alive' | 'dead' | 'undead' | null }
export interface CharacterBook { id: string; book_id: string; title: string; role: 'main' | 'side'; notes: string | null; read_id: string | null }
export interface CharacterImage { id: string; data: string; is_main: number; tagged: Item[] }
export interface RelatedPerson { id: string; name: string; rel_type: 'partner' | 'family' | 'friend' | 'other'; is_current: number | null; label: string | null; status: RelStatus | null }
export interface CharacterDetail {
  core: CharacterCore; people: RelatedPerson[]; sexuality: Item | null; place: LogPlace | null; previousPlaces: LogPlace[]; occupations: Item[]; tags: Item[];
  altNames: { id: string; name: string; type: string | null }[]; relationships: Relationship[]; books: CharacterBook[];
  series: Item[]; narrators: Item[]; voicings: Voicing[]; voiceOptions: Voicing[]; images: CharacterImage[];
}

// Places with what the location editor needs: the parts of the address and whether it still needs updating.
const placesOf = async (db: Db, sql: string, params: SqlValue[]): Promise<LogPlace[]> =>
  (await db.select<{ id: string; name: string; city: string | null; area: string | null; country: string | null; fictional: number; needs: number }>(sql, params))
    .map((r) => ({ id: r.id, name: r.name, city: r.city, area: r.area, country: r.country, fictional: !!r.fictional, needsUpdate: !!r.needs }));

export async function getCharacter(db: Db, id: string): Promise<CharacterDetail | null> {
  const [core] = await db.select<CharacterCore>(
    `SELECT id, name, origin_note, is_featured, description, gender, gender_detail, is_transgender, age_min, age_max, age_is_approximate, sexuality_id, organization, current_place_id, notes, life_status
     FROM character WHERE id = ? AND deleted_at IS NULL`, [id]);
  if (!core) return null;
  const one = async (sql: string, p: SqlValue[]) => (await db.select<Item>(sql, p))[0] ?? null;
  const relRows = await db.select<{ id: string; a: string; b: string; rel_type: Relationship['rel_type']; is_current: number | null; a_is_to_b: string | null; b_is_to_a: string | null; a_status: RelStatus | null; b_status: RelStatus | null }>(
    'SELECT id, character_a_id AS a, character_b_id AS b, rel_type, is_current, a_is_to_b, b_is_to_a, a_status, b_status FROM character_relationship WHERE (character_a_id = ? OR character_b_id = ?) AND deleted_at IS NULL', [id, id]);
  const relationships: Relationship[] = [];
  for (const r of relRows) {
    const otherId = r.a === id ? r.b : r.a;
    const [o] = await db.select<{ name: string; origin_note: string | null; is_featured: number; life_status: Relationship['other_life'] }>('SELECT name, origin_note, is_featured, life_status FROM character WHERE id = ? AND deleted_at IS NULL', [otherId]);
    if (o) relationships.push({ id: r.id, other_id: otherId, other_name: o.name, other_origin: o.origin_note, other_featured: o.is_featured, rel_type: r.rel_type, is_current: r.is_current, label: r.a === id ? r.b_is_to_a : r.a_is_to_b, status: r.a === id ? r.b_status : r.a_status, other_life: o.life_status });
  }
  relationships.sort((x, y) => byTitle(x.other_name, y.other_name));
  const images = await db.select<{ id: string; data: string; is_main: number }>(
    `SELECT i.id AS id, i.file_path AS data, ci.is_main AS is_main FROM character_image ci JOIN image i ON i.id = ci.image_id
     WHERE ci.character_id = ? AND ci.deleted_at IS NULL AND i.deleted_at IS NULL ORDER BY ci.is_main DESC, ci.sort_order, ci.created_at, ci.rowid`, [id]);
  return {
    core,
    sexuality: core.sexuality_id ? await one('SELECT id, name FROM sexuality WHERE id = ?', [core.sexuality_id]) : null,
    place: core.current_place_id ? (await placesOf(db, 'SELECT x.id AS id, x.name AS name, x.city AS city, x.state_region AS area, x.country AS country, x.is_fictional AS fictional, (x.located = 0 AND x.is_fictional = 0) AS needs FROM place x WHERE x.id = ? AND x.deleted_at IS NULL', [core.current_place_id]))[0] ?? null : null,
    previousPlaces: await placesOf(db, 'SELECT x.id AS id, x.name AS name, x.city AS city, x.state_region AS area, x.country AS country, x.is_fictional AS fictional, (x.located = 0 AND x.is_fictional = 0) AS needs FROM character_previous_place cp JOIN place x ON x.id = cp.place_id WHERE cp.character_id = ? AND cp.deleted_at IS NULL AND x.deleted_at IS NULL ORDER BY cp.sort_order, cp.created_at, cp.rowid', [id]),
    occupations: await db.select<Item>('SELECT o.id AS id, o.name AS name FROM character_occupation co JOIN occupation o ON o.id = co.occupation_id WHERE co.character_id = ? AND co.deleted_at IS NULL ORDER BY CASE WHEN lower(o.name) LIKE \'the %\' THEN lower(substr(o.name, 5)) ELSE lower(o.name) END', [id]),
    tags: await db.select<Item>('SELECT t.id AS id, t.name AS name, t.color AS color FROM character_tag_link l JOIN character_tag t ON t.id = l.character_tag_id WHERE l.character_id = ? AND l.deleted_at IS NULL ORDER BY CASE WHEN lower(t.name) LIKE \'the %\' THEN lower(substr(t.name, 5)) ELSE lower(t.name) END', [id]),
    altNames: await db.select('SELECT a.id AS id, a.name AS name, t.name AS type FROM character_alt_name a LEFT JOIN name_type t ON t.id = a.name_type_id WHERE a.character_id = ? AND a.deleted_at IS NULL ORDER BY a.created_at, a.rowid', [id]),
    relationships,
    people: await db.select<RelatedPerson>('SELECT id, name, rel_type, is_current, label, status FROM related_person WHERE character_id = ? AND deleted_at IS NULL ORDER BY sort_order, created_at, rowid', [id]),
    books: await db.select<CharacterBook>(
      `SELECT bc.id AS id, b.id AS book_id, b.title AS title, bc.role AS role, bc.notes AS notes,
         (SELECT r.id FROM read r WHERE r.book_id = b.id AND r.deleted_at IS NULL ORDER BY r.created_at DESC, r.rowid DESC LIMIT 1) AS read_id
       FROM book_character bc JOIN book b ON b.id = bc.book_id WHERE bc.character_id = ? AND bc.deleted_at IS NULL AND b.deleted_at IS NULL ORDER BY bc.role, CASE WHEN lower(b.title) LIKE \'the %\' THEN lower(substr(b.title, 5)) ELSE lower(b.title) END`, [id]),
    series: await db.select<Item>('SELECT DISTINCT s.id AS id, s.title AS name FROM book_character bc JOIN book b ON b.id = bc.book_id JOIN series s ON s.id = b.series_id WHERE bc.character_id = ? AND bc.deleted_at IS NULL AND b.deleted_at IS NULL ORDER BY CASE WHEN lower(s.title) LIKE \'the %\' THEN lower(substr(s.title, 5)) ELSE lower(s.title) END', [id]),
    voicings: await voicingsOf(db, id), voiceOptions: await voicingCandidates(db, id),
    narrators: await db.select<Item>('SELECT DISTINCT n.id AS id, n.name AS name FROM v_character_voiced_by v JOIN narrator n ON n.id = v.narrator_id WHERE v.character_id = ? ORDER BY CASE WHEN lower(n.name) LIKE \'the %\' THEN lower(substr(n.name, 5)) ELSE lower(n.name) END', [id]),
    images: await Promise.all(images.map(async (im) => ({ ...im, tagged: await db.select<Item>('SELECT c.id AS id, c.name AS name FROM character_image ci JOIN character c ON c.id = ci.character_id WHERE ci.image_id = ? AND ci.character_id != ? AND ci.deleted_at IS NULL', [im.id, id]) }))),
  };
}

// ---------- editing ----------
const COLS = new Set(['name', 'life_status', 'description', 'gender', 'gender_detail', 'is_transgender', 'age_min', 'age_max', 'age_is_approximate', 'sexuality_id', 'organization', 'current_place_id', 'notes', 'is_featured', 'origin_note']);
export async function updateCharacter(db: Db, id: string, fields: Record<string, SqlValue>) {
  const cols = Object.keys(fields).filter((c) => COLS.has(c));
  if (cols.length) await db.execute(`UPDATE character SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [...cols.map((c) => fields[c]), id]);
}

export async function createCharacter(db: Db, name: string, featured = true): Promise<string> {
  const n = name.trim();
  if (!n) throw new Error('A character needs a name.');
  const id = newId();
  await db.execute('INSERT INTO character (id, name, is_featured) VALUES (?, ?, ?)', [id, n, featured ? 1 : 0]);
  return id;
}

export async function findOrCreateNamed(db: Db, table: Named, name: string): Promise<string> {
  const n = name.trim();
  const found = await first(db, `SELECT id FROM ${table} WHERE lower(name) = lower(?) AND deleted_at IS NULL LIMIT 1`, [n]);
  if (found) return found;
  const id = newId();
  await db.execute(`INSERT INTO ${table} (id, name) VALUES (?, ?)`, [id, n]);
  return id;
}

export async function renameNamed(db: Db, table: Named, id: string, name: string) {
  const n = name.trim();
  if (!n) throw new Error('A name cannot be empty.');
  if (await first(db, `SELECT id FROM ${table} WHERE lower(name) = lower(?) AND id != ? AND deleted_at IS NULL`, [n, id])) throw new Error(`There is already one called "${n}".`);
  await db.execute(`UPDATE ${table} SET name = ? WHERE id = ?`, [n, id]);
}

export const listNamed = (db: Db, table: Named | 'place') => db.select<Item>(`SELECT id, name${table === 'character_tag' ? ', color' : table === 'place' ? ', city, state_region AS area, country' : ''} FROM ${table} WHERE deleted_at IS NULL ORDER BY CASE WHEN lower(name) LIKE \'the %\' THEN lower(substr(name, 5)) ELSE lower(name) END`);
export const listCharacterOptions = (db: Db) => db.select<Item & { tags: string | null }>(
  `SELECT c.id AS id, c.name AS name,
     (SELECT group_concat(t.name, ', ') FROM character_tag_link l JOIN character_tag t ON t.id = l.character_tag_id WHERE l.character_id = c.id AND l.deleted_at IS NULL) AS tags
   FROM character c WHERE c.deleted_at IS NULL ORDER BY CASE WHEN lower(c.name) LIKE \'the %\' THEN lower(substr(c.name, 5)) ELSE lower(c.name) END`);
// Everyone you can add to a book, and whether they have a page of their own.
export const listCharacterPicks = (db: Db) => db.select<Item & { featured: number }>(
  `SELECT id, name, is_featured AS featured FROM character WHERE deleted_at IS NULL ORDER BY CASE WHEN lower(name) LIKE \'the %\' THEN lower(substr(name, 5)) ELSE lower(name) END`);

/** Gives a name-only character a page of their own. */
export const giveCharacterPage = (db: Db, id: string) => updateCharacter(db, id, { is_featured: 1 });

/** Links a name-only character to one who has a page: everything moves across, and the name stays as another name if it differs. */
export async function linkCharacterToPage(db: Db, plainId: string, pageId: string): Promise<void> {
  const [target] = await db.select<{ is_featured: number }>('SELECT is_featured FROM character WHERE id = ? AND deleted_at IS NULL', [pageId]);
  if (!target) throw new Error('That character no longer exists.');
  await mergeCharacters(db, pageId, plainId);
}

/** Orders candidates for linking: same name first, then names sharing a word or starting alike, then the rest A to Z. */
export function rankForLink<T extends { name: string }>(name: string, options: T[]): (T & { match: 'same' | 'similar' | null })[] {
  const fold = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const me = fold(name); const words = me.split(' ').filter((w) => w.length > 1);
  const score = (o: T) => {
    const n = fold(o.name);
    if (n === me) return 0;
    if (n.startsWith(me) || me.startsWith(n) || words.some((w) => n.split(' ').includes(w))) return 1;
    return 2;
  };
  return options.map((o, i) => ({ o, i, sc: score(o) })).sort((a, b) => a.sc - b.sc || a.i - b.i)
    .map(({ o, sc }) => ({ ...o, match: sc === 0 ? 'same' as const : sc === 1 ? 'similar' as const : null }));
}

export const listCharacterNames = (db: Db) => db.select<Item>('SELECT id, name FROM character WHERE deleted_at IS NULL ORDER BY CASE WHEN lower(name) LIKE \'the %\' THEN lower(substr(name, 5)) ELSE lower(name) END');

export async function addAltName(db: Db, characterId: string, name: string, typeName: string | null) {
  if (!name.trim()) return;
  await db.execute('INSERT INTO character_alt_name (id, character_id, name, name_type_id) VALUES (?, ?, ?, ?)', [newId(), characterId, name.trim(), typeName?.trim() ? await findOrCreateNamed(db, 'name_type', typeName) : null]);
}
export const removeAltName = (db: Db, id: string) => db.execute(`UPDATE character_alt_name SET deleted_at = ${NOW} WHERE id = ?`, [id]);

async function link(db: Db, table: 'character_occupation' | 'character_tag_link' | 'character_previous_place', charId: string, col: string, itemId: string, extra: Record<string, SqlValue> = {}) {
  if (await first(db, `SELECT id FROM ${table} WHERE character_id = ? AND ${col} = ? AND deleted_at IS NULL`, [charId, itemId])) return;
  const cols = ['id', 'character_id', col, ...Object.keys(extra)];
  await db.execute(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, [newId(), charId, itemId, ...Object.values(extra)]);
}
const unlink = (db: Db, table: string, charId: string, col: string, itemId: string) =>
  db.execute(`UPDATE ${table} SET deleted_at = ${NOW} WHERE character_id = ? AND ${col} = ? AND deleted_at IS NULL`, [charId, itemId]);

export const addOccupation = async (db: Db, c: string, name: string) => name.trim() && link(db, 'character_occupation', c, 'occupation_id', await findOrCreateNamed(db, 'occupation', name));
export const removeOccupation = (db: Db, c: string, itemId: string) => unlink(db, 'character_occupation', c, 'occupation_id', itemId);
export const addCharacterTag = async (db: Db, c: string, name: string) => name.trim() && link(db, 'character_tag_link', c, 'character_tag_id', await findOrCreateNamed(db, 'character_tag', name));
export const removeCharacterTag = (db: Db, c: string, itemId: string) => unlink(db, 'character_tag_link', c, 'character_tag_id', itemId);
export const addPreviousPlace = (db: Db, c: string, placeId: string) => link(db, 'character_previous_place', c, 'place_id', placeId, { sort_order: 0 });
export const removePreviousPlace = (db: Db, c: string, placeId: string) => unlink(db, 'character_previous_place', c, 'place_id', placeId);

// A relationship is stored once per pair and type, with the lower id first. `label` is what the other person is to this one.
export async function addRelationship(db: Db, selfId: string, other: { id: string }, type: Relationship['rel_type'], isCurrent: 0 | 1 | null, label: string | null): Promise<string> {
  const otherId = other.id;
  if (!otherId) throw new Error('Choose a character.');
  if (otherId === selfId) throw new Error('A character cannot be related to themselves.');
  const selfIsA = selfId < otherId;
  const [a, b] = selfIsA ? [selfId, otherId] : [otherId, selfId];
  const lab = label?.trim() || null;
  const existing = await first(db, 'SELECT id FROM character_relationship WHERE character_a_id = ? AND character_b_id = ? AND rel_type = ? AND deleted_at IS NULL', [a, b, type]);
  if (existing) {
    await db.execute(`UPDATE character_relationship SET ${selfIsA ? 'b_is_to_a' : 'a_is_to_b'} = ?, is_current = ? WHERE id = ?`, [lab, isCurrent, existing]);
    return existing;
  }
  const id = newId();
  await db.execute('INSERT INTO character_relationship (id, character_a_id, character_b_id, rel_type, is_current, a_is_to_b, b_is_to_a) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, a, b, type, isCurrent, selfIsA ? null : lab, selfIsA ? lab : null]);
  return id;
}
export const removeRelationship = (db: Db, id: string) => db.execute(`UPDATE character_relationship SET deleted_at = ${NOW} WHERE id = ?`, [id]);
export async function setRelationshipLabel(db: Db, relId: string, selfId: string, label: string | null) {
  const [r] = await db.select<{ a: string }>('SELECT character_a_id AS a FROM character_relationship WHERE id = ?', [relId]);
  await db.execute(`UPDATE character_relationship SET ${r.a === selfId ? 'b_is_to_a' : 'a_is_to_b'} = ? WHERE id = ?`, [label?.trim() || null, relId]);
}
export const setBookNote = (db: Db, bookCharacterId: string, note: string | null) => db.execute('UPDATE book_character SET notes = ? WHERE id = ?', [note?.trim() || null, bookCharacterId]);

// ---------- art ----------
// Pictures are stored inside the database (as a data URL in image.file_path), already shrunk by the screen.
export async function addImage(db: Db, characterId: string, img: { dataUrl: string; width?: number; height?: number; mime?: string }, makeMain = false): Promise<string> {
  const imageId = newId();
  await db.execute('INSERT INTO image (id, file_path, mime_type, width, height) VALUES (?, ?, ?, ?, ?)', [imageId, img.dataUrl, img.mime ?? null, img.width ?? null, img.height ?? null]);
  const [{ n }] = await db.select<{ n: number }>('SELECT count(*) AS n FROM character_image WHERE character_id = ? AND deleted_at IS NULL', [characterId]);
  await db.execute('INSERT INTO character_image (id, character_id, image_id, is_main, sort_order) VALUES (?, ?, ?, 0, ?)', [newId(), characterId, imageId, Number(n)]);
  if (makeMain || Number(n) === 0) await setMainImage(db, characterId, imageId);
  return imageId;
}
export async function setMainImage(db: Db, characterId: string, imageId: string) {
  await db.execute('UPDATE character_image SET is_main = 0 WHERE character_id = ? AND is_main = 1 AND deleted_at IS NULL', [characterId]);
  await db.execute('UPDATE character_image SET is_main = 1 WHERE character_id = ? AND image_id = ? AND deleted_at IS NULL', [characterId, imageId]);
}
export async function removeImage(db: Db, characterId: string, imageId: string) {
  await db.execute(`UPDATE character_image SET deleted_at = ${NOW}, is_main = 0 WHERE character_id = ? AND image_id = ? AND deleted_at IS NULL`, [characterId, imageId]);
  // If nobody uses the picture any more, remove it too.
  if (!(await first(db, 'SELECT id FROM character_image WHERE image_id = ? AND deleted_at IS NULL', [imageId]))) await db.execute(`UPDATE image SET deleted_at = ${NOW} WHERE id = ?`, [imageId]);
}
// Couple art: the same picture also appears on another character's page.
export async function tagImage(db: Db, imageId: string, characterId: string) {
  if (await first(db, 'SELECT id FROM character_image WHERE image_id = ? AND character_id = ? AND deleted_at IS NULL', [imageId, characterId])) return;
  await db.execute('INSERT INTO character_image (id, character_id, image_id, is_main, sort_order) VALUES (?, ?, ?, 0, 99)', [newId(), characterId, imageId]);
}

// ---------- people who are only mentioned (no page) ----------
// A plain person is just a name and a label on the character who mentions them. Two people with the same
// name on different characters are never treated as the same person.
export async function addPerson(db: Db, characterId: string, name: string, type: RelatedPerson['rel_type'], isCurrent: 0 | 1 | null, label: string | null): Promise<string> {
  const n = name.trim();
  if (!n) throw new Error('Type a name.');
  const [{ c }] = await db.select<{ c: number }>('SELECT count(*) AS c FROM related_person WHERE character_id = ? AND deleted_at IS NULL', [characterId]);
  const id = newId();
  await db.execute('INSERT INTO related_person (id, character_id, name, rel_type, is_current, label, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, characterId, n, type, isCurrent, label?.trim() || null, Number(c)]);
  return id;
}
export const removePerson = (db: Db, id: string) => db.execute(`UPDATE related_person SET deleted_at = ${NOW} WHERE id = ?`, [id]);
export const setPersonLabel = (db: Db, id: string, label: string | null) => db.execute('UPDATE related_person SET label = ? WHERE id = ?', [label?.trim() || null, id]);

// When someone turns out to matter: make them a character (or link them to one you already have).
export async function convertPerson(db: Db, personId: string, target: { id?: string | null } = {}): Promise<string> {
  const [p] = await db.select<RelatedPerson & { character_id: string }>('SELECT id, character_id, name, rel_type, is_current, label, status FROM related_person WHERE id = ? AND deleted_at IS NULL', [personId]);
  if (!p) throw new Error('That person could not be found.');
  const characterId = target.id ?? (await createCharacter(db, p.name));
  const relId = await addRelationship(db, p.character_id, { id: characterId }, p.rel_type, p.is_current === null ? null : (p.is_current as 0 | 1), p.label);
  if (p.status) await setRelationshipStatus(db, relId, p.character_id, p.status);
  await removePerson(db, personId);
  return characterId;
}

// ---------- characters and books ----------
export const listBookOptions = (db: Db) => db.select<Item & { authors: string | null }>(
  `SELECT b.id AS id, b.title AS name,
     (SELECT group_concat(x.name, ', ') FROM (SELECT au.name AS name FROM book_author ba JOIN author au ON au.id = ba.author_id WHERE ba.book_id = b.id AND ba.deleted_at IS NULL ORDER BY ba.sort_order) x) AS authors
   FROM book b WHERE b.deleted_at IS NULL ORDER BY CASE WHEN lower(b.title) LIKE \'the %\' THEN lower(substr(b.title, 5)) ELSE lower(b.title) END`);

export async function addCharacterToBook(db: Db, characterId: string, bookId: string, role: 'main' | 'side'): Promise<void> {
  const existing = await first(db, 'SELECT id FROM book_character WHERE book_id = ? AND character_id = ? AND deleted_at IS NULL', [bookId, characterId]);
  if (existing) { await db.execute('UPDATE book_character SET role = ? WHERE id = ?', [role, existing]); return; }
  const [{ n }] = await db.select<{ n: number }>('SELECT count(*) AS n FROM book_character WHERE book_id = ? AND role = ? AND deleted_at IS NULL', [bookId, role]);
  await db.execute('INSERT INTO book_character (id, book_id, character_id, role, sort_order) VALUES (?, ?, ?, ?, ?)', [newId(), bookId, characterId, role, Number(n)]);
}
export const removeCharacterFromBook = (db: Db, bookCharacterId: string) => db.execute(`UPDATE book_character SET deleted_at = ${NOW} WHERE id = ?`, [bookCharacterId]);

// The other person's status (deceased or estranged) as seen from this character. Not used for a current partner.
export async function setRelationshipStatus(db: Db, relId: string, selfId: string, status: RelStatus | null) {
  const [r] = await db.select<{ a: string }>('SELECT character_a_id AS a FROM character_relationship WHERE id = ?', [relId]);
  if (!r) return;
  await db.execute(`UPDATE character_relationship SET ${r.a === selfId ? 'b_status' : 'a_status'} = ? WHERE id = ?`, [status, relId]);
}
export const setPersonStatus = (db: Db, personId: string, status: RelStatus | null) => db.execute('UPDATE related_person SET status = ? WHERE id = ?', [status, personId]);

// ---------- merge and delete ----------
interface RelRow { id: string; character_a_id: string; character_b_id: string; rel_type: Relationship['rel_type']; is_current: number | null; a_is_to_b: string | null; b_is_to_a: string | null; a_status: RelStatus | null; b_status: RelStatus | null; notes: string | null }

// What the merge will move, so the screen can say it before anything happens.
export async function mergePreview(db: Db, dupId: string) {
  const n = async (sql: string, p: SqlValue[]) => Number((await db.select<{ n: number }>(sql, p))[0]?.n ?? 0);
  return {
    books: await n('SELECT count(*) AS n FROM book_character WHERE character_id = ? AND deleted_at IS NULL', [dupId]),
    relationships: await n('SELECT count(*) AS n FROM character_relationship WHERE (character_a_id = ? OR character_b_id = ?) AND deleted_at IS NULL', [dupId, dupId]),
  };
}

const TEXT_FIELDS = new Set(['description', 'origin_note', 'notes']);
const MERGE_LABELS: [string, string][] = [['description', 'Description'], ['gender', 'Gender'], ['gender_detail', 'Gender detail'], ['age_min', 'Youngest age'], ['age_max', 'Oldest age'], ['organization', 'Organization'],
  ['origin_note', 'Where they are from'], ['life_status', 'Alive or dead'], ['notes', 'Notes']];

// Everything the review screen needs: the fields that differ, and the duplicate's items that could come across.
export async function characterMergePlan(db: Db, keepId: string, dupId: string): Promise<MergePlan> {
  const [keep] = await db.select<CharacterCore>('SELECT * FROM character WHERE id = ? AND deleted_at IS NULL', [keepId]);
  const [dup] = await db.select<CharacterCore>('SELECT * FROM character WHERE id = ? AND deleted_at IS NULL', [dupId]);
  if (!keep || !dup) throw new Error('One of those characters no longer exists.');
  const name = async (table: string, id: string | null) => (id ? (await db.select<{ name: string }>(`SELECT name FROM ${table} WHERE id = ?`, [id]))[0]?.name ?? null : null);
  const fields = MERGE_LABELS.map(([k, l]) => makeField(k, l, keep[k as keyof CharacterCore], dup[k as keyof CharacterCore], TEXT_FIELDS.has(k)));
  fields.push(makeField('sexuality_id', 'Sexuality', await name('sexuality', keep.sexuality_id), await name('sexuality', dup.sexuality_id)));
  fields.push(makeField('current_place_id', 'Setting', await name('place', keep.current_place_id), await name('place', dup.current_place_id)));
  // sexuality and setting are stored as ids; the screen shows names but the choice is by key
  const items: MergePlan['items'] = [];
  const add = async (group: string, table: string, sql: string) => { for (const r of await db.select<{ id: string; label: string }>(sql, [dupId])) items.push({ key: `${table}:${r.id}`, group, label: r.label }); };
  await add('Books', 'book_character', "SELECT bc.id AS id, b.title || ' (' || bc.role || ')' AS label FROM book_character bc JOIN book b ON b.id = bc.book_id WHERE bc.character_id = ? AND bc.deleted_at IS NULL AND b.deleted_at IS NULL ORDER BY CASE WHEN lower(b.title) LIKE \'the %\' THEN lower(substr(b.title, 5)) ELSE lower(b.title) END");
  await add('Other names', 'character_alt_name', 'SELECT id, name AS label FROM character_alt_name WHERE character_id = ? AND deleted_at IS NULL ORDER BY created_at, rowid');
  await add('Occupations', 'character_occupation', 'SELECT co.id AS id, o.name AS label FROM character_occupation co JOIN occupation o ON o.id = co.occupation_id WHERE co.character_id = ? AND co.deleted_at IS NULL ORDER BY CASE WHEN lower(o.name) LIKE \'the %\' THEN lower(substr(o.name, 5)) ELSE lower(o.name) END');
  await add('Tags', 'character_tag_link', 'SELECT l.id AS id, t.name AS label FROM character_tag_link l JOIN character_tag t ON t.id = l.character_tag_id WHERE l.character_id = ? AND l.deleted_at IS NULL ORDER BY CASE WHEN lower(t.name) LIKE \'the %\' THEN lower(substr(t.name, 5)) ELSE lower(t.name) END');
  await add('Previous places', 'character_previous_place', 'SELECT cp.id AS id, p.name AS label FROM character_previous_place cp JOIN place p ON p.id = cp.place_id WHERE cp.character_id = ? AND cp.deleted_at IS NULL ORDER BY CASE WHEN lower(p.name) LIKE \'the %\' THEN lower(substr(p.name, 5)) ELSE lower(p.name) END');
  await add('Family and friends', 'related_person', 'SELECT id, name || \' (\' || rel_type || \')\' AS label FROM related_person WHERE character_id = ? AND deleted_at IS NULL ORDER BY CASE WHEN lower(name) LIKE \'the %\' THEN lower(substr(name, 5)) ELSE lower(name) END');
  await add('Relationships', 'character_relationship', `SELECT r.id AS id, o.name || ' (' || r.rel_type || ')' AS label FROM character_relationship r JOIN character o ON o.id = CASE WHEN r.character_a_id = '${dupId}' THEN r.character_b_id ELSE r.character_a_id END
    WHERE (r.character_a_id = '${dupId}' OR r.character_b_id = '${dupId}') AND r.deleted_at IS NULL AND o.id <> '${keepId}' AND ? IS NOT NULL ORDER BY CASE WHEN lower(o.name) LIKE \'the %\' THEN lower(substr(o.name, 5)) ELSE lower(o.name) END`);
  await add('Pictures', 'character_image', "SELECT id, 'Picture ' || (rowid) AS label FROM character_image WHERE character_id = ? AND deleted_at IS NULL ORDER BY created_at, rowid");
  return { fields, items };
}

// Folds `dupId` into `keepId`: everything the duplicate had moves over (nothing is doubled up), the duplicate's
// name is kept as an alternate name, and the duplicate is then soft-deleted. Fields the kept character leaves empty are filled in.
export async function mergeCharacters(db: Db, keepId: string, dupId: string, choice?: MergeChoice): Promise<void> {
  const leave = new Set(choice?.leave ?? []);
  const drop = async (table: string, id: string) => { await db.execute(`UPDATE ${table} SET deleted_at = ${NOW} WHERE id = ?`, [id]); };
  if (keepId === dupId) throw new Error('Choose two different characters.');
  const [keep] = await db.select<CharacterCore>('SELECT * FROM character WHERE id = ? AND deleted_at IS NULL', [keepId]);
  const [dup] = await db.select<CharacterCore>('SELECT * FROM character WHERE id = ? AND deleted_at IS NULL', [dupId]);
  if (!keep || !dup) throw new Error('One of those characters no longer exists.');

  // Books: an existing link wins, except a main role beats a side role. Notes are joined.
  for (const l of await db.select<{ id: string; book_id: string; role: 'main' | 'side'; notes: string | null }>('SELECT id, book_id, role, notes FROM book_character WHERE character_id = ? AND deleted_at IS NULL', [dupId])) {
    if (leave.has(`book_character:${l.id}`)) { await drop('book_character', l.id); continue; }
    const mine = (await db.select<{ id: string; role: string; notes: string | null }>('SELECT id, role, notes FROM book_character WHERE character_id = ? AND book_id = ? AND deleted_at IS NULL', [keepId, l.book_id]))[0];
    if (!mine) { await db.execute('UPDATE book_character SET character_id = ? WHERE id = ?', [keepId, l.id]); continue; }
    const notes = [mine.notes, l.notes].filter((x, i, a): x is string => !!x && a.indexOf(x) === i).join('\n') || null;
    await db.execute('UPDATE book_character SET role = ?, notes = ? WHERE id = ?', [mine.role === 'main' || l.role === 'main' ? 'main' : 'side', notes, mine.id]);
    await db.execute(`UPDATE book_character SET deleted_at = ${NOW} WHERE id = ?`, [l.id]);
  }

  // Narrator voicing.
  for (const v of await db.select<{ id: string; read_narrator_id: string }>('SELECT id, read_narrator_id FROM read_narrator_character WHERE character_id = ? AND deleted_at IS NULL', [dupId])) {
    if (await first(db, 'SELECT id FROM read_narrator_character WHERE read_narrator_id = ? AND character_id = ? AND deleted_at IS NULL', [v.read_narrator_id, keepId])) await db.execute(`UPDATE read_narrator_character SET deleted_at = ${NOW} WHERE id = ?`, [v.id]);
    else await db.execute('UPDATE read_narrator_character SET character_id = ? WHERE id = ?', [keepId, v.id]);
  }

  // Occupations, tags, previous places: move unless the kept character already has it.
  for (const [table, col] of [['character_occupation', 'occupation_id'], ['character_tag_link', 'character_tag_id'], ['character_previous_place', 'place_id']] as const) {
    for (const r of await db.select<{ id: string; v: string }>(`SELECT id, ${col} AS v FROM ${table} WHERE character_id = ? AND deleted_at IS NULL`, [dupId])) {
      if (leave.has(`${table}:${r.id}`)) { await drop(table, r.id); continue; }
      if (await first(db, `SELECT id FROM ${table} WHERE character_id = ? AND ${col} = ? AND deleted_at IS NULL`, [keepId, r.v])) await db.execute(`UPDATE ${table} SET deleted_at = ${NOW} WHERE id = ?`, [r.id]);
      else await db.execute(`UPDATE ${table} SET character_id = ? WHERE id = ?`, [keepId, r.id]);
    }
  }

  // Names: the duplicate's alternate names move over, and its main name becomes one too.
  for (const a of await db.select<{ id: string }>('SELECT id FROM character_alt_name WHERE character_id = ? AND deleted_at IS NULL', [dupId])) {
    if (leave.has(`character_alt_name:${a.id}`)) await drop('character_alt_name', a.id);
    else await db.execute('UPDATE character_alt_name SET character_id = ? WHERE id = ?', [keepId, a.id]);
  }
  const known = (await db.select<{ name: string }>('SELECT name FROM character_alt_name WHERE character_id = ? AND deleted_at IS NULL', [keepId])).map((x) => x.name.toLowerCase());
  if (dup.name.trim().toLowerCase() !== keep.name.trim().toLowerCase() && !known.includes(dup.name.trim().toLowerCase())) await addAltName(db, keepId, dup.name, null);

  // Images: all move; only one stays the main picture.
  const hasMain = !!(await first(db, 'SELECT id FROM character_image WHERE character_id = ? AND is_main = 1 AND deleted_at IS NULL', [keepId]));
  if (hasMain) await db.execute('UPDATE character_image SET is_main = 0 WHERE character_id = ? AND is_main = 1', [dupId]);
  for (const r of await db.select<{ id: string; image_id: string }>('SELECT id, image_id FROM character_image WHERE character_id = ? AND deleted_at IS NULL', [dupId])) {
    if (leave.has(`character_image:${r.id}`)) { await db.execute(`UPDATE character_image SET deleted_at = ${NOW}, is_main = 0 WHERE id = ?`, [r.id]); continue; }
    if (await first(db, 'SELECT id FROM character_image WHERE character_id = ? AND image_id = ? AND deleted_at IS NULL', [keepId, r.image_id])) await db.execute(`UPDATE character_image SET deleted_at = ${NOW}, is_main = 0 WHERE id = ?`, [r.id]);
    else await db.execute('UPDATE character_image SET character_id = ? WHERE id = ?', [keepId, r.id]);
  }

  // Plain related people.
  for (const p of await db.select<{ id: string; name: string; rel_type: string }>('SELECT id, name, rel_type FROM related_person WHERE character_id = ? AND deleted_at IS NULL', [dupId])) {
    if (leave.has(`related_person:${p.id}`)) { await drop('related_person', p.id); continue; }
    if (await first(db, 'SELECT id FROM related_person WHERE character_id = ? AND lower(name) = lower(?) AND rel_type = ? AND deleted_at IS NULL', [keepId, p.name, p.rel_type])) await db.execute(`UPDATE related_person SET deleted_at = ${NOW} WHERE id = ?`, [p.id]);
    else await db.execute('UPDATE related_person SET character_id = ? WHERE id = ?', [keepId, p.id]);
  }

  // Relationships with other characters. A relationship between the two of them just goes away.
  const rels = await db.select<RelRow>('SELECT id, character_a_id, character_b_id, rel_type, is_current, a_is_to_b, b_is_to_a, a_status, b_status, notes FROM character_relationship WHERE (character_a_id = ? OR character_b_id = ?) AND deleted_at IS NULL', [dupId, dupId]);
  for (const r of rels) {
    const dupIsA = r.character_a_id === dupId;
    const other = dupIsA ? r.character_b_id : r.character_a_id;
    await db.execute(`UPDATE character_relationship SET deleted_at = ${NOW} WHERE id = ?`, [r.id]);
    if (other === keepId || leave.has(`character_relationship:${r.id}`)) continue;
    const mine = { label: dupIsA ? r.a_is_to_b : r.b_is_to_a, status: dupIsA ? r.a_status : r.b_status };
    const theirs = { label: dupIsA ? r.b_is_to_a : r.a_is_to_b, status: dupIsA ? r.b_status : r.a_status };
    const keepIsA = keepId < other;
    const [a, b] = keepIsA ? [keepId, other] : [other, keepId];
    const ex = (await db.select<RelRow>('SELECT id, character_a_id, character_b_id, rel_type, is_current, a_is_to_b, b_is_to_a, a_status, b_status, notes FROM character_relationship WHERE character_a_id = ? AND character_b_id = ? AND rel_type = ? AND deleted_at IS NULL', [a, b, r.rel_type]))[0];
    if (ex) {
      const mk = keepIsA ? ['a_is_to_b', 'a_status'] : ['b_is_to_a', 'b_status'], tk = keepIsA ? ['b_is_to_a', 'b_status'] : ['a_is_to_b', 'a_status'];
      await db.execute(`UPDATE character_relationship SET ${mk[0]} = COALESCE(${mk[0]}, ?), ${mk[1]} = COALESCE(${mk[1]}, ?), ${tk[0]} = COALESCE(${tk[0]}, ?), ${tk[1]} = COALESCE(${tk[1]}, ?), is_current = COALESCE(is_current, ?) WHERE id = ?`,
        [mine.label, mine.status, theirs.label, theirs.status, r.is_current, ex.id]);
    } else {
      await db.execute('INSERT INTO character_relationship (id, character_a_id, character_b_id, rel_type, is_current, a_is_to_b, b_is_to_a, a_status, b_status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [newId(), a, b, r.rel_type, r.is_current, keepIsA ? mine.label : theirs.label, keepIsA ? theirs.label : mine.label, keepIsA ? mine.status : theirs.status, keepIsA ? theirs.status : mine.status, r.notes]);
    }
  }

  // Fill what the kept character is missing, then retire the duplicate.
  const fill: Record<string, SqlValue> = {};
  for (const f of ['description', 'gender', 'gender_detail', 'age_min', 'age_max', 'sexuality_id', 'organization', 'current_place_id', 'origin_note', 'notes', 'life_status'] as const) {
    if (choice) {
      const v = resolveValue<SqlValue>(choice.fields[f] ?? 'keep', keep[f] as SqlValue, dup[f] as SqlValue, TEXT_FIELDS.has(f));
      if (v !== undefined) fill[f] = v;
    } else if ((keep[f] === null || keep[f] === '') && dup[f] !== null && dup[f] !== '') fill[f] = dup[f] as SqlValue;
  }
  if (fill.age_min !== undefined || fill.age_max !== undefined) { fill.age_min = fill.age_min ?? keep.age_min; fill.age_max = fill.age_max ?? keep.age_max; }
  if (!keep.is_featured && dup.is_featured) fill.is_featured = 1;
  if (Object.keys(fill).length) await updateCharacter(db, keepId, fill);
  await db.execute(`UPDATE character SET deleted_at = ${NOW} WHERE id = ?`, [dupId]);
}

// Removes a character everywhere: books, relationships and the rest all let go of them.
export async function deleteCharacter(db: Db, id: string): Promise<void> {
  for (const [table, col] of [['book_character', 'character_id'], ['read_narrator_character', 'character_id'], ['character_alt_name', 'character_id'], ['character_occupation', 'character_id'],
    ['character_previous_place', 'character_id'], ['character_tag_link', 'character_id'], ['character_image', 'character_id'], ['related_person', 'character_id'],
    ['character_relationship', 'character_a_id'], ['character_relationship', 'character_b_id']] as const) {
    await db.execute(`UPDATE ${table} SET deleted_at = ${NOW} WHERE ${col} = ? AND deleted_at IS NULL`, [id]);
  }
  await db.execute(`UPDATE character SET deleted_at = ${NOW} WHERE id = ?`, [id]);
}

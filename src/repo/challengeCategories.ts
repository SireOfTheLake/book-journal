import type { Db } from '../db/adapter';
import { newId } from '../domain/ids';
import { ensureJournalYear } from './goals';
import { maxSortOrder } from './challengeOrder';

// Categories are named sections of the Challenges page (one set per journal year). The page is one ordered list whose items are
// categories and challenges that are in no category ("loose" challenges), so loose ones can sit before, between or after categories.
// Top-level items (categories and loose challenges) share one sort_order sequence; a challenge inside a category is ordered by sort_order within it.
export type LayoutItem = { kind: 'category'; id: string; name: string; members: string[] } | { kind: 'challenge'; id: string };

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const first = async <T,>(db: Db, sql: string, params: (string | number | null)[] = []) => (await db.select<T>(sql, params))[0];

interface Loaded { yearId: string; top: string[]; kind: Map<string, 'category' | 'challenge'>; members: Map<string, string[]>; names: Map<string, string> }

async function load(db: Db, yearId: string): Promise<Loaded> {
  const cats = await db.select<{ id: string; name: string; sort_order: number }>(
    'SELECT id, name, sort_order FROM challenge_category WHERE journal_year_id = ? AND deleted_at IS NULL ORDER BY sort_order, created_at, rowid', [yearId]);
  const chs = await db.select<{ id: string; category_id: string | null; sort_order: number }>(
    'SELECT id, category_id, sort_order FROM challenge WHERE journal_year_id = ? AND deleted_at IS NULL ORDER BY sort_order, created_at, rowid', [yearId]);
  const kind = new Map<string, 'category' | 'challenge'>();
  const members = new Map<string, string[]>(cats.map((c) => [c.id, []]));
  const names = new Map(cats.map((c) => [c.id, c.name]));
  const loose: { id: string; sort: number; k: number }[] = [];
  for (const c of cats) kind.set(c.id, 'category');
  for (const c of chs) {
    kind.set(c.id, 'challenge');
    const list = c.category_id ? members.get(c.category_id) : undefined;
    if (list) list.push(c.id); else loose.push({ id: c.id, sort: c.sort_order, k: 1 });
  }
  const top = [...cats.map((c) => ({ id: c.id, sort: c.sort_order, k: 0 })), ...loose].sort((a, b) => a.sort - b.sort || a.k - b.k).map((x) => x.id);
  return { yearId, top, kind, members, names };
}

// Writes the order back: only rows that changed are touched.
async function save(db: Db, L: Loaded) {
  for (const [i, id] of L.top.entries()) {
    if (L.kind.get(id) === 'category') await db.execute('UPDATE challenge_category SET sort_order = ? WHERE id = ? AND sort_order IS NOT ?', [i, id, i]);
    else await db.execute('UPDATE challenge SET sort_order = ?, category_id = NULL WHERE id = ? AND (sort_order IS NOT ? OR category_id IS NOT NULL)', [i, id, i]);
  }
  for (const [cat, ids] of L.members) {
    for (const [j, id] of ids.entries()) await db.execute('UPDATE challenge SET sort_order = ?, category_id = ? WHERE id = ? AND (sort_order IS NOT ? OR category_id IS NOT ?)', [j, cat, id, j, cat]);
  }
}

const yearOfChallenge = async (db: Db, id: string) => {
  const r = await first<{ y: string; c: string | null }>(db, 'SELECT journal_year_id AS y, category_id AS c FROM challenge WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!r) throw new Error('That challenge no longer exists.');
  return r;
};
const yearOfCategory = async (db: Db, id: string) => {
  const r = await first<{ y: string }>(db, 'SELECT journal_year_id AS y FROM challenge_category WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!r) throw new Error('That category no longer exists.');
  return r.y;
};

/** The Challenges page of a year, in order. */
export async function listLayout(db: Db, year: number): Promise<LayoutItem[]> {
  const y = await first<{ id: string }>(db, 'SELECT id FROM journal_year WHERE year = ? AND deleted_at IS NULL', [year]);
  if (!y) return [];
  const L = await load(db, y.id);
  return L.top.map((id) => L.kind.get(id) === 'category' ? { kind: 'category', id, name: L.names.get(id) ?? '', members: L.members.get(id) ?? [] } : { kind: 'challenge', id });
}

async function checkName(db: Db, yearId: string, name: string, exceptId: string | null): Promise<string> {
  const n = name.trim();
  if (!n) throw new Error('Give the category a name.');
  const dup = await first<{ id: string }>(db, 'SELECT id FROM challenge_category WHERE journal_year_id = ? AND deleted_at IS NULL AND lower(name) = lower(?) AND id IS NOT ?', [yearId, n, exceptId]);
  if (dup) throw new Error(`There is already a category called ${n}.`);
  return n;
}

export async function createCategory(db: Db, year: number, name: string): Promise<string> {
  const yr = await first<{ id: string }>(db, 'SELECT id FROM journal_year WHERE year = ? AND deleted_at IS NULL', [year]);
  const yearId = yr?.id ?? await ensureJournalYear(db, year);
  const n = await checkName(db, yearId, name, null);
  const id = newId();
  await db.execute('INSERT INTO challenge_category (id, journal_year_id, name, sort_order) VALUES (?, ?, ?, ?)', [id, yearId, n, (await maxSortOrder(db, yearId)) + 1]);
  return id;
}
export async function renameCategory(db: Db, id: string, name: string) {
  const yearId = await yearOfCategory(db, id);
  await db.execute('UPDATE challenge_category SET name = ? WHERE id = ?', [await checkName(db, yearId, name, id), id]);
}

/** Deleting a category keeps its challenges: they become loose challenges at the place the category was. */
export async function deleteCategory(db: Db, id: string) {
  const yearId = await yearOfCategory(db, id);
  const L = await load(db, yearId);
  const at = L.top.indexOf(id);
  const kids = L.members.get(id) ?? [];
  L.top.splice(at, 1, ...kids);
  L.members.delete(id);
  for (const k of kids) L.kind.set(k, 'challenge');
  L.kind.delete(id);
  await save(db, L);
  await db.execute(`UPDATE challenge_category SET deleted_at = ${NOW} WHERE id = ? AND deleted_at IS NULL`, [id]);
}

/** Puts a challenge into a category (or, with categoryId null, out of any category) before another item there (beforeId null = last). */
export async function placeChallenge(db: Db, id: string, categoryId: string | null, beforeId: string | null) {
  if (beforeId === id) return;
  const me = await yearOfChallenge(db, id);
  const L = await load(db, me.y);
  if (categoryId && !L.members.has(categoryId)) throw new Error('That category no longer exists.');
  L.top = L.top.filter((x) => x !== id);
  for (const [k, v] of L.members) L.members.set(k, v.filter((x) => x !== id));
  const list = categoryId ? L.members.get(categoryId)! : L.top;
  const at = beforeId ? list.indexOf(beforeId) : -1;
  if (beforeId && at < 0) throw new Error('That place is in another category or year.');
  list.splice(at < 0 ? list.length : at, 0, id);
  await save(db, L);
}

/** Puts a category before another top-level item of its year (beforeId null = last). A challenge inside a category counts as that category. */
export async function moveCategory(db: Db, id: string, beforeId: string | null) {
  const yearId = await yearOfCategory(db, id);
  const L = await load(db, yearId);
  let target = beforeId;
  if (target) for (const [cat, ids] of L.members) if (ids.includes(target)) target = cat;
  if (target === id) return;
  L.top = L.top.filter((x) => x !== id);
  const at = target ? L.top.indexOf(target) : -1;
  if (target && at < 0) throw new Error('That place is in another year.');
  L.top.splice(at < 0 ? L.top.length : at, 0, id);
  await save(db, L);
}

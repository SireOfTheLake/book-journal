import type { Db, SqlValue } from '../db/adapter';
import { newId } from '../domain/ids';
import { locationLabel, parseLocationText, standardLocation, validateLocation } from '../domain/geo';

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const first = async <T,>(db: Db, sql: string, params: SqlValue[] = []) => (await db.select<T>(sql, params))[0];

export interface PlaceInput { city?: string | null; area?: string | null; country?: string | null; fictional?: boolean }
export interface PlaceRow { id: string; name: string; city: string | null; area: string | null; country: string | null; fictional: boolean; needsUpdate: boolean; books: number }

// A plain-text place that has not been sorted into city / area / country, and is not marked fictional, needs updating.
export const NEEDS_UPDATE_SQL = '(p.located = 0 AND p.is_fictional = 0)';

export async function listPlaces(db: Db): Promise<PlaceRow[]> {
  const rows = await db.select<{ id: string; name: string; city: string | null; area: string | null; country: string | null; fictional: number; needs: number; books: number }>(
    `SELECT p.id AS id, p.name AS name, p.city AS city, p.state_region AS area, p.country AS country, p.is_fictional AS fictional, ${NEEDS_UPDATE_SQL} AS needs,
       (SELECT count(*) FROM book_place bp JOIN book b ON b.id = bp.book_id AND b.deleted_at IS NULL WHERE bp.place_id = p.id AND bp.deleted_at IS NULL) AS books
     FROM place p WHERE p.deleted_at IS NULL ORDER BY needs DESC, p.name COLLATE NOCASE`);
  return rows.map((r) => ({ id: r.id, name: r.name, city: r.city, area: r.area, country: r.country, fictional: !!r.fictional, needsUpdate: !!r.needs, books: Number(r.books) }));
}

// The locations you can pick for a book: the ones already sorted into city / area / country (or marked fictional), not loose plain text.
export const listPickablePlaces = (db: Db) => db.select<{ id: string; name: string }>(
  `SELECT p.id AS id, p.name AS name FROM place p WHERE p.deleted_at IS NULL AND NOT ${NEEDS_UPDATE_SQL} ORDER BY p.name COLLATE NOCASE`);

// How many locations used by a book still need updating (this is what To Tidy shows). A tag that is removed from its books stops counting.
export async function countPlacesNeedingUpdate(db: Db): Promise<number> {
  return Number((await first<{ n: number }>(db,
    `SELECT count(*) AS n FROM place p WHERE p.deleted_at IS NULL AND ${NEEDS_UPDATE_SQL}
       AND EXISTS (SELECT 1 FROM book_place bp JOIN book b ON b.id = bp.book_id AND b.deleted_at IS NULL WHERE bp.place_id = p.id AND bp.deleted_at IS NULL)`))?.n ?? 0);
}

const byLabel = (db: Db, label: string, notId: string | null = null) =>
  first<{ id: string; located: number }>(db, 'SELECT id, located FROM place WHERE lower(name) = lower(?) AND deleted_at IS NULL AND id <> ? LIMIT 1', [label, notId ?? '']);

// Everything that pointed at one place now points at the other, and the first one goes away.
export async function mergePlaces(db: Db, fromId: string, intoId: string): Promise<void> {
  if (fromId === intoId) return;
  for (const [table, owner] of [['book_place', 'book_id'], ['character_previous_place', 'character_id']] as const) {
    for (const r of await db.select<{ id: string; o: string }>(`SELECT id, ${owner} AS o FROM ${table} WHERE place_id = ? AND deleted_at IS NULL`, [fromId])) {
      const have = await first<{ id: string }>(db, `SELECT id FROM ${table} WHERE ${owner} = ? AND place_id = ? AND deleted_at IS NULL`, [r.o, intoId]);
      if (have) await db.execute(`UPDATE ${table} SET deleted_at = ${NOW} WHERE id = ?`, [r.id]);
      else await db.execute(`UPDATE ${table} SET place_id = ? WHERE id = ?`, [intoId, r.id]);
    }
  }
  await db.execute('UPDATE book SET setting_place_id = ? WHERE setting_place_id = ?', [intoId, fromId]);
  await db.execute('UPDATE character SET current_place_id = ? WHERE current_place_id = ?', [intoId, fromId]);
  await db.execute(`UPDATE place SET deleted_at = ${NOW} WHERE id = ?`, [fromId]);
}

// Creates or changes a location. Returns the place that now holds it: when the new wording matches another place, the two become one.
export async function savePlace(db: Db, id: string | null, input: PlaceInput): Promise<string> {
  const o = { fictional: !!input.fictional };
  const err = validateLocation(input);
  if (err) throw new Error(err);
  const loc = standardLocation(input);
  const label = locationLabel(loc);
  const twin = await byLabel(db, label, id);
  // An old plain-text place with this same label is the one being given its city, area and country, so it is filled in rather than left flagged.
  const claim = async () => { if (twin && !twin.located) await db.execute('UPDATE place SET name = ?, city = ?, state_region = ?, country = ?, is_fictional = ?, located = 1 WHERE id = ?', [label, loc.city, loc.area, loc.country, o.fictional ? 1 : 0, twin.id]); };
  if (!id) {
    if (twin) { await claim(); return twin.id; }
    const nid = newId();
    await db.execute('INSERT INTO place (id, name, city, state_region, country, is_fictional, located) VALUES (?, ?, ?, ?, ?, ?, 1)', [nid, label, loc.city, loc.area, loc.country, o.fictional ? 1 : 0]);
    return nid;
  }
  if (!(await first(db, 'SELECT id FROM place WHERE id = ? AND deleted_at IS NULL', [id]))) throw new Error('That location no longer exists.');
  await db.execute('UPDATE place SET name = ?, city = ?, state_region = ?, country = ?, is_fictional = ?, located = 1 WHERE id = ?', [label, loc.city, loc.area, loc.country, o.fictional ? 1 : 0, id]);
  if (twin) { await claim(); await mergePlaces(db, id, twin.id); return twin.id; }
  return id;
}

// A place from plain text (a typed tag, an import): an old one with that name is reused; otherwise the text is sorted into city / area / country when it is clear, and kept as plain text (needing an update) when it is not.
export async function findOrCreatePlace(db: Db, text: string): Promise<string> {
  const t = text.trim().replace(/\s+/g, ' ');
  const same = await byLabel(db, t);
  if (same) return same.id;
  const parsed = parseLocationText(t);
  if (parsed) return savePlace(db, null, parsed);
  const nid = newId();
  await db.execute('INSERT INTO place (id, name, located) VALUES (?, ?, 0)', [nid, t]);
  return nid;
}

// Sorts every plain-text place that can be sorted with confidence. Safe to run again; what it cannot place stays plain text and keeps its warning.
export async function normalizePlaces(db: Db): Promise<{ converted: number; flagged: number }> {
  let converted = 0, flagged = 0;
  const rows = await db.select<{ id: string; name: string }>('SELECT id, name FROM place WHERE located = 0 AND is_fictional = 0 AND deleted_at IS NULL');
  for (const r of rows) {
    const parsed = parseLocationText(r.name);
    if (!parsed) { flagged++; continue; }
    await savePlace(db, r.id, parsed);
    converted++;
  }
  return { converted, flagged };
}

// Adds a (new or changed) location to a book.
export async function addLocationToBook(db: Db, bookId: string, input: PlaceInput): Promise<string> {
  const id = await savePlace(db, null, input);
  if (!(await first(db, 'SELECT id FROM book_place WHERE book_id = ? AND place_id = ? AND deleted_at IS NULL', [bookId, id]))) {
    const n = (await first<{ n: number | null }>(db, 'SELECT max(sort_order) AS n FROM book_place WHERE book_id = ? AND deleted_at IS NULL', [bookId]))?.n ?? -1;
    await db.execute('INSERT INTO book_place (id, book_id, place_id, sort_order) VALUES (?, ?, ?, ?)', [newId(), bookId, id, n + 1]);
  }
  return id;
}

// What has been used already, to suggest when typing a country, area or city.
export interface PlaceParts { countries: string[]; areas: { country: string | null; area: string }[]; cities: { city: string; area: string | null; country: string | null }[] }
export async function listPlaceParts(db: Db): Promise<PlaceParts> {
  const rows = await db.select<{ city: string | null; area: string | null; country: string | null }>('SELECT DISTINCT city, state_region AS area, country FROM place WHERE deleted_at IS NULL');
  const countries = [...new Set(rows.flatMap((r) => (r.country ? [r.country] : [])))];
  const seen = new Set<string>();
  const areas = rows.flatMap((r) => { const k = `${r.country}|${r.area}`; if (!r.area || seen.has(k)) return []; seen.add(k); return [{ country: r.country, area: r.area }]; });
  const cities = rows.flatMap((r) => (r.city ? [{ city: r.city, area: r.area, country: r.country }] : []));
  return { countries, areas, cities };
}

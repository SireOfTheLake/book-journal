import type { Db } from '../db/adapter';
import { accentAt, isHexColor } from '../domain/challenges';
import { newId } from '../domain/ids';
import { AUSTRALIA, canSplitUk, mapDef, mapPlaces, OCEANIA, optionBits, optionsOf, UK, UK_NATIONS, type BonusMode, type MapId } from '../domain/maps';
import { pickMapColor } from '../domain/usMap';
import { ensureJournalYear } from './goals';
import { fillSlot } from './challenges';

const first = async <T,>(db: Db, sql: string, params: (string | number | null)[] = []) => (await db.select<T>(sql, params))[0];
const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

// The map challenges: a Grid challenge whose prompts are the places of a map (states, provinces, continents or countries).
// Either every place is a prompt, or the challenge is limited ("complete after N") and has N boxes, each holding a book and, once you choose it, the place it is for.
export interface NewMap { year: number; name: string; color?: string; region?: MapId; limit?: number | null; bonus?: BonusMode; australia?: boolean; ukSplit?: boolean }
export type NewUsMap = NewMap;

const BONUS_MODES: BonusMode[] = ['optional', 'required', 'off'];
export const isBonusMode = (v: unknown): v is BonusMode => BONUS_MODES.includes(v as BonusMode);
const checkLimit = (region: MapId, bonus: BonusMode, limit: number, australia = false, ukSplit = false) => {
  const max = mapPlaces(region, bonus, australia, ukSplit).length;
  if (!Number.isInteger(limit) || limit < 1 || limit > max) throw new Error(`Pick a number from 1 to ${max}.`);
};

export async function createMap(db: Db, input: NewMap): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new Error('Give the challenge a name.');
  const region = input.region ?? 'us';
  const def = mapDef(region);
  const bonus: BonusMode = input.bonus ?? (region === 'us' ? 'off' : 'optional'); // a US map starts with DC and the territories left out
  const australia = region === 'continents' && !!input.australia;
  const ukSplit = canSplitUk(region) && !!input.ukSplit;
  const limit = input.limit ?? null;
  if (limit !== null) checkLimit(region, bonus, limit, australia, ukSplit);
  const places = mapPlaces(region, bonus, australia, ukSplit);
  const base = places.filter((p) => !p.bonus).length;
  const yearId = await ensureJournalYear(db, input.year);
  const order = (await first<{ n: number | null }>(db, 'SELECT max(sort_order) AS n FROM challenge WHERE journal_year_id = ? AND deleted_at IS NULL', [yearId]))?.n ?? -1;
  const id = newId();
  const goal = limit ?? (bonus === 'required' ? places.length : base);
  await db.execute(`INSERT INTO challenge (id, journal_year_id, name, color, slot_kind, kind, goal_count, sort_order, us_map, map_region, bonus_mode, map_limit, map_australia) VALUES (?, ?, ?, ?, 'grid', 'grid', ?, ?, 1, ?, ?, ?, ?)`,
    [id, yearId, name, isHexColor(input.color) ? input.color.toLowerCase() : accentAt(order + 1), goal, order + 1, def.id, bonus, limit, optionBits({ australia, ukSplit })]);
  let pos = 1;
  if (limit !== null) for (let i = 0; i < limit; i++) await db.execute("INSERT INTO challenge_slot (id, challenge_id, label, position) VALUES (?, ?, '', ?)", [newId(), id, pos++]);
  else for (const p of places) await db.execute('INSERT INTO challenge_slot (id, challenge_id, label, position, is_bonus) VALUES (?, ?, ?, ?, ?)', [newId(), id, p.name, pos++, p.bonus ? 1 : 0]);
  return id;
}
export const createUsMap = (db: Db, input: NewUsMap) => createMap(db, { ...input, region: 'us' });

interface MapRow { id: string; region: MapId; bonus: BonusMode; limit: number | null; australia: boolean; ukSplit: boolean }
async function loadMap(db: Db, id: string): Promise<MapRow> {
  const c = await first<{ us_map: number; map_region: string | null; bonus_mode: string; map_limit: number | null; map_australia: number }>(db, 'SELECT us_map, map_region, bonus_mode, map_limit, map_australia FROM challenge WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!c?.us_map) throw new Error('That is not a map challenge.');
  return { id, region: mapDef(c.map_region).id, bonus: isBonusMode(c.bonus_mode) ? c.bonus_mode : 'optional', limit: c.map_limit, ...optionsOf(c.map_australia) };
}
const liveSlots = (db: Db, id: string) => db.select<{ id: string; label: string; is_bonus: number; position: number; has_book: number }>(
  `SELECT s.id AS id, s.label AS label, s.is_bonus AS is_bonus, s.position AS position, EXISTS (SELECT 1 FROM challenge_completion k WHERE k.slot_id = s.id AND k.deleted_at IS NULL) AS has_book
   FROM challenge_slot s WHERE s.challenge_id = ? AND s.deleted_at IS NULL ORDER BY s.position`, [id]);
const nextPosition = async (db: Db, id: string) => ((await first<{ n: number | null }>(db, 'SELECT max(position) AS n FROM challenge_slot WHERE challenge_id = ?', [id]))?.n ?? 0) + 1;
const dropSlot = async (db: Db, slotId: string) => {
  await db.execute(`UPDATE challenge_completion SET deleted_at = ${NOW} WHERE slot_id = ? AND deleted_at IS NULL`, [slotId]);
  await db.execute(`UPDATE challenge_slot SET deleted_at = ${NOW}, color = NULL WHERE id = ?`, [slotId]);
};
// A full map has a card for every place; the bonus ones are added the first time they are wanted (they stay, hidden, when bonus places are left out again).
async function ensurePlaces(db: Db, m: MapRow) {
  const have = new Set((await liveSlots(db, m.id)).map((s) => s.label));
  let pos = await nextPosition(db, m.id);
  for (const p of mapPlaces(m.region, m.bonus, m.australia, m.ukSplit)) if (!have.has(p.name)) await db.execute('INSERT INTO challenge_slot (id, challenge_id, label, position, is_bonus) VALUES (?, ?, ?, ?, ?)', [newId(), m.id, p.name, pos++, p.bonus ? 1 : 0]);
}

// Bonus places: optional (extra points that are not part of the goal), required (part of the goal) or left out.
export async function setBonusMode(db: Db, id: string, mode: BonusMode) {
  if (!isBonusMode(mode)) throw new Error('Bonus places can be optional, required or left out.');
  const m = await loadMap(db, id);
  await db.execute('UPDATE challenge SET bonus_mode = ? WHERE id = ?', [mode, id]);
  if (m.limit === null && mode !== 'off') await ensurePlaces(db, { ...m, bonus: mode });
}

// The continent Oceania can be called Australia.
export async function setAustralia(db: Db, id: string, on: boolean) {
  const m = await loadMap(db, id);
  if (m.region !== 'continents') throw new Error('Only the continents map has Oceania.');
  await db.execute('UPDATE challenge SET map_australia = ? WHERE id = ?', [optionBits({ australia: on, ukSplit: m.ukSplit }), id]);
  const [from, to] = on ? [OCEANIA, AUSTRALIA] : [AUSTRALIA, OCEANIA];
  await db.execute('UPDATE challenge_slot SET label = ? WHERE challenge_id = ? AND label = ? AND deleted_at IS NULL', [to, id, from]);
}

// The United Kingdom as one place, or as England, Northern Ireland, Scotland and Wales (world and Europe maps).
// Splitting: a book on the United Kingdom moves to England (change it if it was another nation). Merging: the nations become one place;
// if more than one nation has a book that cannot be done, and nothing is changed.
export async function setUkSplit(db: Db, id: string, on: boolean) {
  const m = await loadMap(db, id);
  if (!canSplitUk(m.region)) throw new Error('Only the world map and the Europe map have the United Kingdom.');
  if (m.ukSplit === on) return;
  const slots = await liveSlots(db, id);
  const nations = slots.filter((s) => UK_NATIONS.includes(s.label));
  if (!on && nations.filter((s) => s.has_book).length > 1) throw new Error('More than one nation has a book. Take the extra books off first, then put the United Kingdom back together.');
  await db.execute('UPDATE challenge SET map_australia = ? WHERE id = ?', [optionBits({ australia: m.australia, ukSplit: on }), id]);
  const after = { ...m, ukSplit: on };
  if (on) {
    const uk = slots.find((s) => s.label === UK);
    if (uk) {
      if (m.limit === null && !uk.has_book) await dropSlot(db, uk.id);
      else if (m.limit === null) await db.execute("UPDATE challenge_slot SET label = 'England' WHERE id = ?", [uk.id]);
      else await db.execute("UPDATE challenge_slot SET label = '' WHERE id = ?", [uk.id]); // a box: choose the nation again
    }
  } else {
    const keep = nations.find((s) => s.has_book) ?? nations[0];
    for (const s of nations) {
      if (s === keep) continue;
      if (m.limit === null) await dropSlot(db, s.id); else await db.execute("UPDATE challenge_slot SET label = '' WHERE id = ?", [s.id]);
    }
    if (keep) await db.execute('UPDATE challenge_slot SET label = ? WHERE id = ?', [UK, keep.id]);
  }
  if (m.limit === null) await ensurePlaces(db, after);
}

// Switches between "a card for every place" (limit null) and "complete after N" with N boxes, or changes N.
// Going to every place, a box with a book but no place loses its book from this challenge (the book itself stays); the number returned is how many.
export async function setMapLimit(db: Db, id: string, limit: number | null): Promise<number> {
  const m = await loadMap(db, id);
  const slots = await liveSlots(db, id);
  let lost = 0;
  if (limit === null) {
    if (m.limit === null) return 0;
    for (const s of slots) if (!s.label) { if (s.has_book) lost++; await dropSlot(db, s.id); }
    await db.execute('UPDATE challenge SET map_limit = NULL WHERE id = ?', [id]);
    const places = new Map(mapPlaces(m.region, m.bonus, m.australia, m.ukSplit).map((p) => [p.name, !!p.bonus]));
    for (const s of slots) if (s.label && places.has(s.label)) await db.execute('UPDATE challenge_slot SET is_bonus = ? WHERE id = ?', [places.get(s.label) ? 1 : 0, s.id]);
    await ensurePlaces(db, { ...m, limit: null });
    return lost;
  }
  checkLimit(m.region, m.bonus, limit, m.australia, m.ukSplit);
  const keep = slots.filter((s) => s.has_book || (m.limit === null ? false : s.label !== ''));
  if (m.limit === null) { // from every place: the places with a book become boxes, the rest go
    if (keep.length > limit) throw new Error(`${keep.length} places already have a book. Pick a number of at least ${keep.length}, or take some books off first.`);
    for (const s of slots) if (!keep.some((k) => k.id === s.id)) await dropSlot(db, s.id);
    await db.execute('UPDATE challenge_slot SET is_bonus = 0 WHERE challenge_id = ? AND deleted_at IS NULL', [id]);
  } else if (slots.length > limit) { // fewer boxes: empty ones go first (no place and no book, then no book)
    const spare = [...slots].sort((a, b) => (Number(!!a.label) + Number(!!a.has_book) * 2) - (Number(!!b.label) + Number(!!b.has_book) * 2) || b.position - a.position);
    const drop = spare.slice(0, slots.length - limit);
    if (drop.some((s) => s.has_book)) throw new Error(`${slots.length - spare.filter((s) => !s.has_book).length} boxes already have a book. Pick a number of at least that, or take some books off first.`);
    for (const s of drop) await dropSlot(db, s.id);
  }
  const now = (await liveSlots(db, id)).length;
  let pos = await nextPosition(db, id);
  for (let i = now; i < limit; i++) await db.execute("INSERT INTO challenge_slot (id, challenge_id, label, position) VALUES (?, ?, '', ?)", [newId(), id, pos++]);
  await db.execute('UPDATE challenge SET map_limit = ?, goal_count = ? WHERE id = ?', [limit, limit, id]);
  return 0;
}

// Chooses which place a box on a limited map is for (null clears it). A place can only be used once.
export async function setSlotPlace(db: Db, slotId: string, place: string | null) {
  const s = await first<{ challenge_id: string }>(db, 'SELECT challenge_id FROM challenge_slot WHERE id = ? AND deleted_at IS NULL', [slotId]);
  if (!s) throw new Error('That box no longer exists.');
  const m = await loadMap(db, s.challenge_id);
  if (m.limit === null) throw new Error('Only a limited map has boxes to choose a place for.');
  if (place === null || place === '') { await db.execute("UPDATE challenge_slot SET label = '' WHERE id = ?", [slotId]); return; }
  if (!mapPlaces(m.region, m.bonus, m.australia, m.ukSplit).some((p) => p.name === place)) throw new Error(`${place} is not one of the ${mapDef(m.region).plural} on this map.`);
  const used = await first<{ id: string }>(db, 'SELECT id FROM challenge_slot WHERE challenge_id = ? AND deleted_at IS NULL AND label = ? AND id <> ?', [s.challenge_id, place, slotId]);
  if (used) throw new Error(`${place} is already used on another book.`);
  await db.execute('UPDATE challenge_slot SET label = ? WHERE id = ?', [place, slotId]);
}

// On a limited map: puts a book on a chosen place, in the earliest box that has no book (one with no place yet comes first).
export async function fillPlace(db: Db, challengeId: string, place: string, readId: string): Promise<void> {
  const m = await loadMap(db, challengeId);
  if (m.limit === null) throw new Error('Only a limited map has boxes to put a book in.');
  const slots = await liveSlots(db, challengeId);
  const mine = slots.find((s) => s.label === place);
  if (mine) { await fillSlot(db, mine.id, readId); return; }
  const target = slots.find((s) => !s.has_book && !s.label) ?? slots.find((s) => !s.has_book);
  if (!target) throw new Error('Every box already has a book. Take one off, or make the challenge bigger, first.');
  await setSlotPlace(db, target.id, place);
  try { await fillSlot(db, target.id, readId); } catch (e) { await db.execute('UPDATE challenge_slot SET label = ? WHERE id = ?', [target.label, target.id]); throw e; }
}

// Gives a place a different random color (never the one it has now).
export async function rerollStateColor(db: Db, slotId: string, rng: () => number = Math.random): Promise<string> {
  const s = await first<{ challenge_id: string; color: string | null; us_map: number }>(db, 'SELECT s.challenge_id AS challenge_id, s.color AS color, c.us_map AS us_map FROM challenge_slot s JOIN challenge c ON c.id = s.challenge_id WHERE s.id = ? AND s.deleted_at IS NULL', [slotId]);
  if (!s?.us_map) throw new Error('That is not a place on a map.');
  const others = (await db.select<{ color: string | null }>('SELECT s.color AS color FROM challenge_slot s JOIN challenge_completion k ON k.slot_id = s.id AND k.deleted_at IS NULL WHERE s.challenge_id = ? AND s.deleted_at IS NULL AND s.id <> ?', [s.challenge_id, slotId])).map((r) => r.color);
  const color = pickMapColor(others, rng, s.color);
  await db.execute('UPDATE challenge_slot SET color = ? WHERE id = ?', [color, slotId]);
  return color;
}

import type { Db } from '../db/adapter';
import { newId } from '../domain/ids';
import { mapDef, mapPlaces, optionsOf, type BonusMode, type MapId } from '../domain/maps';

const first = async <T,>(db: Db, sql: string, params: (string | number | null)[] = []) => (await db.select<T>(sql, params))[0];
const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const BONUS_MODES: BonusMode[] = ['optional', 'required', 'off'];
export const isBonusMode = (v: unknown): v is BonusMode => BONUS_MODES.includes(v as BonusMode);

export interface MapRow { id: string; region: MapId; bonus: BonusMode; territories: BonusMode; limit: number | null; australia: boolean; ukSplit: boolean; extras: boolean }
export async function loadMap(db: Db, id: string): Promise<MapRow> {
  const c = await first<{ us_map: number; map_region: string | null; bonus_mode: string; territory_mode: string | null; map_limit: number | null; map_australia: number }>(db, 'SELECT us_map, map_region, bonus_mode, territory_mode, map_limit, map_australia FROM challenge WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!c?.us_map) throw new Error('That is not a map challenge.');
  return { id, region: mapDef(c.map_region).id, bonus: isBonusMode(c.bonus_mode) ? c.bonus_mode : 'optional', territories: isBonusMode(c.territory_mode) ? c.territory_mode : isBonusMode(c.bonus_mode) ? c.bonus_mode : 'optional', limit: c.map_limit, ...optionsOf(c.map_australia) };
}
export interface LiveSlot { id: string; label: string; is_bonus: number; position: number; has_book: number }
export const liveSlots = (db: Db, id: string) => db.select<LiveSlot>(
  `SELECT s.id AS id, s.label AS label, s.is_bonus AS is_bonus, s.position AS position, EXISTS (SELECT 1 FROM challenge_completion k WHERE k.slot_id = s.id AND k.deleted_at IS NULL) AS has_book
   FROM challenge_slot s WHERE s.challenge_id = ? AND s.deleted_at IS NULL ORDER BY s.position`, [id]);
export const nextPosition = async (db: Db, id: string) => ((await first<{ n: number | null }>(db, 'SELECT max(position) AS n FROM challenge_slot WHERE challenge_id = ?', [id]))?.n ?? 0) + 1;
export const dropSlot = async (db: Db, slotId: string) => {
  await db.execute(`UPDATE challenge_completion SET deleted_at = ${NOW} WHERE slot_id = ? AND deleted_at IS NULL`, [slotId]);
  await db.execute(`UPDATE challenge_slot SET deleted_at = ${NOW}, color = NULL WHERE id = ?`, [slotId]);
};

// Extra boxes on a limited map that allows extras: once every required box has a book there is exactly one empty extra box (a bonus), and a new one
// appears each time it is filled, until every place has been chosen. Empty extra boxes go away when they are no longer wanted. Extras with a book stay.
export async function syncBonusBoxes(db: Db, challengeId: string): Promise<void> {
  let m: MapRow;
  try { m = await loadMap(db, challengeId); } catch { return; }
  if (m.limit === null) return;
  const slots = await liveSlots(db, challengeId);
  const required = slots.filter((s) => !s.is_bonus);
  const extras = slots.filter((s) => s.is_bonus);
  const emptyExtras = extras.filter((s) => !s.has_book);
  const chosen = new Set(slots.map((s) => s.label).filter(Boolean));
  const open = m.extras && required.length > 0 && required.every((s) => s.has_book) && mapPlaces(m.region, m.bonus, m.australia, m.ukSplit, m.territories).some((p) => !chosen.has(p.name));
  if (!open) { for (const s of emptyExtras) await dropSlot(db, s.id); return; }
  if (emptyExtras.length === 0) await db.execute("INSERT INTO challenge_slot (id, challenge_id, label, position, is_bonus) VALUES (?, ?, '', ?, 1)", [newId(), challengeId, await nextPosition(db, challengeId)]);
  else for (const s of emptyExtras.slice(1)) await dropSlot(db, s.id);
}

import type { Db } from '../db/adapter';
import { accentAt, isHexColor } from '../domain/challenges';
import { newId } from '../domain/ids';
import { pickMapColor, STATE_NAMES } from '../domain/usMap';
import { ensureJournalYear } from './goals';

const first = async <T,>(db: Db, sql: string, params: (string | number | null)[] = []) => (await db.select<T>(sql, params))[0];

export interface NewUsMap { year: number; name: string; color?: string }

// A US map challenge is a Grid challenge whose prompts are the 50 states (alphabetical). A state's fill color is chosen when a book is put on it.
export async function createUsMap(db: Db, input: NewUsMap): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new Error('Give the challenge a name.');
  const yearId = await ensureJournalYear(db, input.year);
  const order = (await first<{ n: number | null }>(db, 'SELECT max(sort_order) AS n FROM challenge WHERE journal_year_id = ? AND deleted_at IS NULL', [yearId]))?.n ?? -1;
  const id = newId();
  await db.execute(`INSERT INTO challenge (id, journal_year_id, name, color, slot_kind, kind, goal_count, sort_order, us_map) VALUES (?, ?, ?, ?, 'grid', 'grid', ?, ?, 1)`,
    [id, yearId, name, isHexColor(input.color) ? input.color.toLowerCase() : accentAt(order + 1), STATE_NAMES.length, order + 1]);
  let pos = 1;
  for (const state of STATE_NAMES) await db.execute('INSERT INTO challenge_slot (id, challenge_id, label, position) VALUES (?, ?, ?, ?)', [newId(), id, state, pos++]);
  return id;
}

// Gives a state a different random color (never the one it has now).
export async function rerollStateColor(db: Db, slotId: string, rng: () => number = Math.random): Promise<string> {
  const s = await first<{ challenge_id: string; color: string | null; us_map: number }>(db, 'SELECT s.challenge_id AS challenge_id, s.color AS color, c.us_map AS us_map FROM challenge_slot s JOIN challenge c ON c.id = s.challenge_id WHERE s.id = ? AND s.deleted_at IS NULL', [slotId]);
  if (!s?.us_map) throw new Error('That is not a state on a US map.');
  const others = (await db.select<{ color: string | null }>('SELECT s.color AS color FROM challenge_slot s JOIN challenge_completion k ON k.slot_id = s.id AND k.deleted_at IS NULL WHERE s.challenge_id = ? AND s.deleted_at IS NULL AND s.id <> ?', [s.challenge_id, slotId])).map((r) => r.color);
  const color = pickMapColor(others, rng, s.color);
  await db.execute('UPDATE challenge_slot SET color = ? WHERE id = ?', [color, slotId]);
  return color;
}

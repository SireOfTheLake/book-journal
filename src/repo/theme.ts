import type { Db } from '../db/adapter';
import { parseTheme, serializeTheme, type ThemeSettings } from '../theme/themes';

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
export async function loadTheme(db: Db): Promise<ThemeSettings> {
  const [row] = await db.select<{ value: string }>("SELECT value FROM app_setting WHERE key = 'theme'");
  return parseTheme(row?.value);
}
export const saveTheme = (db: Db, t: ThemeSettings) =>
  db.execute(`INSERT INTO app_setting (key, value) VALUES ('theme', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = ${NOW}`, [serializeTheme(t)]);

// ---------- the color of each genre, theme, and trope ----------
export type TagKind = 'genre' | 'theme' | 'trope';
export interface TagColorRow { id: string; name: string; color: string | null; books: number }
export const listTagColors = (db: Db, kind: TagKind) => db.select<TagColorRow>(
  `SELECT x.id AS id, x.name AS name, x.color AS color, (SELECT count(*) FROM book_${kind} j WHERE j.${kind}_id = x.id AND j.deleted_at IS NULL) AS books
   FROM ${kind} x WHERE x.deleted_at IS NULL ORDER BY x.name COLLATE NOCASE`);
export async function setTagColor(db: Db, kind: TagKind, id: string, color: string) {
  if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('That is not a color.');
  await db.execute(`UPDATE ${kind} SET color = ? WHERE id = ?`, [color.toLowerCase(), id]);
}

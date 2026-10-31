import type { Db } from '../db/adapter';
import { defaultLayout, normalizeLayout, type BookLayout, type Flags } from '../domain/bookLayout';

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const keyName = (key: string) => `book_layout:${key}`;
const DEFAULT_KEY = 'book_layout_default_choice';

/** The saved layout (or the default one), cleaned up for the features that are on. */
export async function getLayout(db: Db, key: string, flags: Flags): Promise<BookLayout> {
  // The layout saved for this key, else the one you set as your default, else the built-in default
  const [row] = await db.select<{ value: string }>('SELECT value FROM app_setting WHERE key IN (?, ?) ORDER BY CASE key WHEN ? THEN 0 ELSE 1 END LIMIT 1', [keyName(key), DEFAULT_KEY, keyName(key)]);
  let raw: unknown = null;
  try { raw = row ? JSON.parse(row.value) : null; } catch { raw = null; }
  return normalizeLayout(raw, flags);
}
export const saveLayout = (db: Db, key: string, layout: BookLayout) =>
  db.execute(`INSERT INTO app_setting (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = ${NOW}`, [keyName(key), JSON.stringify(layout)]);
/** Back to the layout the Book Log started with. */
export const resetLayout = (db: Db, key: string) => db.execute('DELETE FROM app_setting WHERE key = ?', [keyName(key)]);
export { defaultLayout };

/** Makes this layout the one a reset goes back to (and what a book without its own layout starts from). */
export const saveDefaultLayout = (db: Db, layout: BookLayout) =>
  db.execute(`INSERT INTO app_setting (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = ${NOW}`, [DEFAULT_KEY, JSON.stringify(layout)]);
/** Forgets your default, so the built-in one is used again. */
export const clearDefaultLayout = (db: Db) => db.execute('DELETE FROM app_setting WHERE key = ?', [DEFAULT_KEY]);
export async function hasDefaultLayout(db: Db): Promise<boolean> {
  const [r] = await db.select<{ n: number }>('SELECT count(*) AS n FROM app_setting WHERE key = ?', [DEFAULT_KEY]);
  return Number(r.n) > 0;
}

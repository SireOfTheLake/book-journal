import type { Db } from '../db/adapter';
import { defaultLayout, normalizeLayout, type BookLayout, type Flags } from '../domain/bookLayout';

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const keyName = (key: string) => `book_layout:${key}`;

/** The saved layout (or the default one), cleaned up for the features that are on. */
export async function getLayout(db: Db, key: string, flags: Flags): Promise<BookLayout> {
  const [row] = await db.select<{ value: string }>('SELECT value FROM app_setting WHERE key = ?', [keyName(key)]);
  let raw: unknown = null;
  try { raw = row ? JSON.parse(row.value) : null; } catch { raw = null; }
  return normalizeLayout(raw, flags);
}
export const saveLayout = (db: Db, key: string, layout: BookLayout) =>
  db.execute(`INSERT INTO app_setting (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = ${NOW}`, [keyName(key), JSON.stringify(layout)]);
/** Back to the layout the Book Log started with. */
export const resetLayout = (db: Db, key: string) => db.execute('DELETE FROM app_setting WHERE key = ?', [keyName(key)]);
export { defaultLayout };

import type { Db } from '../db/adapter';
import { newId } from '../domain/ids';

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

export type ListKind = 'genre' | 'theme' | 'trope' | 'source' | 'time_period' | 'accent' | 'name_type' | 'occupation' | 'sexuality' | 'character_tag' | 'mood' | 'pace' | 'content_warning';

// Every pick-list you choose from in the journal, what it is for, and where its entries are in use.
// "tables" are linking tables (their rows are removed when an entry goes); "columns" are single-choice fields (cleared when an entry goes).
export interface ListInfo { kind: ListKind; label: string; singular: string; hint: string; tables: { table: string; col: string }[]; columns: { table: string; col: string }[] }
export const LISTS: ListInfo[] = [
  { kind: 'genre', label: 'Genres', singular: 'genre', hint: 'On books and whole series.', tables: [{ table: 'book_genre', col: 'genre_id' }, { table: 'series_genre', col: 'genre_id' }], columns: [] },
  { kind: 'theme', label: 'Themes', singular: 'theme', hint: 'On books.', tables: [{ table: 'book_theme', col: 'theme_id' }], columns: [] },
  { kind: 'trope', label: 'Tropes', singular: 'trope', hint: 'On books.', tables: [{ table: 'book_trope', col: 'trope_id' }], columns: [] },
  { kind: 'mood', label: 'Moods', singular: 'mood', hint: 'On books (needs the Mood and pace feature).', tables: [{ table: 'book_mood', col: 'mood_id' }], columns: [] },
  { kind: 'pace', label: 'Pace', singular: 'pace', hint: 'On books (needs the Mood and pace feature).', tables: [{ table: 'book_pace', col: 'pace_id' }], columns: [] },
  { kind: 'content_warning', label: 'Content warnings', singular: 'content warning', hint: 'On books (needs the Content warnings feature).', tables: [{ table: 'book_content_warning', col: 'content_warning_id' }], columns: [] },
  { kind: 'source', label: 'Sources', singular: 'source', hint: 'Where a read came from (Kindle Unlimited, Audible, Library...).', tables: [], columns: [{ table: 'read', col: 'source_id' }] },
  { kind: 'time_period', label: 'Time periods', singular: 'time period', hint: 'When a book is set. Recent History keeps its decade choices.', tables: [], columns: [{ table: 'book', col: 'time_period_id' }] },
  { kind: 'accent', label: 'Narrator accents', singular: 'accent', hint: 'On narrators and on each listen.', tables: [{ table: 'narrator_accent', col: 'accent_id' }, { table: 'read_narrator_accent', col: 'accent_id' }], columns: [] },
  { kind: 'occupation', label: 'Occupations', singular: 'occupation', hint: 'On characters.', tables: [{ table: 'character_occupation', col: 'occupation_id' }], columns: [] },
  { kind: 'sexuality', label: 'Sexualities', singular: 'sexuality', hint: 'On characters.', tables: [], columns: [{ table: 'character', col: 'sexuality_id' }] },
  { kind: 'character_tag', label: 'Character tags', singular: 'character tag', hint: 'Free tags on characters.', tables: [{ table: 'character_tag_link', col: 'character_tag_id' }], columns: [] },
  { kind: 'name_type', label: 'Name types', singular: 'name type', hint: 'Kinds of other names a character has (nickname, previous name...).', tables: [], columns: [{ table: 'character_alt_name', col: 'name_type_id' }] },
];

export interface ListRow { id: string; name: string; uses: number }
const info = (kind: ListKind): ListInfo => { const i = LISTS.find((l) => l.kind === kind); if (!i) throw new Error(`Unknown list ${kind}`); return i; };

export async function listEntries(db: Db, kind: ListKind): Promise<ListRow[]> {
  const i = info(kind);
  const parts = [...i.tables, ...i.columns].map((u) => `(SELECT count(*) FROM ${u.table} WHERE ${u.col} = x.id AND deleted_at IS NULL)`);
  return db.select<ListRow>(`SELECT x.id AS id, x.name AS name, ${parts.length ? parts.join(' + ') : '0'} AS uses FROM ${kind} x WHERE x.deleted_at IS NULL ORDER BY CASE WHEN lower(x.name) LIKE \'the %\' THEN lower(substr(x.name, 5)) ELSE lower(x.name) END`);
}

export async function addEntry(db: Db, kind: ListKind, name: string): Promise<string> {
  const n = name.trim();
  if (!n) throw new Error('Type a name first.');
  info(kind);
  const [clash] = await db.select<{ id: string }>(`SELECT id FROM ${kind} WHERE lower(name) = lower(?) AND deleted_at IS NULL`, [n]);
  if (clash) throw new Error(`There is already one called "${n}".`);
  const [{ next }] = await db.select<{ next: number }>(`SELECT COALESCE(max(sort_order), 0) + 1 AS next FROM ${kind}`);
  const id = newId();
  await db.execute(`INSERT INTO ${kind} (id, name, sort_order) VALUES (?, ?, ?)`, [id, n, next]);
  return id;
}

export async function renameEntry(db: Db, kind: ListKind, id: string, name: string): Promise<void> {
  const n = name.trim();
  if (!n) throw new Error('A name cannot be empty.');
  info(kind);
  const [clash] = await db.select<{ id: string }>(`SELECT id FROM ${kind} WHERE lower(name) = lower(?) AND id <> ? AND deleted_at IS NULL`, [n, id]);
  if (clash) throw new Error(`There is already one called "${n}".`);
  await db.execute(`UPDATE ${kind} SET name = ? WHERE id = ?`, [n, id]);
}

// Takes an entry off the list. Wherever it was chosen it is simply cleared; nothing else is touched.
export async function deleteEntry(db: Db, kind: ListKind, id: string): Promise<void> {
  const i = info(kind);
  for (const u of i.tables) await db.execute(`UPDATE ${u.table} SET deleted_at = ${NOW} WHERE ${u.col} = ? AND deleted_at IS NULL`, [id]);
  for (const u of i.columns) {
    await db.execute(`UPDATE ${u.table} SET ${u.col} = NULL WHERE ${u.col} = ?`, [id]);
    if (kind === 'time_period' && u.table === 'book') await db.execute('UPDATE book SET time_period_detail = NULL WHERE time_period_id IS NULL AND time_period_detail IS NOT NULL');
  }
  await db.execute(`UPDATE ${kind} SET deleted_at = ${NOW} WHERE id = ? AND deleted_at IS NULL`, [id]);
}

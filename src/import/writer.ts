import type { Db, SqlValue } from '../db/adapter';
import { newId } from '../domain/ids';

export const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

// Tables an import may write to. Undo only ever touches these.
const TABLES = new Set([
  'book', 'read', 'author', 'narrator', 'series', 'universe', 'character', 'genre', 'theme', 'trope',
  'book_author', 'book_narrator', 'book_genre', 'book_theme', 'book_trope', 'book_character', 'read_narrator', 'read_narrator_accent',
  'place', 'book_place', 'source', 'time_period', 'accent', 'occupation', 'sexuality', 'name_type', 'character_tag', 'character_alt_name', 'character_occupation',
  'character_previous_place', 'character_relationship', 'character_tag_link', 'related_person',
]);
// Columns of an existing character an import may fill in (and that undo puts back).
const UPDATABLE = new Set(['organization', 'current_place_id', 'sexuality_id', 'external_ids', 'is_featured']);

export const first = async (db: Db, sql: string, params: SqlValue[] = []) => (await db.select<{ id: string }>(sql, params))[0]?.id ?? null;

// Columns an import may fill in on an existing book or read (and that undo puts back).
const ROW_UPDATABLE: Record<string, Set<string>> = {
  book: new Set(['page_count', 'pov', 'perspective', 'time_period_id', 'series_id', 'series_position']),
  read: new Set(['start_date', 'finish_date', 'format', 'source_id', 'audio_length_seconds', 'narration_style', 'rating', 'category_id', 'prompt', 'notes',
    'legacy_category', 'legacy_challenge', 'legacy_prompt', 'legacy_slot']),
  series: new Set(['total_books', 'interconnected_standalones']),
};

export class Writer {
  created: Record<string, number> = {};
  constructor(readonly db: Db, readonly batchId: string) {}

  // Inserts a row and remembers it against this import so the import can be undone.
  async insert(table: string, row: Record<string, SqlValue>): Promise<string> {
    if (!TABLES.has(table)) throw new Error(`Unexpected table ${table}`);
    const id = newId();
    const cols = ['id', ...Object.keys(row)];
    await this.db.execute(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, [id, ...Object.values(row)]);
    await this.track(table, id, '{}');
    this.created[table] = (this.created[table] ?? 0) + 1;
    return id;
  }

  // Fills in columns on a character that already existed, remembering the old values for undo.
  async updateCharacter(id: string, changes: Record<string, SqlValue>): Promise<void> {
    const cols = Object.keys(changes).filter((c) => UPDATABLE.has(c));
    if (!cols.length) return;
    const [before] = await this.db.select<Record<string, SqlValue>>(`SELECT ${cols.join(', ')} FROM character WHERE id = ?`, [id]);
    await this.track('character_update', id, JSON.stringify({ before }));
    await this.db.execute(`UPDATE character SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [...cols.map((c) => changes[c]), id]);
  }

  // Fills in columns on a book, read or series that already existed, remembering the old values for undo.
  async updateRow(table: 'book' | 'read' | 'series', id: string, changes: Record<string, SqlValue>): Promise<void> {
    const cols = Object.keys(changes).filter((c) => ROW_UPDATABLE[table].has(c));
    if (!cols.length) return;
    const [before] = await this.db.select<Record<string, SqlValue>>(`SELECT ${cols.join(', ')} FROM ${table} WHERE id = ?`, [id]);
    await this.track('row_update', id, JSON.stringify({ table, before }));
    await this.db.execute(`UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [...cols.map((c) => changes[c]), id]);
  }

  private track(entity: string, id: string, payload: string) {
    return this.db.execute(
      "INSERT INTO import_staging (id, batch_id, entity_type, payload, review_status, target_id) VALUES (?, ?, ?, ?, 'accepted', ?)",
      [newId(), this.batchId, entity, payload, id],
    );
  }
}

export async function startBatch(db: Db, source: 'notion_books' | 'notion_characters' | 'pdf_journal' | 'other', note: string): Promise<Writer> {
  const id = newId();
  await db.execute('INSERT INTO import_batch (id, source, note) VALUES (?, ?, ?)', [id, source, note]);
  return new Writer(db, id);
}

export const finishBatch = (db: Db, batchId: string) => db.execute(`UPDATE import_batch SET finished_at = ${NOW} WHERE id = ?`, [batchId]);

// Undo: soft-deletes everything the import created and puts back anything it filled in.
export async function undoImport(db: Db, batchId: string): Promise<number> {
  const rows = await db.select<{ entity_type: string; target_id: string; payload: string }>(
    'SELECT entity_type, target_id, payload FROM import_staging WHERE batch_id = ? ORDER BY rowid DESC', [batchId]);
  for (const r of rows) {
    if (r.entity_type === 'character_update') {
      const before = (JSON.parse(r.payload) as { before: Record<string, SqlValue> }).before;
      const cols = Object.keys(before).filter((c) => UPDATABLE.has(c));
      if (cols.length) await db.execute(`UPDATE character SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [...cols.map((c) => before[c]), r.target_id]);
    } else if (r.entity_type === 'row_update') {
      const { table, before } = JSON.parse(r.payload) as { table: 'book' | 'read' | 'series'; before: Record<string, SqlValue> };
      const cols = Object.keys(before).filter((c) => ROW_UPDATABLE[table]?.has(c));
      if (cols.length) await db.execute(`UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [...cols.map((c) => before[c]), r.target_id]);
    } else if (TABLES.has(r.entity_type)) {
      await db.execute(`UPDATE ${r.entity_type} SET deleted_at = ${NOW} WHERE id = ? AND deleted_at IS NULL`, [r.target_id]);
    }
  }
  await db.execute("UPDATE import_staging SET review_status = 'rejected' WHERE batch_id = ?", [batchId]);
  return rows.length;
}

// A note in parentheses after a character's name, such as "(TAME)", is kept as a tag so you can see
// which book the character still needs to be assigned to.
export async function ensureOriginTag(w: Writer, characterId: string, note: string | null): Promise<void> {
  const n = note?.trim();
  if (!n) return;
  let tagId = await first(w.db, 'SELECT id FROM character_tag WHERE lower(name) = lower(?) AND deleted_at IS NULL LIMIT 1', [n]);
  if (!tagId) {
    const { randomTagColor } = await import('../domain/colors');
    tagId = await w.insert('character_tag', { name: n, color: randomTagColor() });
  }
  if (!(await first(w.db, 'SELECT id FROM character_tag_link WHERE character_id = ? AND character_tag_id = ? AND deleted_at IS NULL', [characterId, tagId]))) {
    await w.insert('character_tag_link', { character_id: characterId, character_tag_id: tagId });
  }
}

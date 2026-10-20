import type { Db, SqlValue } from '../db/adapter';

// Groundwork for syncing between devices. Nothing here talks to a server yet.

/** Tables that are never copied between devices, and why. */
export const NOT_SYNCED: Record<string, string> = {
  schema_migration: 'tracks which database version this device is on',
  search_fts: 'the search index is rebuilt on each device',
  import_staging: 'a scratch area for imports on one device',
  import_batch: 'a scratch area for imports on one device',
};
/** Tables that sync, but by their own rules rather than as ordinary records. */
export const SPECIAL: Record<string, string> = {
  app_setting: 'keyed by name, and only the shared settings travel (see settings.ts)',
};

export interface TableInfo { name: string; columns: string[]; parents: string[] }

const isShadow = (name: string) => name.startsWith('sqlite_') || name.startsWith('_sqlx') || /^search_fts_/.test(name);

export async function readSchema(db: Db): Promise<TableInfo[]> {
  const tables = await db.select<{ name: string; sql: string | null }>("SELECT name, sql FROM sqlite_master WHERE type = 'table' ORDER BY name");
  const out: TableInfo[] = [];
  for (const t of tables) {
    if (isShadow(t.name) || /VIRTUAL TABLE/i.test(t.sql ?? '')) continue;
    const cols = await db.select<{ name: string }>(`PRAGMA table_info("${t.name}")`);
    const fks = await db.select<{ table: string }>(`PRAGMA foreign_key_list("${t.name}")`);
    out.push({ name: t.name, columns: cols.map((c) => c.name), parents: [...new Set(fks.map((f) => f.table).filter((p) => p !== t.name))] });
  }
  return out;
}

/** The tables that sync as ordinary records: each needs a text id and created/updated/deleted times. */
export async function syncedTables(db: Db): Promise<TableInfo[]> {
  return (await readSchema(db)).filter((t) => !(t.name in NOT_SYNCED) && !(t.name in SPECIAL));
}

/** Tables that cannot sync as ordinary records, with what they are missing. Empty when the schema is ready. */
export function schemaProblems(tables: TableInfo[]): string[] {
  const problems: string[] = [];
  for (const t of tables) {
    const missing = ['id', 'created_at', 'updated_at', 'deleted_at'].filter((c) => !t.columns.includes(c));
    if (missing.length) problems.push(`${t.name} is missing ${missing.join(', ')}`);
  }
  return problems;
}

/** Parents before children, so incoming rows never point at a row that has not arrived yet. */
export function applyOrder(tables: TableInfo[]): string[] {
  const names = new Set(tables.map((t) => t.name));
  const done = new Set<string>();
  const order: string[] = [];
  const visit = (t: TableInfo, stack: string[]) => {
    if (done.has(t.name) || stack.includes(t.name)) return;
    for (const p of t.parents) { const pt = tables.find((x) => x.name === p); if (pt && names.has(p)) visit(pt, [...stack, t.name]); }
    done.add(t.name); order.push(t.name);
  };
  for (const t of [...tables].sort((a, b) => a.name.localeCompare(b.name))) visit(t, []);
  return order;
}

export type RemoteRow = Record<string, SqlValue>;

/**
 * Brings one row from another device into this one. The newest edit wins; an equal or older one is ignored.
 * The row's own updated_at is always written, so the local "touch" rule never re-stamps it as new.
 * Returns true if the row was applied.
 */
export async function applyRemoteRow(db: Db, table: string, columns: string[], row: RemoteRow): Promise<boolean> {
  const id = row.id as string;
  const updated = row.updated_at as string;
  if (!id || !updated) throw new Error(`A row for ${table} is missing its id or update time.`);
  const [local] = await db.select<{ updated_at: string }>(`SELECT updated_at FROM "${table}" WHERE id = ?`, [id]);
  if (local && local.updated_at >= updated) return false;
  const cols = columns.filter((c) => c in row);
  const names = cols.map((c) => `"${c}"`).join(', ');
  const marks = cols.map(() => '?').join(', ');
  const set = cols.filter((c) => c !== 'id').map((c) => `"${c}" = excluded."${c}"`).join(', ');
  await db.execute(`INSERT INTO "${table}" (${names}) VALUES (${marks}) ON CONFLICT(id) DO UPDATE SET ${set}`, cols.map((c) => row[c]));
  return true;
}

/** Rows on this device changed after a point in time (the "since the last sync" question). */
export async function changedSince(db: Db, table: string, since: string | null): Promise<Record<string, SqlValue>[]> {
  return db.select(`SELECT * FROM "${table}" WHERE updated_at > ? ORDER BY updated_at, id`, [since ?? '']);
}

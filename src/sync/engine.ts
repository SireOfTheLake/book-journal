import type { Db, SqlValue } from '../db/adapter';
import { isSharedSetting } from '../repo/settings';
import { applyOrder, syncedTables, type RemoteRow, type TableInfo } from './schema';
import { databaseVersion, compareVersions } from './version';

// Keeps this device and the cloud copy in step. It asks the cloud for what is new, settles any clashes, then sends what changed here.

export interface Transport {
  schemaVersion(): Promise<number>;
  /** Rows of a table that arrived in the cloud after `after`, oldest first. `cursor` is the arrival mark of the last row. */
  pull(table: string, after: string | null, limit: number): Promise<{ rows: RemoteRow[]; cursor: string | null }>;
  push(table: string, rows: RemoteRow[]): Promise<void>;
}

export class SyncVersionError extends Error {
  constructor(public readonly which: 'this_is_older' | 'this_is_newer', message: string) { super(message); }
}

export interface SyncReport { pulled: number; pushed: number; merged: number }

const NOW = () => new Date().toISOString();
const keyOf = async (db: Db, k: string) => (await db.select<{ value: string }>('SELECT value FROM app_setting WHERE key = ?', [k]))[0]?.value ?? null;
const setKey = (db: Db, k: string, v: string) => db.execute(`INSERT INTO app_setting (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = ${"strftime('%Y-%m-%dT%H:%M:%fZ','now')"}`, [k, v]);

const pageSize = (table: string) => (table === 'image' ? 15 : 400);
const approxBytes = (r: RemoteRow) => Object.values(r).reduce<number>((n, v) => n + (typeof v === 'string' ? v.length : 8), 0);

// ---- unique-index knowledge, so a clash between two devices can be settled ----
interface UniqueIndex { name: string; table: string; exprs: string[]; where: string | null }
function splitTop(s: string): string[] {
  const out: string[] = []; let d = 0; let cur = '';
  for (const c of s) { if (c === '(') d++; if (c === ')') d--; if (c === ',' && d === 0) { out.push(cur.trim()); cur = ''; } else cur += c; }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
async function uniqueIndexes(db: Db): Promise<UniqueIndex[]> {
  const rows = await db.select<{ name: string; sql: string }>("SELECT name, sql FROM sqlite_master WHERE type = 'index' AND sql LIKE 'CREATE UNIQUE INDEX%'");
  const out: UniqueIndex[] = [];
  for (const r of rows) {
    const m = /^CREATE UNIQUE INDEX\s+\S+\s+ON\s+"?(\w+)"?\s*\((.*)\)(?:\s+WHERE\s+(.*))?\s*;?$/is.exec(r.sql.trim());
    if (m) out.push({ name: r.name, table: m[1], exprs: splitTop(m[2]), where: m[3]?.trim().replace(/;$/, '') ?? null });
  }
  return out;
}
interface ForeignKey { table: string; column: string; parent: string }
async function foreignKeys(db: Db, tables: TableInfo[]): Promise<ForeignKey[]> {
  const out: ForeignKey[] = [];
  for (const t of tables) for (const f of await db.select<{ table: string; from: string }>(`PRAGMA foreign_key_list("${t.name}")`)) out.push({ table: t.name, column: f.from, parent: f.table });
  return out;
}

interface Ctx { db: Db; tables: TableInfo[]; unique: UniqueIndex[]; fks: ForeignKey[]; merged: number; fromCloud: Set<string> }

const aliasKey = (table: string, id: string) => `sync_alias:${table}:${id}`;

/** If a row we are about to bring in points at something that was merged into another row, point it at the survivor. */
async function remap(ctx: Ctx, table: string, row: RemoteRow): Promise<RemoteRow> {
  const out = { ...row };
  for (const f of ctx.fks.filter((x) => x.table === table)) {
    const v = out[f.column];
    if (typeof v === 'string') { const to = await keyOf(ctx.db, aliasKey(f.parent, v)); if (to) out[f.column] = to; }
  }
  return out;
}

/** Finds an existing, different row that would clash with `row` on a unique rule. */
async function findClash(ctx: Ctx, t: TableInfo, row: RemoteRow): Promise<{ id: string; created_at: string } | null> {
  for (const u of ctx.unique.filter((x) => x.table === t.name)) {
    const cols = t.columns.filter((c) => c in row);
    const sub = `(SELECT ${cols.map((c) => `? AS "${c}"`).join(', ')})`;
    const params = cols.map((c) => row[c]);
    const [mine] = await ctx.db.select<Record<string, SqlValue>>(`SELECT ${u.exprs.map((e, i) => `${e} AS v${i}`).join(', ')}${u.where ? `, (${u.where}) AS ok` : ''} FROM ${sub}`, params);
    if (!mine || (u.where && !mine.ok)) continue;
    const conds = u.exprs.map((e) => `${e} IS ?`).join(' AND ');
    const [hit] = await ctx.db.select<{ id: string; created_at: string }>(
      `SELECT id, created_at FROM "${t.name}" WHERE id <> ? AND ${u.where ? `(${u.where}) AND ` : ''}${conds} LIMIT 1`, [row.id as SqlValue, ...u.exprs.map((_, i) => mine[`v${i}`])]);
    if (hit) return hit;
  }
  return null;
}

/** Frees the unique rule by marking the local row deleted, then (once the survivor exists) points everything that referred to it at the survivor. */
async function retire(ctx: Ctx, t: TableInfo, from: string) {
  await ctx.db.execute(`UPDATE "${t.name}" SET deleted_at = ?, updated_at = ? WHERE id = ?`, [NOW(), NOW(), from]);
}
async function repoint(ctx: Ctx, t: TableInfo, from: string, to: string) {
  for (const f of ctx.fks.filter((x) => x.parent === t.name)) {
    if (!ctx.tables.some((x) => x.name === f.table)) continue;
    const rows = await ctx.db.select<{ id: string }>(`SELECT id FROM "${f.table}" WHERE "${f.column}" = ?`, [from]);
    for (const r of rows) {
      try { await ctx.db.execute(`UPDATE "${f.table}" SET "${f.column}" = ?, updated_at = ? WHERE id = ?`, [to, NOW(), r.id]); }
      catch { await ctx.db.execute(`UPDATE "${f.table}" SET deleted_at = ?, updated_at = ? WHERE id = ?`, [NOW(), NOW(), r.id]); } // it would have duplicated a row that already exists
    }
  }
  await setKey(ctx.db, aliasKey(t.name, from), to);
  ctx.merged++;
}

const older = (a: { created_at: string; id: string }, b: { created_at: string; id: string }) => (a.created_at === b.created_at ? a.id < b.id : a.created_at < b.created_at);

async function writeRow(ctx: Ctx, t: TableInfo, row: RemoteRow, echo = true): Promise<boolean> {
  const db = ctx.db;
  const [local] = await db.select<{ updated_at: string }>(`SELECT updated_at FROM "${t.name}" WHERE id = ?`, [row.id as string]);
  if (local && local.updated_at >= (row.updated_at as string)) return false;
  const cols = t.columns.filter((c) => c in row);
  await db.execute(
    `INSERT INTO "${t.name}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${cols.map(() => '?').join(', ')}) ON CONFLICT(id) DO UPDATE SET ${cols.filter((c) => c !== 'id').map((c) => `"${c}" = excluded."${c}"`).join(', ')}`,
    cols.map((c) => row[c]));
  if (echo) ctx.fromCloud.add(`${t.name}:${row.id}:${row.updated_at}`); // no need to send back what the cloud just gave us
  return true;
}

async function applyIncoming(ctx: Ctx, t: TableInfo, incoming: RemoteRow): Promise<boolean> {
  const row = await remap(ctx, t.name, incoming);
  // A row we have already merged away stays deleted.
  const alias = await keyOf(ctx.db, aliasKey(t.name, row.id as string));
  if (alias) return false;
  const clash = row.deleted_at ? null : await findClash(ctx, t, row);
  if (!clash) return writeRow(ctx, t, row);
  const mine = { created_at: row.created_at as string, id: row.id as string };
  if (older(mine, clash)) {
    // The incoming row is the survivor: fold the local one into it, then bring it in.
    await retire(ctx, t, clash.id);
    const wrote = await writeRow(ctx, t, row);
    await repoint(ctx, t, clash.id, row.id as string);
    return wrote;
  }
  // The local row survives: keep the incoming row only as a deleted record so every device agrees.
  await writeRow(ctx, t, { ...row, deleted_at: NOW(), updated_at: NOW() }, false);
  await setKey(ctx.db, aliasKey(t.name, row.id as string), clash.id);
  ctx.merged++;
  return true;
}

async function pullTable(ctx: Ctx, t: TableInfo, transport: Transport): Promise<number> {
  const cursorKey = `sync_pull:${t.name}`;
  let cursor = await keyOf(ctx.db, cursorKey);
  let count = 0;
  for (;;) {
    const page = await transport.pull(t.name, cursor, pageSize(t.name));
    for (const row of page.rows) if (await applyIncoming(ctx, t, row)) count++;
    if (!page.rows.length || !page.cursor) break;
    cursor = page.cursor;
    await setKey(ctx.db, cursorKey, cursor);
    if (page.rows.length < pageSize(t.name)) break;
  }
  return count;
}

async function pushTable(ctx: Ctx, t: TableInfo, transport: Transport): Promise<number> {
  const markKey = `sync_push:${t.name}`;
  const mark = (await keyOf(ctx.db, markKey)) ?? '';
  const rows = await ctx.db.select<RemoteRow>(`SELECT * FROM "${t.name}" WHERE updated_at > ? ORDER BY updated_at, id`, [mark]);
  const send = rows.filter((r) => !ctx.fromCloud.has(`${t.name}:${r.id}:${r.updated_at}`));
  let batch: RemoteRow[] = []; let bytes = 0;
  const flush = async () => { if (batch.length) { await transport.push(t.name, batch); batch = []; bytes = 0; } };
  for (const r of send) {
    if (bytes > 1_500_000 || batch.length >= 400) await flush();
    batch.push(r); bytes += approxBytes(r);
  }
  await flush();
  if (rows.length) await setKey(ctx.db, markKey, rows[rows.length - 1].updated_at as string);
  return send.length;
}

// Shared settings (the feature switches) sync by name; everything else stays on the device.
async function syncSettings(ctx: Ctx, transport: Transport): Promise<{ pulled: number; pushed: number }> {
  const cursorKey = 'sync_pull:app_setting';
  let pulled = 0;
  const page = await transport.pull('app_setting', await keyOf(ctx.db, cursorKey), 1000);
  for (const r of page.rows) {
    const key = r.key as string;
    if (!isSharedSetting(key)) continue;
    const [local] = await ctx.db.select<{ updated_at: string }>('SELECT updated_at FROM app_setting WHERE key = ?', [key]);
    if (local && local.updated_at >= (r.updated_at as string)) continue;
    await ctx.db.execute('INSERT INTO app_setting (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at', [key, r.value as string, r.updated_at as string]);
    pulled++;
  }
  if (page.cursor) await setKey(ctx.db, cursorKey, page.cursor);
  const mark = (await keyOf(ctx.db, 'sync_push:app_setting')) ?? '';
  const rows = (await ctx.db.select<RemoteRow>('SELECT key, value, updated_at FROM app_setting WHERE updated_at > ? ORDER BY updated_at', [mark])).filter((r) => isSharedSetting(r.key as string));
  if (rows.length) { await transport.push('app_setting', rows); await setKey(ctx.db, 'sync_push:app_setting', rows[rows.length - 1].updated_at as string); }
  return { pulled, pushed: rows.length };
}

export interface SyncOptions {
  /** Tables this device does not bring in from the cloud (the phone leaves the pictures table to its own cover download). Anything made here is still sent. */
  skipPull?: string[];
}

export async function syncOnce(db: Db, transport: Transport, opts: SyncOptions = {}): Promise<SyncReport> {
  const mine = await databaseVersion(db);
  const theirs = await transport.schemaVersion();
  const cmp = compareVersions(mine, theirs);
  if (cmp === 'this_is_older') throw new SyncVersionError(cmp, 'This copy of Book Journal is older than your cloud copy. Update the app, then sync again.');
  if (cmp === 'this_is_newer') throw new SyncVersionError(cmp, 'Your cloud copy has not been updated for this version of the app yet. Run the new setup script in Supabase, then sync again.');
  const tables = await syncedTables(db);
  const byName = new Map(tables.map((t) => [t.name, t]));
  const ctx: Ctx = { db, tables, unique: await uniqueIndexes(db), fks: await foreignKeys(db, tables), merged: 0, fromCloud: new Set() };
  const skip = new Set(opts.skipPull ?? []);
  const order = applyOrder(tables).map((n) => byName.get(n)!);
  let pulled = 0; let pushed = 0;
  for (const t of order) if (!skip.has(t.name)) pulled += await pullTable(ctx, t, transport);
  const s = await syncSettings(ctx, transport);
  pulled += s.pulled;
  for (const t of order) pushed += await pushTable(ctx, t, transport);
  pushed += s.pushed;
  return { pulled, pushed, merged: ctx.merged };
}

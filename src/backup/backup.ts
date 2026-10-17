import type { Db } from '../db/adapter';

export type BackupKind = 'manual' | 'before-import' | 'before-upgrade';
export interface BackupFile { name: string; kind: BackupKind; at: Date }

// What backups need from the computer. The app supplies the real one (see tauriEnv.ts); tests supply a fake.
export interface BackupEnv {
  backupsDir(): Promise<string>; // the app's own backups folder, created if it is missing
  list(dir: string): Promise<string[]>; // file names in a folder
  remove(path: string): Promise<void>;
  copy(from: string, to: string): Promise<void>;
  pickSavePath(defaultName: string, kindName: string, extension: string): Promise<string | null>; // null if cancelled
  writeText(path: string, text: string): Promise<void>;
  join(dir: string, name: string): string;
  now(): Date;
}

// Automatic backups (made before an import or an upgrade) are trimmed to the newest few. Manual ones are never removed.
export const KEEP_AUTOMATIC = 20;
const AUTOMATIC: BackupKind[] = ['before-import', 'before-upgrade'];

const pad = (n: number, w = 2) => String(n).padStart(w, '0');
// 20251014-153000 in UTC, the same form the app's Rust side uses.
export const stampOf = (d: Date) => `${pad(d.getUTCFullYear(), 4)}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;

export function parseBackupName(name: string): BackupFile | null {
  const m = /^(manual|before-import|before-upgrade)-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})(?:-\d+)?\.db$/.exec(name);
  if (!m) return null;
  return { name, kind: m[1] as BackupKind, at: new Date(Date.UTC(+m[2], +m[3] - 1, +m[4], +m[5], +m[6], +m[7])) };
}

export async function listBackups(env: BackupEnv): Promise<BackupFile[]> {
  const files = (await env.list(await env.backupsDir())).map(parseBackupName).filter((f): f is BackupFile => f !== null);
  return files.sort((a, b) => b.at.getTime() - a.at.getTime() || (a.name < b.name ? 1 : -1));
}

export async function lastBackupAt(db: Db): Promise<Date | null> {
  const [row] = await db.select<{ value: string }>("SELECT value FROM app_setting WHERE key = 'last_backup_at'");
  return row ? new Date(row.value) : null;
}

async function remember(db: Db, when: Date) {
  await db.execute("INSERT INTO app_setting (key, value) VALUES ('last_backup_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')", [when.toISOString()]);
}

// Makes a complete copy of the database (including every picture, which lives inside it) in the backups folder.
export async function makeBackup(db: Db, env: BackupEnv, kind: BackupKind): Promise<{ path: string; name: string }> {
  const dir = await env.backupsDir();
  const taken = new Set(await env.list(dir));
  const now = env.now();
  const base = `${kind}-${stampOf(now)}`;
  let name = `${base}.db`;
  for (let n = 2; taken.has(name); n++) name = `${base}-${n}.db`; // two backups in the same second
  const path = env.join(dir, name);
  await db.execute('VACUUM INTO ?', [path]);
  await remember(db, now);
  if (AUTOMATIC.includes(kind)) await pruneAutomatic(env);
  return { path, name };
}

async function pruneAutomatic(env: BackupEnv) {
  const dir = await env.backupsDir();
  const old = (await listBackups(env)).filter((f) => AUTOMATIC.includes(f.kind)).slice(KEEP_AUTOMATIC);
  for (const f of old) await env.remove(env.join(dir, f.name));
}

// A fresh backup, then a copy of it wherever you choose (a USB drive, a cloud folder...). Null if you cancel.
export async function saveCopy(db: Db, env: BackupEnv): Promise<{ path: string } | null> {
  const stamp = stampOf(env.now());
  const target = await env.pickSavePath(`book-journal-backup-${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}.db`, 'Book Journal backup', 'db');
  if (!target) return null;
  const made = await makeBackup(db, env, 'manual');
  await env.copy(made.path, target);
  return { path: target };
}

export interface ExportSummary { path: string; tables: number; rows: number; includesPictures: boolean }

// All of your data as a readable JSON file. Pictures are left out unless you ask for them (they make the file large).
export async function buildExport(db: Db, opts: { includePictures: boolean; now: Date }): Promise<{ data: Record<string, unknown>; tables: number; rows: number }> {
  const tables = (await db.select<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'search_fts%' AND name NOT LIKE '\\_sqlx%' ESCAPE '\\' ORDER BY name")).map((t) => t.name);
  const out: Record<string, unknown[]> = {};
  let rows = 0;
  for (const t of tables) {
    const cols = (await db.select<{ name: string }>(`PRAGMA table_info("${t}")`)).map((c) => c.name);
    let data = await db.select<Record<string, unknown>>(`SELECT * FROM "${t}"${cols.includes('deleted_at') ? ' WHERE deleted_at IS NULL' : ''} ORDER BY rowid`);
    if (t === 'image' && !opts.includePictures) data = data.map((r) => ({ ...r, file_path: null }));
    out[t] = data; rows += data.length;
  }
  let version: number | null = null;
  try { version = ((await db.select<{ v: number | null }>('SELECT max(version) AS v FROM _sqlx_migrations'))[0]?.v) ?? null; } catch { /* a database with no upgrade record */ }
  return { data: { app: 'Book Journal', exportedAt: opts.now.toISOString(), schemaVersion: version, includesPictures: opts.includePictures, tables: out }, tables: tables.length, rows };
}

export async function exportJson(db: Db, env: BackupEnv, opts: { includePictures: boolean }): Promise<ExportSummary | null> {
  const now = env.now();
  const stamp = stampOf(now);
  const target = await env.pickSavePath(`book-journal-export-${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}.json`, 'JSON', 'json');
  if (!target) return null;
  const built = await buildExport(db, { includePictures: opts.includePictures, now });
  await env.writeText(target, JSON.stringify(built.data, null, opts.includePictures ? undefined : 2));
  return { path: target, tables: built.tables, rows: built.rows, includesPictures: opts.includePictures };
}

import type { Database, SqlJsStatic } from 'sql.js';
import type { Db, SqlValue } from '../db/adapter';
import { withWriteNotifier } from '../db/notify';

// The phone keeps the whole journal in a SQLite database that runs in the browser (sql.js).
// After changes the file is saved to the phone's storage, so the journal opens instantly and works offline.

/** SQLite statements the browser build cannot run. The full-text index table is never used by the app, and the browser build has no module for it. */
export function usableMigration(sql: string): string {
  return sql.replace(/CREATE VIRTUAL TABLE search_fts[^;]*;/gi, '');
}

export function adaptSqlJs(database: Database, onChange: () => void): Db {
  return {
    async execute(sql: string, params: SqlValue[] = []) {
      database.run(sql, params);
      onChange();
    },
    async select<T>(sql: string, params: SqlValue[] = []) {
      const stmt = database.prepare(sql);
      try {
        stmt.bind(params);
        const rows: T[] = [];
        while (stmt.step()) rows.push(stmt.getAsObject() as T);
        return rows;
      } finally { stmt.free(); }
    },
  };
}

/** Applies migration files that are not applied yet (`applied` is how many have been). Returns the new count. */
export function migrateDatabase(database: Database, files: string[], applied: number): number {
  for (let i = applied; i < files.length; i++) database.exec(usableMigration(files[i]));
  return files.length;
}

export interface PhoneStorage {
  load(): Promise<{ bytes: Uint8Array | null; applied: number }>;
  save(bytes: Uint8Array, applied: number): Promise<void>;
}

export interface OpenedDb { db: Db; flush(): Promise<void>; raw: Database }

export async function openPhoneDatabase(SQL: SqlJsStatic, files: string[], storage: PhoneStorage, saveDelayMs = 3000): Promise<OpenedDb> {
  const saved = await storage.load();
  const database = saved.bytes ? new SQL.Database(saved.bytes) : new SQL.Database();
  let applied = saved.applied;
  if (applied < files.length) {
    database.exec('PRAGMA foreign_keys = OFF;');
    applied = migrateDatabase(database, files, applied);
    await storage.save(database.export(), applied);
  }
  // Pictures are not kept in this database on the phone, so rows that point at them must be allowed.
  database.exec('PRAGMA foreign_keys = OFF;');

  let timer: ReturnType<typeof setTimeout> | null = null;
  let dirty = false;
  let chain: Promise<void> = Promise.resolve();
  const flush = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!dirty) return chain;
    dirty = false;
    chain = chain.then(() => storage.save(database.export(), applied)).catch(() => { dirty = true; });
    return chain;
  };
  const changed = () => { dirty = true; if (!timer) timer = setTimeout(() => { timer = null; void flush(); }, saveDelayMs); };
  return { db: withWriteNotifier(adaptSqlJs(database, changed)), flush, raw: database };
}

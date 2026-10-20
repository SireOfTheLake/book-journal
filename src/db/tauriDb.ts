import Database from '@tauri-apps/plugin-sql';
import type { Db } from './adapter';
import { withWriteNotifier } from './notify';

// Opens (and migrates, via the Rust side) the app database in the user's app data folder.
// Note: the plugin uses a connection pool, so there are no multi-statement transactions from
// JavaScript. Keep writes serial, and make bulk operations restartable (imports use staging).
export async function openTauriDb(): Promise<Db> {
  const db = await Database.load('sqlite:book-journal.db');
  return withWriteNotifier({
    async execute(sql, params = []) {
      await db.execute(sql, params);
    },
    select<T>(sql: string, params: (string | number | null)[] = []) {
      return db.select<T[]>(sql, params);
    },
  });
}

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

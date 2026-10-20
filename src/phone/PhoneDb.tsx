import { useEffect, useState, type ReactNode } from 'react';
import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { DbContext } from '../db/DbContext';
import { idbGet, idbSet } from './idb';
import { openPhoneDatabase, type PhoneStorage } from './sqljsDb';

const migrationFiles = import.meta.glob('../../src-tauri/migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const MIGRATIONS = Object.keys(migrationFiles).sort().map((k) => migrationFiles[k]);

const storage: PhoneStorage = {
  async load() {
    const bytes = await idbGet<Uint8Array>('kv', 'database');
    const applied = (await idbGet<number>('kv', 'applied')) ?? 0;
    return { bytes: bytes ?? null, applied };
  },
  async save(bytes, applied) {
    await idbSet('kv', 'database', bytes);
    await idbSet('kv', 'applied', applied);
  },
};

export function PhoneDbProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<import('../db/adapter').Db | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    let flush: (() => Promise<void>) | null = null;
    (async () => {
      const SQL = await initSqlJs({ locateFile: () => wasmUrl });
      const opened = await openPhoneDatabase(SQL, MIGRATIONS, storage);
      flush = opened.flush;
      // Ask the phone not to throw the saved journal away when it is short of space.
      try { await navigator.storage?.persist?.(); } catch { /* not available */ }
      if (live) setDb(opened.db);
    })().catch((e) => { if (live) setError(String(e)); });
    const save = () => { void flush?.(); };
    const vis = () => { if (document.visibilityState === 'hidden') save(); };
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('pagehide', save);
    return () => { live = false; document.removeEventListener('visibilitychange', vis); window.removeEventListener('pagehide', save); };
  }, []);

  if (error) return <div className="ph-boot"><h1>Book Journal</h1><p>The journal did not open.</p><code>{error}</code></div>;
  if (!db) return <div className="ph-boot"><h1>Book Journal</h1><p>Opening your journal...</p></div>;
  return <DbContext.Provider value={db}>{children}</DbContext.Provider>;
}

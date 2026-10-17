import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Db } from './adapter';
import { normalizePlaces } from '../repo/places';
import { isTauri, openTauriDb } from './tauriDb';

export const DbContext = createContext<Db | null>(null);

export function useDb(): Db {
  const db = useContext(DbContext);
  if (!db) throw new Error('Database not ready');
  return db;
}

export function DbProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Db | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauri()) {
      setError('The database only runs inside the desktop app. Start it with "npm run tauri dev".');
      return;
    }
    openTauriDb().then(async (d) => { try { await normalizePlaces(d); } catch { /* a location that cannot be sorted stays as it is */ } setDb(d); }, (e) => setError(String(e)));
  }, []);

  if (error) return <div className="boot"><h1>Book Journal</h1><p>{error}</p></div>;
  if (!db) return <div className="boot"><h1>Book Journal</h1><p>Opening your journal...</p></div>;
  return <DbContext.Provider value={db}>{children}</DbContext.Provider>;
}

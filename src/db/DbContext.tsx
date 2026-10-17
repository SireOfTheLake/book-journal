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

// Opening can fail for a moment on a first launch (the migrations and the first load race each other), and a
// second try then works. So the app quietly retries a few times before it shows anything alarming.
const AUTO_TRIES = 3;

export function BootScreen({ error, onRetry }: { error?: string | null; onRetry?: () => void }) {
  return (
    <div className="boot">
      <div className="bootcard">
        <div className="bootmark" aria-hidden="true">📖</div>
        <h1>Book Journal</h1>
        {error ? (
          <>
            <p className="bootmsg">Your journal didn't open this time. Your books and notes are safe; nothing has been changed.</p>
            {onRetry && <button className="btn bootbtn" onClick={onRetry}>Try again</button>}
            <p className="bootfix muted small">If it keeps happening, close Book Journal completely and open it again.</p>
            <details className="bootdetails"><summary className="muted small">Technical details</summary><code>{error}</code></details>
          </>
        ) : (
          <>
            <p className="bootmsg muted">Opening your journal...</p>
            <div className="bootbar" aria-hidden="true"><span /></div>
          </>
        )}
      </div>
    </div>
  );
}

export function DbProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Db | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!isTauri()) {
      setError('The database only runs inside the desktop app. Start it with "npm run tauri dev".');
      return;
    }
    let live = true;
    setError(null);
    openTauriDb().then(async (d) => {
      try { await normalizePlaces(d); } catch { /* a location that cannot be sorted stays as it is */ }
      if (live) setDb(d);
    }, (e) => {
      if (!live) return;
      if (attempt < AUTO_TRIES) setTimeout(() => { if (live) setAttempt((n) => n + 1); }, 800);
      else setError(String(e));
    });
    return () => { live = false; };
  }, [attempt]);

  if (error) return <BootScreen error={error} onRetry={isTauri() ? () => setAttempt(0) : undefined} />;
  if (!db) return <BootScreen />;
  return <DbContext.Provider value={db}>{children}</DbContext.Provider>;
}

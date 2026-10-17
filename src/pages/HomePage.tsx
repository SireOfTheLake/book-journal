import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDb } from '../db/DbContext';
import { setStatus } from '../repo/bookLog';
import { getHome, type HomeData } from '../repo/home';
import QuickLog from '../ui/QuickLog';
import HomeView, { type HomeActions } from './HomeView';

const isoToday = () => new Date().toLocaleDateString('en-CA');

export default function HomePage() {
  const db = useDb();
  const [data, setData] = useState<HomeData | null>(null);
  const [logging, setLogging] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => setData(await getHome(db, isoToday())), [db]);
  useEffect(() => { reload().catch((e) => setError(String(e))); }, [reload]);

  const act = useMemo<HomeActions>(() => {
    const run = async (fn: () => Promise<unknown>) => { try { await fn(); await reload(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } };
    return {
      start: (bookId) => run(() => setStatus(db, bookId, null, 'reading')),
      resume: (bookId, readId) => run(() => setStatus(db, bookId, readId, 'reading')),
      finish: (bookId, readId) => run(() => setStatus(db, bookId, readId, 'finished')),
      log: (readId) => setLogging(readId),
    };
  }, [db, reload]);

  return (
    <section>
      <h1 className="pagetitle">HOME <span className="muted small">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span></h1>
      {error && <div className="bcard warn" role="alert">{error} <button type="button" className="mini" onClick={() => setError(null)}>Dismiss</button></div>}
      {data ? <HomeView data={data} act={act} /> : <p className="muted">Loading...</p>}
      {logging && <QuickLog initialReadId={logging} onClose={() => setLogging(null)} onSaved={() => { void reload(); }} />}
    </section>
  );
}

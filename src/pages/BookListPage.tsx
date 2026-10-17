import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDb } from '../db/DbContext';
import { quickAdd, setStatus, updateRead } from '../repo/bookLog';
import { listJournalYear, type JournalYear } from '../repo/journal';
import { useJournalYear } from '../ui/Shell';
import BookListView, { type ListActions } from './BookListView';

export default function BookListPage() {
  const db = useDb();
  const nav = useNavigate();
  const year = useJournalYear();
  const [data, setData] = useState<JournalYear | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => setData(await listJournalYear(db, year)), [db, year]);
  useEffect(() => { reload().catch((e) => setError(String(e))); }, [reload]);

  const act = useMemo<ListActions>(() => {
    const run = async (fn: () => Promise<unknown>) => { try { await fn(); await reload(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } };
    return {
      addBook: (title, status) => run(() => quickAdd(db, { title, authors: [], status })),
      start: (bookId) => run(async () => { const readId = await setStatus(db, bookId, null, 'reading'); if (readId) nav(`/book/${bookId}/${readId}`); }),
      finish: (readId) => run(() => updateRead(db, readId, { status: 'finished' })),
    };
  }, [db, nav, reload]);

  return (
    <section>
      <h1 className="pagetitle">BOOK LIST <span className="muted small">Journal {year}, newest first</span></h1>
      {error && <div className="bcard warn" role="alert">{error} <button type="button" className="mini" onClick={() => setError(null)}>Dismiss</button></div>}
      {data ? <BookListView data={data} year={year} act={act} /> : <p className="muted">Loading...</p>}
    </section>
  );
}

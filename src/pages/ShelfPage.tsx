import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDb } from '../db/DbContext';
import { getCovers } from '../repo/library';
import { addToShelf, listShelf, moveOnShelf, moveToShelf, removeFromShelf, startFromShelf, type ShelfBook } from '../repo/shelf';
import ShelfView, { type ShelfActions } from './ShelfView';

export default function ShelfPage() {
  const db = useDb();
  const nav = useNavigate();
  const [books, setBooks] = useState<ShelfBook[] | null>(null);
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const asked = useRef(new Set<string>());

  const reload = useCallback(async () => setBooks(await listShelf(db)), [db]);
  useEffect(() => { reload().catch((e) => setError(String(e))); }, [reload]);

  const requestCovers = useCallback((ids: string[]) => {
    const fresh = ids.filter((id) => !asked.current.has(id));
    if (!fresh.length) return;
    fresh.forEach((id) => asked.current.add(id));
    getCovers(db, fresh).then((got) => setCovers((c) => ({ ...c, ...got })), (e) => setError(String(e)));
  }, [db]);

  const act = useMemo<ShelfActions>(() => {
    const run = async (fn: () => Promise<unknown>) => { try { await fn(); await reload(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } };
    return {
      start: (id) => { startFromShelf(db, id).then((readId) => nav(`/book/${id}${readId ? `/${readId}` : ''}`), (e) => setError(e instanceof Error ? e.message : String(e))); },
      move: (id, m) => run(() => moveOnShelf(db, id, m)),
      toShelf: (id, s) => run(() => moveToShelf(db, id, s)),
      remove: (id) => run(() => removeFromShelf(db, id)),
      add: (title, authors, shelf) => run(() => addToShelf(db, { title, authors, shelf })),
    };
  }, [db, nav, reload]);

  return (
    <section>
      <h1 className="pagetitle">TBR &amp; UP NEXT <span className="muted small">What you plan to read</span></h1>
      {error && <div className="bcard warn" role="alert">{error} <button type="button" className="mini" onClick={() => setError(null)}>Dismiss</button></div>}
      {books ? <ShelfView books={books} covers={covers} requestCovers={requestCovers} act={act} /> : <p className="muted">Loading...</p>}
    </section>
  );
}

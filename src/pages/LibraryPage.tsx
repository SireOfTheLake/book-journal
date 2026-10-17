import { useSearchParams } from 'react-router-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDb } from '../db/DbContext';
import { quickAdd } from '../repo/bookLog';
import { getCovers, listLibrary, type LibraryBook } from '../repo/library';
import { listBookTags, listTagOptions, type TagOption } from '../repo/search';
import LibraryView, { type LibraryActions } from './LibraryView';

export default function LibraryPage() {
  const db = useDb();
  const [books, setBooks] = useState<LibraryBook[] | null>(null);
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [tagOptions, setTagOptions] = useState<TagOption[]>([]);
  const [bookTags, setBookTags] = useState<Record<string, string[]>>({});
  const [params] = useSearchParams();
  const asked = useRef(new Set<string>());

  const reload = useCallback(async () => setBooks(await listLibrary(db)), [db]);
  useEffect(() => { reload().catch((e) => setError(String(e))); }, [reload]);

  useEffect(() => { Promise.all([listTagOptions(db), listBookTags(db)]).then(([o, t]) => { setTagOptions(o); setBookTags(t); }, () => undefined); }, [db]);

  const requestCovers = useCallback((ids: string[]) => {
    const fresh = ids.filter((id) => !asked.current.has(id));
    if (!fresh.length) return;
    fresh.forEach((id) => asked.current.add(id));
    getCovers(db, fresh).then((got) => setCovers((c) => ({ ...c, ...got })), (e) => setError(String(e)));
  }, [db]);

  const act = useMemo<LibraryActions>(() => ({
    addBook: async (title, status) => { try { await quickAdd(db, { title, authors: [], status }); await reload(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } },
  }), [db, reload]);

  return (
    <section>
      <h1 className="pagetitle">LIBRARY <span className="muted small">Every book you have added</span></h1>
      {error && <div className="bcard warn" role="alert">{error} <button type="button" className="mini" onClick={() => setError(null)}>Dismiss</button></div>}
      {books ? <LibraryView key={params.toString()} initialTags={params.getAll('tag')} initialQuery={params.get('q') ?? ''} tagOptions={tagOptions} bookTags={bookTags} books={books} covers={covers} requestCovers={requestCovers} act={act} /> : <p className="muted">Loading...</p>}
    </section>
  );
}

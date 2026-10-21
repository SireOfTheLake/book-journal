import { useSearchParams } from 'react-router-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDb } from '../db/DbContext';
import { listItems, quickAdd } from '../repo/bookLog';
import { listEntries } from '../repo/lists';
import { applyBulk, deleteBooks, describeBulk } from '../repo/bulkEdit';
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

  const refreshAll = useCallback(async () => {
    await reload();
    const [o, t] = await Promise.all([listTagOptions(db), listBookTags(db)]);
    setTagOptions(o); setBookTags(t);
  }, [db, reload]);

  const act = useMemo<LibraryActions>(() => ({
    bulk: {
      options: async () => ({
        sources: await listItems(db, 'source'),
        genres: (await listEntries(db, 'genre')).map((g) => g.name),
        tropes: (await listEntries(db, 'trope')).map((g) => g.name),
      }),
      describe: (ids, changes) => describeBulk(db, ids, changes),
      apply: (ids, changes, onProgress) => applyBulk(db, ids, changes, onProgress),
      remove: (ids, onProgress) => deleteBooks(db, ids, onProgress),
      refresh: refreshAll,
    },
    addBook: async (title, status) => { try { await quickAdd(db, { title, authors: [], status }); await reload(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } },
  }), [db, reload, refreshAll]);

  return (
    <section>
      <h1 className="pagetitle">LIBRARY <span className="muted small">Every book you have added</span></h1>
      {error && <div className="bcard warn" role="alert">{error} <button type="button" className="mini" onClick={() => setError(null)}>Dismiss</button></div>}
      {books ? <LibraryView key={params.toString()} initialTags={params.getAll('tag')} initialQuery={params.get('q') ?? ''} tagOptions={tagOptions} bookTags={bookTags} books={books} covers={covers} requestCovers={requestCovers} act={act} /> : <p className="muted">Loading...</p>}
    </section>
  );
}

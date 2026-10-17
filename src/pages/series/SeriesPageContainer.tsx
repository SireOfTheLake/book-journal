import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useDb } from '../../db/DbContext';
import { listTagOptions, renameTag, type Item } from '../../repo/bookLog';
import { listBookOptions } from '../../repo/characters';
import { listAuthorOptions } from '../../repo/bookLog';
import { setStatus } from '../../repo/bookLog';
import { addBookToSeries, addExistingBook, addSeriesAuthor, removeSeriesAuthor, addSeriesGenre, createUniverse, getSeriesPage, listUniverses, removeSeriesGenre, markReleased, setFormatRelease, updateSeries, type SeriesPage } from '../../repo/series';
import SeriesView, { type SeriesActions } from './SeriesView';

export default function SeriesPageContainer() {
  const db = useDb();
  const { seriesId = '' } = useParams();
  const [page, setPage] = useState<SeriesPage | null | undefined>(undefined);
  const [universes, setUniverses] = useState<Item[]>([]);
  const [genres, setGenres] = useState<Item[]>([]);
  const [authors, setAuthors] = useState<Item[]>([]);
  const [books, setBooks] = useState<(Item & { authors: string | null })[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [p, u, g, b, a] = await Promise.all([getSeriesPage(db, seriesId), listUniverses(db), listTagOptions(db, 'genre'), listBookOptions(db), listAuthorOptions(db)]);
    setPage(p); setUniverses(u); setGenres(g); setBooks(b.filter((x) => !p?.books.some((y) => y.id === x.id))); setAuthors(a);
  }, [db, seriesId]);
  useEffect(() => { reload().catch((e) => setError(String(e))); }, [reload]);

  const act = useMemo<SeriesActions>(() => {
    const run = async (fn: () => Promise<unknown>) => { try { await fn(); await reload(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } };
    return {
      update: (f) => run(() => updateSeries(db, seriesId, f)),
      createUniverse: (name) => run(async () => { const id = await createUniverse(db, name); await updateSeries(db, seriesId, { universe_id: id }); }),
      addGenre: (n) => run(() => addSeriesGenre(db, seriesId, n)),
      removeGenre: (id) => run(() => removeSeriesGenre(db, seriesId, id)),
      renameGenre: (id, n) => run(() => renameTag(db, 'genre', id, n)),
      addBook: (t) => run(() => addBookToSeries(db, seriesId, t)),
      setPosition: (bookId, pos) => run(async () => { await db.execute('UPDATE book SET series_position = ? WHERE id = ?', [pos, bookId]); if (pos !== null && Number.isInteger(pos)) await db.execute('UPDATE series SET total_books = ? WHERE id = ? AND COALESCE(total_books, 0) < ?', [pos, seriesId, pos]); }),
      setRelease: (bookId, f, v) => run(() => setFormatRelease(db, bookId, f, v)),
      markReleased: (bookId) => run(() => markReleased(db, bookId)),
      addAuthor: (aid) => run(() => addSeriesAuthor(db, seriesId, { id: aid })),
      createAuthor: (name) => run(() => addSeriesAuthor(db, seriesId, { name })),
      removeAuthor: (aid) => run(() => removeSeriesAuthor(db, seriesId, aid)),
      addExistingBook: (bookId, position) => run(() => addExistingBook(db, seriesId, bookId, position)),
      setBookStatus: (bookId, readId, status) => run(() => setStatus(db, bookId, readId, status)),
    };
  }, [db, seriesId, reload]);

  if (page === undefined) return <p className="muted">Loading...</p>;
  if (page === null) return <p className="muted">That series could not be found.</p>;
  return (
    <section>
      <h1 className="pagetitle">SERIES</h1>
      {error && <div className="bcard warn" role="alert">{error} <button type="button" className="mini" onClick={() => setError(null)}>Dismiss</button></div>}
      <SeriesView page={page} lists={{ universes, genres, books, authors }} act={act} />
    </section>
  );
}

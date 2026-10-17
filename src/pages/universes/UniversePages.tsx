import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useDb } from '../../db/DbContext';
import { listBookOptions } from '../../repo/characters';
import { listSeriesOptions } from '../../repo/series';
import * as repo from '../../repo/universes';
import UniverseListView from './UniverseListView';
import UniverseView, { type UniverseActions, type UniverseLists } from './UniverseView';

export function UniversesPage() {
  const db = useDb();
  const nav = useNavigate();
  const [rows, setRows] = useState<repo.UniverseRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { repo.listUniverseRows(db).then(setRows).catch((e) => setError(String(e))); }, [db]);
  return (
    <section>
      <h1 className="pagetitle">UNIVERSES <span className="muted small">Shared worlds, with their series and books</span></h1>
      {error && <div className="bcard warn" role="alert">{error}</div>}
      {rows ? <UniverseListView rows={rows} onCreate={async (n) => { try { nav(`/universes/${await repo.createUniverseNamed(db, n)}`); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } }} /> : <p className="muted">Loading...</p>}
    </section>
  );
}

export function UniversePageContainer() {
  const db = useDb();
  const nav = useNavigate();
  const { universeId = '' } = useParams();
  const [page, setPage] = useState<repo.UniversePage | null | undefined>(undefined);
  const [lists, setLists] = useState<UniverseLists>({ series: [], books: [] });
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    const [p, series, books] = await Promise.all([repo.getUniversePage(db, universeId), listSeriesOptions(db), listBookOptions(db)]);
    setPage(p);
    setLists({ series, books: books.filter((b) => !p?.books.some((x) => x.id === b.id)) });
  }, [db, universeId]);
  useEffect(() => { reload().catch((e) => setError(String(e))); }, [reload]);
  const act = useMemo<UniverseActions>(() => {
    const run = async (fn: () => Promise<unknown>) => { try { await fn(); await reload(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } };
    return {
      update: (f) => run(() => repo.updateUniverse(db, universeId, f)),
      addSeries: (id) => run(() => repo.setSeriesUniverse(db, id, universeId)),
      removeSeries: (id) => run(() => repo.setSeriesUniverse(db, id, null)),
      addBook: (id) => run(() => repo.setBookUniverse(db, id, universeId)),
      removeBook: (id) => run(() => repo.setBookUniverse(db, id, null)),
      remove: async () => { try { await repo.deleteUniverse(db, universeId); nav('/universes'); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } },
    };
  }, [db, universeId, reload, nav]);
  if (page === undefined) return <p className="muted">Loading...</p>;
  if (page === null) return <p className="muted">That universe could not be found.</p>;
  return (
    <section>
      <h1 className="pagetitle">UNIVERSE</h1>
      {error && <div className="bcard warn" role="alert">{error} <button type="button" className="mini" onClick={() => setError(null)}>Dismiss</button></div>}
      <UniverseView page={page} lists={lists} act={act} />
    </section>
  );
}

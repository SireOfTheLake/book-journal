import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDb } from '../db/DbContext';
import { getCovers } from '../repo/library';
import { addUpcoming, listJustReleased, listUpcoming, type ReleaseBook } from '../repo/releases';
import { setFormatRelease } from '../repo/series';
import ReleasesView, { type ReleasesActions } from './ReleasesView';

const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export default function ReleasesPage() {
  const db = useDb();
  const today = useMemo(todayIso, []);
  const [data, setData] = useState<{ upcoming: ReleaseBook[]; recent: ReleaseBook[] } | null>(null);
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    const [upcoming, recent] = await Promise.all([listUpcoming(db, today), listJustReleased(db, today)]);
    setData({ upcoming, recent });
    const ids = [...new Set([...upcoming, ...recent].map((b) => b.id))];
    if (ids.length) setCovers(await getCovers(db, ids));
  }, [db, today]);
  useEffect(() => { reload().catch((e) => setError(String(e))); }, [reload]);
  const act = useMemo<ReleasesActions>(() => ({
    setDate: (id, f, v) => { setFormatRelease(db, id, f, v).then(reload, (e) => setError(e instanceof Error ? e.message : String(e))); },
    add: async (title, authors, dates) => { await addUpcoming(db, { title, authors, dates }); await reload(); },
  }), [db, reload]);
  return (
    <section>
      <h1 className="pagetitle">UPCOMING RELEASES <span className="muted small">Books you are waiting for, soonest first</span></h1>
      {error && <div className="bcard warn" role="alert">{error} <button type="button" className="mini" onClick={() => setError(null)}>Dismiss</button></div>}
      {data ? <ReleasesView upcoming={data.upcoming} justReleased={data.recent} covers={covers} today={today} act={act} /> : <p className="muted">Loading...</p>}
    </section>
  );
}

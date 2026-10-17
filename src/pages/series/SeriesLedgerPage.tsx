import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDb } from '../../db/DbContext';
import { createSeries, listSeriesLedger, type LedgerRow } from '../../repo/series';
import LedgerView from './LedgerView';

export default function SeriesLedgerPage() {
  const db = useDb();
  const nav = useNavigate();
  const [rows, setRows] = useState<LedgerRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => setRows(await listSeriesLedger(db)), [db]);
  useEffect(() => { reload().catch((e) => setError(String(e))); }, [reload]);
  return (
    <section>
      <h1 className="pagetitle">SERIES LEDGER <span className="muted small">Every series at a glance</span></h1>
      {error && <div className="bcard warn" role="alert">{error}</div>}
      {rows ? <LedgerView rows={rows} onCreate={async (t) => { try { nav(`/series/${await createSeries(db, t)}`); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } }} /> : <p className="muted">Loading...</p>}
    </section>
  );
}

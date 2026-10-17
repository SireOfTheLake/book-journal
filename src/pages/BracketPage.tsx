import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDb } from '../db/DbContext';
import { getBracket, setHalfPick, setMatchWinner, setMonthPick, setQuarterPick, setYearPick, type Bracket } from '../repo/bracket';
import { useJournalYear } from '../ui/Shell';
import BracketView, { type BracketActions } from './BracketView';

export default function BracketPage() {
  const db = useDb();
  const year = useJournalYear();
  const [bracket, setBracket] = useState<Bracket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => setBracket(await getBracket(db, year)), [db, year]);
  useEffect(() => { setBracket(null); reload().catch((e) => setError(String(e))); }, [reload]);
  const act = useMemo<BracketActions>(() => {
    const run = async (fn: () => Promise<unknown>) => { try { await fn(); await reload(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } };
    return {
      month: (m, id) => run(() => setMonthPick(db, year, m, id)), match: (q, m, id) => run(() => setMatchWinner(db, year, q, m, id)),
      quarter: (q, id) => run(() => setQuarterPick(db, year, q, id)), half: (h, id) => run(() => setHalfPick(db, year, h, id)), champion: (id) => run(() => setYearPick(db, year, id)),
    };
  }, [db, year, reload]);
  return (
    <section>
      <h1 className="pagetitle">BOOK BRACKET <span className="muted small">Journal {year}, best of month, quarter, half-year, and year</span></h1>
      {error && <div className="bcard warn" role="alert">{error} <button type="button" className="mini" onClick={() => setError(null)}>Dismiss</button></div>}
      {bracket ? <BracketView bracket={bracket} act={act} /> : <p className="muted">Loading...</p>}
    </section>
  );
}

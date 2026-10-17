import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDb } from '../../db/DbContext';
import { listTagOptions } from '../../repo/bookLog';
import { listChallenges } from '../../repo/challenges';
import * as repo from '../../repo/goals';
import { useJournalYear } from '../../ui/Shell';
import OverviewView, { type OverviewActions, type OverviewLists } from './OverviewView';

export const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export default function OverviewPage() {
  const db = useDb();
  const year = useJournalYear();
  const [o, setO] = useState<repo.Overview | null>(null);
  const [lists, setLists] = useState<OverviewLists>({ genres: [], tropes: [] });
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    const [ov, genres, tropes, chs] = await Promise.all([repo.getOverview(db, year, todayIso()), listTagOptions(db, 'genre'), listTagOptions(db, 'trope'), listChallenges(db, year)]);
    setO(ov); setLists({ genres, tropes, challenges: chs.map((c) => ({ id: c.id, name: c.name })) });
  }, [db, year]);
  useEffect(() => { setO(null); reload().catch((e) => setError(String(e))); }, [reload]);
  const act = useMemo<OverviewActions>(() => {
    const run = async (fn: () => Promise<unknown>) => { try { await fn(); setError(null); await reload(); return true; } catch (e) { setError(e instanceof Error ? e.message : String(e)); return false; } };
    return {
      saveGoal: (input) => run(() => repo.saveGoal(db, year, input)),
      deleteGoal: (id) => void run(() => repo.deleteGoal(db, id)),
      moveGoal: (id, dir) => void run(() => repo.moveGoal(db, year, id, dir)),
      copyGoals: (from) => void run(() => repo.copyYearlyGoals(db, from, year)),
      setNotes: (text) => void run(() => repo.setYearNotes(db, year, text)),
    };
  }, [db, year, reload]);
  return (
    <section>
      <h1 className="pagetitle">JOURNAL {year} <span className="muted small">Goals, series, and streaks for the year</span></h1>
      {error && <div className="bcard warn" role="alert">{error} <button type="button" className="mini" onClick={() => setError(null)}>Dismiss</button></div>}
      {o ? <OverviewView o={o} lists={lists} act={act} /> : <p className="muted">Loading...</p>}
    </section>
  );
}

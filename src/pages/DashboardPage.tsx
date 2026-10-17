import { useEffect, useState } from 'react';
import { useDb } from '../db/DbContext';
import { getMonthlyDashboard, getYearlyDashboard, type MonthlyDashboard, type YearlyDashboard } from '../repo/dashboard';
import { useJournalYear } from '../ui/Shell';
import DashboardView, { type DashTab } from './DashboardView';

const isoToday = () => new Date().toLocaleDateString('en-CA');

export default function DashboardPage() {
  const db = useDb();
  const year = useJournalYear();
  const today = isoToday();
  const [tab, setTab] = useState<DashTab>('monthly');
  const [month, setMonth] = useState(() => (today.startsWith(String(year)) ? Number(today.slice(5, 7)) : 1));
  const [d, setD] = useState<MonthlyDashboard | null>(null);
  const [y, setY] = useState<YearlyDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setMonth(today.startsWith(String(year)) ? Number(today.slice(5, 7)) : 1); }, [year]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (tab !== 'yearly') return;
    let live = true; setY(null);
    getYearlyDashboard(db, year, today).then((x) => { if (live) setY(x); }, (e) => { if (live) setError(String(e)); });
    return () => { live = false; };
  }, [db, year, tab, today]);
  useEffect(() => {
    if (tab !== 'monthly') return;
    let live = true; setD(null);
    getMonthlyDashboard(db, year, month).then((x) => { if (live) setD(x); }, (e) => { if (live) setError(String(e)); });
    return () => { live = false; };
  }, [db, year, month, tab]);
  return (
    <section>
      <h1 className="pagetitle">DASHBOARD {year} <span className="muted small">Your reading, month by month</span></h1>
      {error && <div className="bcard warn" role="alert">{error} <button type="button" className="mini" onClick={() => setError(null)}>Dismiss</button></div>}
      <DashboardView tab={tab} setTab={setTab} year={year} month={month} setMonth={setMonth} d={d} y={y} today={today} />
    </section>
  );
}

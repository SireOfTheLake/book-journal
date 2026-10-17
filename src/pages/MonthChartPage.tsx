import { useEffect, useState } from 'react';
import { useDb } from '../db/DbContext';
import { getMonthChart, type ChartMonth } from '../repo/monthChart';
import { useJournalYear } from '../ui/Shell';
import MonthChartView from './MonthChartView';

export default function MonthChartPage() {
  const db = useDb();
  const year = useJournalYear();
  const [months, setMonths] = useState<ChartMonth[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setMonths(null); getMonthChart(db, year).then(setMonths, (e) => setError(String(e))); }, [db, year]);
  return (
    <section>
      <h1 className="pagetitle">MONTH CHART <span className="muted small">Journal {year}, books finished per month</span></h1>
      {error && <div className="bcard warn" role="alert">{error}</div>}
      {months ? <MonthChartView months={months} year={year} /> : <p className="muted">Loading...</p>}
    </section>
  );
}

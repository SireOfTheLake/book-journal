import { useEffect, useState } from 'react';
import { useDb } from '../db/DbContext';
import { getCalendarMonth, type CalendarMonth } from '../repo/calendar';
import { useJournalYear } from '../ui/Shell';
import CalendarView from './CalendarView';

const isoToday = () => new Date().toLocaleDateString('en-CA');

export default function CalendarPage() {
  const db = useDb();
  const year = useJournalYear();
  const now = new Date();
  const [month, setMonth] = useState(year === now.getFullYear() ? now.getMonth() + 1 : 1);
  const [data, setData] = useState<CalendarMonth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const today = isoToday();

  useEffect(() => { setMonth(year === new Date().getFullYear() ? new Date().getMonth() + 1 : 1); }, [year]);
  useEffect(() => {
    let live = true;
    getCalendarMonth(db, year, month, today).then((d) => live && setData(d), (e) => live && setError(String(e)));
    return () => { live = false; };
  }, [db, year, month, today]);

  return (
    <section>
      <h1 className="pagetitle">CALENDAR <span className="muted small">Journal {year}, hover a day for details</span></h1>
      {error && <div className="bcard warn" role="alert">{error}</div>}
      {data ? (
        <CalendarView data={data} today={today} canPrev={month > 1} canNext={month < 12}
          onPrev={() => setMonth((m) => Math.max(1, m - 1))} onNext={() => setMonth((m) => Math.min(12, m + 1))}
          onToday={() => setMonth(year === new Date().getFullYear() ? new Date().getMonth() + 1 : month)} />
      ) : <p className="muted">Loading...</p>}
    </section>
  );
}

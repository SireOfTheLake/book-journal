import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDb } from '../db/DbContext';
import { MONTHS, PRINT_TYPES, planSheets, periodLabel, type PrintData, type PrintType } from '../domain/printPlan';
import { getPrintData } from '../repo/printData';
import { useJournalYear } from '../ui/Shell';
import PrintDocument from './print/PrintDocument';

const ALL = PRINT_TYPES.map((t) => t.id);
// A month's printout is the month itself; the year-wide pages are there to add if you want them.
const MONTH_DEFAULT: PrintType[] = ['calendar', 'dashboard', 'bookLogs', 'seriesLogs'];
const KEY = (mode: 'year' | 'month') => `print_types_${mode}`;

async function loadTypes(db: ReturnType<typeof useDb>, mode: 'year' | 'month'): Promise<Set<PrintType>> {
  const [row] = await db.select<{ value: string }>('SELECT value FROM app_setting WHERE key = ?', [KEY(mode)]);
  try { if (row) return new Set((JSON.parse(row.value) as string[]).filter((x): x is PrintType => (ALL as string[]).includes(x))); } catch { /* use the default */ }
  return new Set(mode === 'year' ? ALL : MONTH_DEFAULT);
}
async function saveTypes(db: ReturnType<typeof useDb>, mode: 'year' | 'month', types: Set<PrintType>) {
  await db.execute("INSERT INTO app_setting (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')", [KEY(mode), JSON.stringify([...types])]);
}

export default function PrintPage() {
  const db = useDb();
  const year = useJournalYear();
  const now = new Date();
  const [mode, setMode] = useState<'year' | 'month'>('year');
  const [month, setMonth] = useState(year === now.getFullYear() ? now.getMonth() + 1 : 1);
  const [types, setTypes] = useState<Set<PrintType> | null>(null);
  const [data, setData] = useState<PrintData | null>(null);
  const [ready, setReady] = useState(false);
  const [pages, setPages] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const period = useMemo(() => ({ year, month: mode === 'month' ? month : null }), [year, mode, month]);

  useEffect(() => { setMonth(year === new Date().getFullYear() ? new Date().getMonth() + 1 : 1); }, [year]);
  useEffect(() => { let live = true; setTypes(null); loadTypes(db, mode).then((t) => live && setTypes(t), (e) => live && setError(String(e))); return () => { live = false; }; }, [db, mode]);
  useEffect(() => { let live = true; setData(null); getPrintData(db, year, period.month).then((d) => live && setData(d), (e) => live && setError(String(e))); return () => { live = false; }; }, [db, year, period.month]);

  const sheets = useMemo(() => (types && data ? planSheets(period, types, data) : null), [period, types, data]);
  const toggle = (t: PrintType) => {
    const next = new Set(types);
    if (next.has(t)) next.delete(t); else next.add(t);
    setTypes(next); void saveTypes(db, mode, next);
  };
  const setAll = (on: boolean) => { const next = new Set<PrintType>(on ? ALL : []); setTypes(next); void saveTypes(db, mode, next); };
  const onReady = useCallback((r: boolean) => setReady(r), []);
  const onTotal = useCallback((n: number) => setPages(n), []);
  const print = () => { try { window.print(); } catch (e) { setError(`Printing is not available here: ${e instanceof Error ? e.message : String(e)}`); } };
  const count = (t: PrintType) => (sheets ? sheets.filter((s) => s.type === t).length : 0);

  return (
    <section className="printpage">
      <h2 className="gname-sm noprint">Print and PDF <span className="muted small">Journal {year}</span></h2>
      {error && <div className="bcard warn noprint" role="alert">{error} <button type="button" className="mini" onClick={() => setError(null)}>Dismiss</button></div>}
      <div className="printlayout">
        <aside className="printui noprint" aria-label="What to print">
          <div className="bcard">
            <span className="lbl2">Period</span>
            <div className="seg" role="group" aria-label="Period">
              <button type="button" className={mode === 'year' ? 'on' : ''} aria-pressed={mode === 'year'} onClick={() => setMode('year')}>Whole year</button>
              <button type="button" className={mode === 'month' ? 'on' : ''} aria-pressed={mode === 'month'} onClick={() => setMode('month')}>One month</button>
            </div>
            {mode === 'month' && (
              <select aria-label="Month" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            )}
            <span className="muted small">{periodLabel(period)}</span>
          </div>
          <div className="bcard">
            <span className="lbl2">Pages to include</span>
            <ul className="printtypes">
              {PRINT_TYPES.map((t) => (
                <li key={t.id}>
                  <label>
                    <input type="checkbox" checked={!!types?.has(t.id)} disabled={!types} onChange={() => toggle(t.id)} />
                    <span><b>{t.label}</b>{sheets && types?.has(t.id) ? <span className="muted small"> · {count(t.id)} sheet{count(t.id) === 1 ? '' : 's'}</span> : null}<br /><span className="muted small">{t.note}</span></span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="printbtns"><button type="button" className="mini" onClick={() => setAll(true)}>Select all</button><button type="button" className="mini" onClick={() => setAll(false)}>Clear</button></div>
          </div>
          <div className="bcard">
            <button type="button" className="btn on printgo" disabled={!ready || !sheets} onClick={print}>{ready ? `Print or save as PDF (${pages} page${pages === 1 ? '' : 's'})` : 'Getting pages ready...'}</button>
            <span className="muted small">In the print window choose your printer, or <b>Microsoft Print to PDF</b> to save a PDF. Leave the scale at 100% and the margins on Default. Pages print on white paper in Letter size; calendars, the month chart, and the bracket are turned sideways.</span>
          </div>
        </aside>
        <div className="printpreview">
          {sheets ? <PrintDocument period={period} sheets={sheets} onReady={onReady} onTotal={onTotal} /> : <p className="muted noprint">Loading...</p>}
        </div>
      </div>
    </section>
  );
}

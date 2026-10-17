import { Link } from 'react-router-dom';
import { MONTH_NAMES, monthColor } from '../domain/months';
import type { ChartMonth } from '../repo/monthChart';

const W = 980;
const RH = 46;
const LAB = 68;
const CREAM = '#f2ebe0';

export default function MonthChartView({ months, year }: { months: ChartMonth[]; year: number }) {
  const counts = months.map((m) => m.books.length);
  const maxBooks = Math.max(10, Math.ceil(Math.max(...counts) / 5) * 5); // cells shrink so the longest month always fits
  const pageStep = Math.max(...months.map((m) => m.pages)) > 8000 ? 4000 : 2000;
  const maxPages = Math.max(pageStep, Math.ceil(Math.max(...months.map((m) => m.pages)) / pageStep) * pageStep);
  const cw = W / maxBooks;
  const totalBooks = counts.reduce((a, b) => a + b, 0);
  const totalPages = months.reduce((a, m) => a + m.pages, 0);
  const pts = months.map((m, i) => ({ m, x: LAB + (m.pages / maxPages) * W, y: i * RH + RH / 2 })).filter((p) => p.m.pages > 0);
  const gridStops = `repeating-linear-gradient(90deg, transparent 0, transparent ${5 * cw - 1}px, var(--line) ${5 * cw - 1}px, var(--line) ${5 * cw}px)`;
  const bookTicks = Array.from({ length: maxBooks / 5 + 1 }, (_, k) => k * 5);
  const pageTicks = Array.from({ length: maxPages / pageStep + 1 }, (_, k) => k * pageStep);

  return (
    <div className="monthchart">
      <div className="calhead">
        <span><span className="lbl2">{`Books finished in ${year}`}</span> <b className="count">{totalBooks}</b></span>
        <span><span className="lbl2">Pages</span> <b className="count">{totalPages ? totalPages.toLocaleString() : '—'}</b></span>
      </div>
      <div className="bcard" style={{ padding: '18px 20px' }}>
        <div className="axis" style={{ marginLeft: LAB, width: W }}>
          <span className="lbl2 axislabel" style={{ left: -LAB }}>Books</span>
          {bookTicks.map((t) => <span key={t} style={{ left: t * cw - 6 }}>{t}</span>)}
        </div>
        <div style={{ position: 'relative' }}>
          {months.map((m, i) => (
            <div key={m.month} className="mrow" style={{ height: RH }}>
              <span className="mname" style={{ color: monthColor(m.month) }}>{MONTH_NAMES[i].slice(0, 3).toUpperCase()}</span>
              <div className="mtrack" style={{ width: W, height: RH, backgroundImage: gridStops }} title={`${MONTH_NAMES[i]}: ${m.books.length} ${m.books.length === 1 ? 'book' : 'books'}${m.pages ? `, ${m.pages.toLocaleString()} pages` : ''}`}>
                {m.books.map((b) => <Link key={b.read_id} className="mcell" to={`/book/${b.book_id}/${b.read_id}`} title={b.title} aria-label={b.title} style={{ width: cw, background: monthColor(m.month) }} />)}
              </div>
              <span className="mcount">{m.books.length || '—'}</span>
            </div>
          ))}
          <svg className="mline" width={LAB + W} height={RH * 12} aria-hidden="true">
            {pts.length > 1 && <polyline points={pts.map((p) => `${p.x.toFixed(1)},${p.y}`).join(' ')} fill="none" stroke={CREAM} strokeWidth="2.5" />}
            {pts.map((p) => <circle key={p.m.month} cx={p.x} cy={p.y} r="6" fill={CREAM} stroke="var(--bg)" strokeWidth="2" />)}
          </svg>
        </div>
        <div className="axis" style={{ marginLeft: LAB, width: W, marginTop: 6 }}>
          <span className="lbl2 axislabel" style={{ left: -LAB, color: CREAM }}>Pages</span>
          {pageTicks.map((t) => <span key={t} style={{ left: (t / maxPages) * W - 14, color: CREAM }}>{t.toLocaleString()}</span>)}
        </div>
      </div>
      <span className="muted">Each cell is one book finished that month (scale along the top; click a cell to open it). The cream line is the total pages read each month (scale along the bottom). Pages come from page counts and your day log, so months fill in as you add them.</span>
    </div>
  );
}

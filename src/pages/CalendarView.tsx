import { useState } from 'react';
import { Link } from 'react-router-dom';
import { bookColor } from '../domain/colors';
import { formatDuration } from '../domain/format';
import { MONTH_NAMES, monthColor } from '../domain/months';
import type { CalEntry, CalendarMonth, CalFinish, CalLine } from '../repo/calendar';
import { Icon } from './bookLog/parts';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FORMAT_NAME = { audio: 'Audio', ebook: 'Ebook', physical: 'Physical' } as const;
// Covers sit three to a row and wrap onto more rows, so a busy day simply grows taller.
const COVER_W = 44, COVER_H = 66, COVER_GAP = 4, PER_ROW = 3, TOP = 18;
const coverX = (k: number) => 6 + (k % PER_ROW) * (COVER_W + COVER_GAP);
const rowTop = (k: number) => TOP + Math.floor(k / PER_ROW) * (COVER_H + COVER_GAP);

interface Lane extends CalLine { s: number; e: number; startsHere: boolean; endsHere: boolean; lane: number }

// The percent always leads; page (and time, for audiobooks) were worked out from what was typed.
function entryText(e: CalEntry) {
  return [e.percent !== null ? `${e.percent}%` : null, e.page !== null ? `page ${e.page}` : null, e.seconds !== null ? formatDuration(e.seconds) : null].filter(Boolean).join(' · ') || 'read';
}

function gainText(g: NonNullable<CalEntry['gain']>) {
  return ['+' + g.percent + '%', g.pages ? `${g.pages} pages` : null, g.seconds ? formatDuration(g.seconds) : null].filter(Boolean).join(' · ');
}

// The hover card is drawn at a fixed spot on the screen, so it floats over the page instead of stretching the calendar box.
const TIP_W = 270, TIP_H = 260;
interface TipSpot { date: string; left: number; top?: number; bottom?: number }
export interface CalendarProps {
  data: CalendarMonth;
  today: string;
  canPrev: boolean;
  canNext: boolean;
  onPrev(): void;
  onNext(): void;
  onToday(): void;
}

export default function CalendarView({ data, today, canPrev, canNext, onPrev, onNext, onToday }: CalendarProps) {
  const { year, month } = data;
  const [spot, setSpot] = useState<TipSpot | null>(null);
  const n = new Date(year, month, 0).getDate();
  const offset = new Date(year, month - 1, 1).getDay();
  const day = (iso: string) => Number(iso.slice(8));
  const iso = (d: number) => `${data.start.slice(0, 8)}${String(d).padStart(2, '0')}`;

  // Reading lines, clipped to this month, each given its own height so overlaps never share a lane.
  const clipped = data.lines.map((l) => ({
    ...l, s: l.from < data.start ? 1 : day(l.from), e: l.to > data.end ? n : day(l.to),
    startsHere: l.from >= data.start, endsHere: !l.open && l.to <= data.end, lane: 0,
  })).sort((a, b) => a.s - b.s || a.e - b.e);
  const laneEnds: number[] = [];
  for (const l of clipped) {
    let k = laneEnds.findIndex((end) => end < l.s);
    if (k < 0) { k = laneEnds.length; laneEnds.push(0); }
    laneEnds[k] = l.e; l.lane = k;
  }
  const lines: Lane[] = clipped;

  const cells: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: n }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);

  const color = monthColor(month);
  const maxPages = Math.max(1, ...Object.values(data.pages));
  const daysWithFinish = new Set(data.finishes.map((f) => f.finish_date)).size;

  const cell = (d: number | null, idx: number) => {
    if (d === null) return <div key={`b${idx}`} className="cday off" />;
    const date = iso(d);
    const col = idx % 7;
    const covers: CalFinish[] = data.finishes.filter((f) => f.finish_date === date);
    const entries = data.entries.filter((e) => e.date === date);
    const here = lines.filter((l) => l.s <= d && d <= l.e);
    return (
      <div key={date} className={`cday${date === today ? ' today' : ''}`}
        onMouseEnter={(ev) => {
          const r = ev.currentTarget.getBoundingClientRect();
          const left = Math.max(8, Math.min(col >= 4 ? r.right - TIP_W : r.left, window.innerWidth - TIP_W - 8));
          setSpot(r.bottom + 6 + TIP_H > window.innerHeight && r.top > TIP_H ? { date, left, bottom: window.innerHeight - r.top + 6 } : { date, left, top: r.bottom + 6 });
        }}
        onMouseLeave={() => setSpot(null)}>
        <span className="dn">{String(d).padStart(2, '0')}</span>
        {covers.length > 0 && (
          <div className="covers">
            {covers.map((f) => (
              <Link key={f.read_id} className={`cv${f.cover ? ' hascover' : ''}`} to={`/book/${f.book_id}/${f.read_id}`} aria-label={f.title} style={{ borderColor: bookColor(f.color_index), ...(f.cover ? { backgroundImage: `url("${f.cover}")` } : {}) }}>{f.cover ? '' : f.title.toUpperCase()}</Link>
            ))}
          </div>
        )}
        {here.map((l) => {
          const c = bookColor(l.color_index);
          const y = 34 + l.lane * 16;
          const leftEdge = col > 0 ? -7 : 0;
          const rightEdge = col < 6 ? -7 : 0;
          const isStart = l.startsHere && d === l.s;
          const isEnd = d === l.e;
          let style: React.CSSProperties;
          if (isStart && isEnd) style = { left: '50%', width: 0 };
          else if (isStart) style = { left: '50%', right: rightEdge };
          else if (isEnd && l.endsHere) {
            const k = covers.findIndex((f) => f.read_id === l.read_id);
            if (k >= 0) {
              // The line runs to the left edge of its cover. If the cover is on a lower row, step down first.
              const yEnd = rowTop(k) + 16 + l.lane * 16;
              style = { left: leftEdge, width: coverX(k) - leftEdge };
              if (yEnd !== y) {
                return (
                  <span key={l.read_id}>
                    <span className="line" style={{ top: y, background: c, left: leftEdge, width: 12 }} />
                    <span className="line" style={{ top: y, background: c, left: leftEdge, width: 5, height: yEnd - y + 5 }} />
                    <span className="line" style={{ top: yEnd, background: c, left: leftEdge, width: coverX(k) - leftEdge }} />
                  </span>
                );
              }
            } else style = { left: leftEdge, right: '50%' };
          } else if (isEnd) style = { left: leftEdge, right: '50%' };
          else style = { left: leftEdge, right: rightEdge };
          return (
            <span key={l.read_id}>
              <span className="line" style={{ top: y, background: c, ...style }} />
              {(isStart || (isEnd && !l.endsHere)) && <span className="dot" style={{ top: y - 3, background: c, left: isStart ? '50%' : undefined, right: isStart ? undefined : '50%', marginLeft: isStart ? -5 : 0, marginRight: isStart ? 0 : -5 }} />}
            </span>
          );
        })}
        {entries.length > 0 && <span className="flag" title={entries.map((e) => `${e.title}: ${entryText(e)}`).join('\n')}><Icon name="ebook" />{entryText(entries[0])}{entries.length > 1 ? ` +${entries.length - 1}` : ''}</span>}
        {(covers.length > 0 || entries.length > 0) && spot?.date === date && (
          <div className="tip" style={{ left: spot.left, top: spot.top, bottom: spot.bottom }}>
            <span className="lbl2">{new Date(year, month - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
            {covers.length > 0 && <span className="muted">Finished</span>}
            {covers.map((f) => (
              <div key={f.read_id} className="tipbook" style={{ borderLeftColor: bookColor(f.color_index) }}>
                <Link className="l" to={`/book/${f.book_id}/${f.read_id}`}>{f.title}</Link>
                <span className="fmt muted">{f.format && <><Icon name={f.format} />{FORMAT_NAME[f.format]} · </>}{f.authors ?? ''}</span>
              </div>
            ))}
            {entries.map((e) => (
              <div key={e.read_id + e.date} className="tipentry"><span className="muted">Day entry</span><br /><Link className="l" to={`/book/${e.book_id}/${e.read_id}`}>{e.title}</Link> · {entryText(e)}{e.gain ? <span className="muted"> ({gainText(e.gain)} that day)</span> : null}{e.text ? <span className="muted"> — {e.text}</span> : null}</div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="calendar">
      <div className="calhead">
        <button type="button" className="ib" aria-label="Previous month" disabled={!canPrev} onClick={onPrev}>&#8249;</button>
        <span className="calmonth" style={{ color }}>{`${MONTH_NAMES[month - 1].toUpperCase()} ${year}`}</span>
        <button type="button" className="ib" aria-label="Next month" disabled={!canNext} onClick={onNext}>&#8250;</button>
        <button type="button" className="mini" onClick={onToday}>Today</button>
        <span className="grow" />
        <span><span className="lbl2">Books finished</span> <b className="count">{data.finishes.length}</b></span>
        <span><span className="lbl2">Days with a finish</span> <b className="count">{daysWithFinish}</b></span>
      </div>
      <div className="calscroll"><div className="calgrid">
        {WEEKDAYS.map((w) => <div key={w} className="wd">{w}</div>)}
        {cells.map(cell)}
      </div></div>
      <div className="callegend muted">
        <span>Cover: the day a book was finished</span><span>Line: the days it was read, ending at its cover</span>
        <span>Flag: a day entry</span><span>Each book has its own color</span>
      </div>
      <div className="bcard">
        <span className="lbl2">Pages read per day</span>
        <div className="calbars">
          {Array.from({ length: n }, (_, i) => i + 1).map((d) => {
            const v = data.pages[iso(d)] ?? 0;
            return (
              <div key={d} className="barcol" title={v ? `${v} pages` : undefined}>
                <div className="bar" style={{ height: v ? `${Math.max(2, (v / maxPages) * 84)}px` : 2, background: v ? color : 'var(--line)' }} />
                <span>{String(d).padStart(2, '0')}</span>
              </div>
            );
          })}
        </div>
        <span className="muted small">Uses the positions you log in the day log, and otherwise spreads a book's pages evenly from its start date to its finish date.</span>
      </div>
    </div>
  );
}

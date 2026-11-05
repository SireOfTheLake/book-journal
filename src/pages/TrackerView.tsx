import { useEffect, useState } from 'react';
import { COUNT_LABELS, countIndex, daysInMonth, DEFAULT_BOUNDS, RANGE_COLORS, rangeIndex, rangeLabels } from '../domain/tracker';
import type { Tracker } from '../repo/tracker';

const LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
export type TrackerKind = 'pages' | 'books';
const pad = (n: number) => String(n).padStart(2, '0');

// One bullet-journal tracker: a column for each month and a row for each day, a legend beside it. A slash marks a day a book was finished.
export default function TrackerView({ tracker, kind, editable, onBounds, onDay }: { tracker: Tracker; kind: TrackerKind; editable?: boolean; onBounds?(b: number[] | null): void; onDay?(date: string): void }) {
  const { year, days, bounds } = tracker;
  const labels = kind === 'pages' ? rangeLabels(bounds) : COUNT_LABELS;
  const level = (month: number, day: number) => {
    const d = days.get(`${year}-${pad(month)}-${pad(day)}`);
    if (!d) return -1;
    return kind === 'pages' ? rangeIndex(d.pages, d.read, bounds) : countIndex(d.finished);
  };
  const finished = (month: number, day: number) => (days.get(`${year}-${pad(month)}-${pad(day)}`)?.finished ?? 0) > 0;
  return (
    <div className="trk" data-kind={kind}>
      <div className="trk-legend" role="group" aria-label="Legend">
        <b>{kind === 'pages' ? 'PAGES READ…' : 'BOOKS FINISHED…'}</b>
        <span className="trk-key"><i className="trk-sw" />= none</span>
        {labels.map((l, i) => <span key={l} className="trk-key"><i className="trk-sw" style={{ background: RANGE_COLORS[i] }} />= {l}</span>)}
        {kind === 'pages' && <span className="trk-key"><i className="trk-sw trk-slash" />= finished a book</span>}
        <span className="trk-note">{kind === 'pages' ? 'A day with no page count shows as the first color.' : 'A square for each day a book was finished.'}</span>
        {editable && kind === 'pages' && <RangeEditor bounds={bounds} custom={tracker.custom} onSave={onBounds!} />}
        <span className="trk-sum">{kind === 'pages' ? `${tracker.readDays} days read · ${tracker.pages.toLocaleString()} pages` : `${tracker.finished} books finished`}</span>
      </div>
      <div className="trk-grid" role="img" aria-label={`${kind === 'pages' ? 'Pages read' : 'Books finished'} each day of ${year}`}>
        <span />
        {LETTERS.map((l, i) => <span key={i} className="trk-head">{l}</span>)}
        {Array.from({ length: 31 }, (_, di) => di + 1).map((day) => (
          <div className="trk-row" key={day}>
            <span className="trk-day">{day}</span>
            {Array.from({ length: 12 }, (_, mi) => mi + 1).map((m) => {
              const off = day > daysInMonth(year, m);
              const lv = off ? -1 : level(m, day);
              const date = `${year}-${pad(m)}-${pad(day)}`;
              const go = !off && onDay ? { role: 'link', tabIndex: 0, 'aria-label': `Open ${date} in the calendar`, onClick: () => onDay(date), onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onDay(date); } } } : {};
              return <span key={m} className={`trk-cell${off ? ' off' : ''}${kind === 'pages' && !off && finished(m, day) ? ' fin' : ''}${go.role ? ' go' : ''}`} data-level={off ? 'off' : lv}
                style={lv >= 0 ? { background: RANGE_COLORS[lv] } : undefined}
                title={off ? undefined : date} {...go} />;
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function RangeEditor({ bounds, custom, onSave }: { bounds: number[]; custom: boolean; onSave(b: number[] | null): void }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(bounds.map(String));
  useEffect(() => setV(bounds.map(String)), [bounds]);
  const nums = v.map((x) => Math.round(Number(x)));
  const ok = nums.every((x, i) => Number.isFinite(x) && x >= 1 && (i === 0 || x > nums[i - 1]));
  if (!open) return <button type="button" className="mini noprint" onClick={() => setOpen(true)}>Edit ranges</button>;
  return (
    <div className="trk-edit noprint">
      <span className="muted small">Top of each range (the last one has no top):</span>
      <div className="trk-edit-row">{v.map((x, i) => <input key={i} className="field num" type="number" min={1} aria-label={`Range ${i + 1} ends at`} value={x} onChange={(e) => setV(v.map((y, j) => (j === i ? e.target.value : y)))} />)}</div>
      {!ok && <span className="muted small" role="alert">Each number must be bigger than the one before.</span>}
      <div className="trk-edit-row">
        <button type="button" className="mini" disabled={!ok} onClick={() => { onSave(nums); setOpen(false); }}>Save</button>
        <button type="button" className="mini" onClick={() => { onSave(null); setOpen(false); }}>{custom ? 'Pick from my reading again' : 'Keep picking from my reading'}</button>
        <button type="button" className="mini" onClick={() => { setV(DEFAULT_BOUNDS.map(String)); }}>Use 10 / 25 / 50 / 100</button>
        <button type="button" className="mini" onClick={() => setOpen(false)}>Close</button>
      </div>
    </div>
  );
}

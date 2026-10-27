import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { monthColor, monthOf } from '../domain/months';
import type { JournalYear, ListRow } from '../repo/journal';
import type { Status } from '../repo/bookLog';
import { Icon } from './bookLog/parts';

export interface ListActions {
  addBook(title: string, status: Status): Promise<void> | void;
  start(bookId: string): void;
  finish(readId: string): void;
}

const FORMAT_NAME = { audio: 'Audio', ebook: 'Ebook', physical: 'Physical' } as const;
const ADD_STATUS: { value: Status; label: string }[] = [
  { value: 'up_next', label: 'Up Next' }, { value: 'tbr', label: 'TBR' }, { value: 'reading', label: 'In Progress' }, { value: 'finished', label: 'Read' },
];

const Dash = () => <span className="muted">—</span>;

function Rating({ stored }: { stored: number | null }) {
  if (stored === null) return <Dash />;
  return <span className="mini-rating"><svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><polygon fill="#d6a35e" points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26" /></svg>{stored / 4}</span>;
}

function Characters({ names }: { names: string | null }) {
  if (!names) return <Dash />;
  const list = names.split(', ');
  return <span>{list.slice(0, 3).join(', ')}{list.length > 3 ? <span className="muted"> +{list.length - 3}</span> : null}</span>;
}

function Row({ r, kind, act }: { r: ListRow; kind: 'finished' | 'reading' | 'upnext'; act: ListActions }) {
  return (
    <div className="lrow">
      <Link className="l ttl" to={`/book/${r.book_id}${r.read_id ? `/${r.read_id}` : ''}`}>{r.title}</Link>
      <span>{r.authors ?? <Dash />}</span>
      <span className="muted">{kind === 'finished' ? r.finish_date : kind === 'reading' ? (r.status === 'on_hold' ? 'Paused' : r.start_date ? `Started ${r.start_date}` : 'In progress') : '—'}</span>
      <span className="fmt">{r.format ? <><Icon name={r.format} />{FORMAT_NAME[r.format]}</> : <Dash />}</span>
      <span>{r.narrators ?? <Dash />}</span>
      <span>{r.series ?? <Dash />}</span>
      <Characters names={r.characters} />
      <span className="last">
        {kind === 'upnext' && <button type="button" className="mini" onClick={() => act.start(r.book_id)}>Start</button>}
        {kind === 'reading' && r.read_id && <button type="button" className="mini" onClick={() => act.finish(r.read_id!)}>Finish</button>}
        {kind === 'finished' && <Rating stored={r.rating} />}
      </span>
    </div>
  );
}

const HEAD = ['Title', 'Authors', 'Date', 'Format', 'Narrators', 'Series', 'Characters', 'Rating'];

export default function BookListView({ data, year, act }: { data: JournalYear; year: number; act: ListActions }) {
  const [query, setQuery] = useState('');
  const [month, setMonth] = useState('');
  const [format, setFormat] = useState('');
  const [newestFirst, setNewestFirst] = useState(true);
  const [grouped, setGrouped] = useState(true);
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<Status>('up_next');
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLInputElement>(null);

  const q = query.trim().toLowerCase();
  const match = (r: ListRow) => (!q || [r.title, r.authors, r.series, r.narrators, r.characters].some((x) => x?.toLowerCase().includes(q))) && (!format || r.format === format);
  const finished = useMemo(() => {
    const rows = data.finished.filter((r) => match(r) && (!month || r.finish_date?.startsWith(month)));
    return newestFirst ? rows : [...rows].reverse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.finished, q, month, format, newestFirst]);
  const months = useMemo(() => [...new Set(data.finished.map((r) => r.finish_date!.slice(0, 7)))].sort().reverse(), [data.finished]);
  const groups = useMemo(() => {
    const out: { key: string; label: string; month: number; rows: ListRow[] }[] = [];
    for (const r of finished) {
      const m = monthOf(r.finish_date!);
      const g = out.find((x) => x.key === m.key);
      if (g) g.rows.push(r); else out.push({ key: m.key, label: m.label, month: m.month, rows: [r] });
    }
    return out;
  }, [finished]);
  const reading = data.reading.filter(match);
  const upNext = data.upNext.filter(match);

  async function add() {
    if (!title.trim() || busy) return;
    setBusy(true);
    try { await act.addBook(title, status); setTitle(''); } finally { setBusy(false); box.current?.focus(); }
  }

  return (
    <div className="booklist">
      <div className="bltools">
        <input className="field search2" placeholder="Search this list" aria-label="Search this list" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select aria-label="Month" value={month} onChange={(e) => setMonth(e.target.value)}>
          <option value="">All months</option>
          {months.map((m) => <option key={m} value={m}>{monthOf(`${m}-01`).label}</option>)}
        </select>
        <select aria-label="Format" value={format} onChange={(e) => setFormat(e.target.value)}>
          <option value="">Any format</option><option value="audio">Audio</option><option value="ebook">Ebook</option><option value="physical">Physical</option>
        </select>
        <button type="button" className="mini" onClick={() => setNewestFirst(!newestFirst)}>{newestFirst ? 'Newest first' : 'Oldest first'}</button>
        <label className="inline"><input type="checkbox" role="switch" className="toggle" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} /><span className="muted">Group by month</span></label>
        <span className="grow" />
        <span className="muted">{data.finished.length} finished in {year}</span>
      </div>

      <div className="ltable">
        <div className="lrow lhead">{HEAD.map((h) => <span key={h}>{h}</span>)}</div>

        <div className="addrow">
          <input ref={box} className="field grow" placeholder="+ Add a book: type a title and press Enter" aria-label="Add a book" value={title}
            onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
          <select aria-label="Add as" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
            {ADD_STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <button type="button" className="mini" disabled={busy} onClick={add}>Add</button>
        </div>

        {reading.length > 0 && (
          <>
            <div className="lgroup" style={{ borderLeftColor: 'var(--accent)' }}><b>Reading now</b><span className="muted">{reading.length}</span></div>
            {reading.map((r) => <Row key={r.read_id} r={r} kind="reading" act={act} />)}
          </>
        )}
        <div className="lgroup" style={{ borderLeftColor: 'var(--accent)' }}><b>Up next</b><span className="muted">{upNext.length ? `${upNext.length} added, not started yet` : 'Nothing queued. Add a book above and choose Up Next.'}</span></div>
        {upNext.map((r) => <Row key={r.book_id} r={r} kind="upnext" act={act} />)}

        {grouped ? groups.map((g) => (
          <div key={g.key}>
            <div className="lgroup" style={{ borderLeftColor: monthColor(g.month) }}><b>{g.label}</b><span className="muted">{g.rows.length} {g.rows.length === 1 ? 'book' : 'books'}</span></div>
            {g.rows.map((r) => <Row key={r.read_id} r={r} kind="finished" act={act} />)}
          </div>
        )) : finished.map((r) => <Row key={r.read_id} r={r} kind="finished" act={act} />)}
        {finished.length === 0 && <div className="lrow"><span className="muted">{data.finished.length ? 'No finished books match these filters.' : `No finished books in ${year} yet.`}</span></div>}
      </div>
    </div>
  );
}

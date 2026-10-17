import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BOOK_COLORS } from '../../domain/colors';
import type { LedgerRow, Mark, SeriesStatus } from '../../repo/series';

const STATUS_LABEL: Record<SeriesStatus, string> = { finished: 'Finished', caught_up: 'Caught up', in_progress: 'In progress', on_hold: 'Paused', dnf: 'Did not finish', not_started: 'Not started' };
const pos = (p: number | null) => (p === null ? '' : String(p));

export function MarkView({ m, color }: { m: Mark; color: string }) {
  const label = { read: 'Read', dnf: 'Did not finish', unread: 'Added, not read', unreleased: 'Unreleased', missing: 'Not added yet' }[m.state];
  const title = m.position !== null ? `Book ${m.position}: ${label}` : label;
  const inner = (() => {
    switch (m.state) {
      case 'read': return <span className="mk" style={{ background: color, borderColor: color, color: '#1c1714' }} title={title}>X</span>;
      case 'dnf': return <span className="mk" style={{ borderColor: '#d4574a', color: '#d4574a' }} title={title}>D</span>;
      case 'unreleased': return <span className="mk" style={{ borderColor: '#d6a35e', color: '#d6a35e', borderStyle: 'dashed' }} title={title}>{pos(m.position)}</span>;
      case 'missing': return <span className="mk" style={{ borderColor: 'var(--muted)', color: 'var(--muted)', borderStyle: 'dashed' }} title={title}>{pos(m.position) || '?'}</span>;
      default: return <span className="mk" style={{ borderColor: color, color: 'var(--text)' }} title={title}>{pos(m.position)}</span>;
    }
  })();
  return m.bookId ? <Link to={`/book/${m.bookId}`} className="mklink">{inner}</Link> : inner;
}

export default function LedgerView({ rows, onCreate }: { rows: LedgerRow[]; onCreate(title: string): void | Promise<void> }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [pub, setPub] = useState('');
  const [caughtUp, setCaughtUp] = useState(false);
  const [title, setTitle] = useState('');

  const q = query.trim().toLowerCase();
  const shown = rows.filter((r) => (!q || r.title.toLowerCase().includes(q) || r.universe?.toLowerCase().includes(q))
    && (!status || r.status === status) && (!pub || r.publication_status === pub) && (!caughtUp || r.status === 'caught_up'));
  const add = async () => { if (title.trim()) { await onCreate(title); setTitle(''); } };

  return (
    <div className="ledger">
      <div className="bltools">
        <input className="field search2" placeholder="Find a series" aria-label="Find a series" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select aria-label="Reading status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Any reading status</option>
          {(Object.keys(STATUS_LABEL) as SeriesStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <select aria-label="Publication" value={pub} onChange={(e) => setPub(e.target.value)}>
          <option value="">Any publication status</option><option value="complete">Marked finished</option><option value="incomplete">Not marked finished</option>
        </select>
        <button type="button" className={`mini ${caughtUp ? 'activebtn' : ''}`} aria-pressed={caughtUp} onClick={() => setCaughtUp(!caughtUp)}>Caught up, not finished</button>
        <span className="grow" />
        <span className="muted">{shown.length} of {rows.length} series</span>
      </div>
      <div className="addrow card-ish">
        <input className="field grow" placeholder="+ New series: type a title and press Enter" aria-label="New series" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button type="button" className="mini" onClick={add}>Add</button>
      </div>
      <div className="ltable">
        <div className="srow shead"><span>Series</span><span>Books (position shown in each circle)</span><span>Read</span><span>Status</span></div>
        {shown.map((r, i) => {
          const color = BOOK_COLORS[i % BOOK_COLORS.length];
          return (
            <div key={r.id} className="srow" style={{ background: r.status === 'finished' ? `${color}26` : undefined }}>
              <span><Link className="l ttl" to={`/series/${r.id}`}>{r.title}</Link>{r.universe && r.universe_id && <span className="muted small"> · <Link className="l inlinelink" to={`/universes/${r.universe_id}`}>{r.universe}</Link></span>}</span>
              <div className="ms">{r.marks.length ? r.marks.map((m, k) => <MarkView key={k} m={m} color={color} />) : <span className="muted">No books yet</span>}</div>
              <span className="muted">{`${r.read} of ${r.total}`}{r.allBooks !== r.total && <span className="small block">{`${r.allBooks} books`}</span>}</span>
              <span><span className={`schip ${r.status}`}>{r.status === 'caught_up' && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></svg>}{STATUS_LABEL[r.status]}</span></span>
            </div>
          );
        })}
        {shown.length === 0 && <div className="srow"><span className="muted">{rows.length ? 'No series match these filters.' : 'No series yet. Add one above, or import your books.'}</span></div>}
      </div>
      <div className="callegend muted">
        <span>X: read</span><span>Number: added, not read yet</span><span>Dashed gold: unreleased</span><span>D: did not finish</span><span>Dashed grey: not added yet</span>
        <span>Caught up: every known book is read, but the series is not marked finished. Only series marked finished are tinted.</span>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { countdown, FMT_LABEL, FMTS, monthTitle, type Fmt } from '../domain/releases';
import type { FormatDate, ReleaseBook } from '../repo/releases';
import { EditText } from './bookLog/parts';

export interface ReleasesActions {
  setDate(bookId: string, format: Fmt, value: string | 'tba' | null): void;
  add(title: string, authors: string[], dates: Partial<Record<Fmt, string | 'tba'>>): Promise<void>;
}
type Scope = 'all' | 'series' | 'shelf';
const SCOPES: { value: Scope; label: string }[] = [{ value: 'all', label: 'Everything' }, { value: 'series', label: 'In a series' }, { value: 'shelf', label: 'On TBR / Up Next' }];
const COVER_COLORS = ['#5a1f3a', '#2f3a5a', '#3a2f5a', '#4a2f3a', '#2d4a3a', '#5a3a1f'];
const hue = (t: string) => COVER_COLORS[[...t].reduce((n, c) => n + c.charCodeAt(0), 0) % COVER_COLORS.length];
const nice = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function Cell({ book, format, today, editing, act }: { book: ReleaseBook; format: Fmt; today: string; editing: boolean; act: ReleasesActions }) {
  const f: FormatDate | undefined = book.formats[format];
  const label = FMT_LABEL[format];
  if (editing) {
    return (
      <div className="relcell"><span className="lbl2">{label}</span>
        <EditText label={`${label} release date for ${book.title}`} addLabel="Add date" type="date" value={f?.date ?? null} display={f?.date ? nice(f.date) : undefined} onCommit={(v) => act.setDate(book.id, format, v || null)} />
        {f?.status === 'tba' ? <button type="button" className="mini" onClick={() => act.setDate(book.id, format, null)}>TBA ×</button> : !f?.date && <button type="button" className="mini" aria-label={`Mark ${label} TBA for ${book.title}`} onClick={() => act.setDate(book.id, format, 'tba')}>TBA</button>}
      </div>
    );
  }
  let body: React.ReactNode = <span className="muted">&mdash;</span>;
  if (f?.status === 'tba') body = <span>TBA</span>;
  else if (f?.status === 'dated' && f.date) body = f.date >= today ? <><b>{nice(f.date)}</b><span className="muted small">{countdown(today, f.date)}</span></> : <><span className="muted">Out</span><span className="muted small">{nice(f.date)}</span></>;
  return <div className="relcell"><span className="lbl2">{label}</span>{body}</div>;
}

function Row({ b, cover, today, editing, act }: { b: ReleaseBook; cover: string | undefined; today: string; editing: boolean; act: ReleasesActions }) {
  return (
    <li className="relrow2">
      <Link to={`/book/${b.id}`} aria-label={`Open ${b.title}`} className="shelfthumb">
        {cover ? <img className="libimg" src={cover} alt="" /> : <div className="libgen" style={{ background: hue(b.title) }}><span className="ttl">{b.title.toUpperCase()}</span></div>}
      </Link>
      <div className="shelfinfo">
        <Link className="l" to={`/book/${b.id}`}>{b.title}</Link>
        <span className="muted small">{b.authors ?? 'No author'}</span>
        <span className="small">{b.series && <>{b.series_id ? <Link className="l inline" to={`/series/${b.series_id}`}>{b.series}</Link> : b.series}{b.position !== null ? ` #${b.position}` : ''}</>}</span>
        <span className="chips">
          {b.shelf && <span className="chip">{b.shelf === 'up_next' ? 'Up Next' : 'TBR'}</span>}
          {b.read && <span className="chip muted">You have read it</span>}
        </span>
      </div>
      {FMTS.map((f) => <Cell key={f} book={b} format={f} today={today} editing={editing} act={act} />)}
    </li>
  );
}

function AddForm({ act, onDone }: { act: ReleasesActions; onDone(): void }) {
  const [title, setTitle] = useState('');
  const [authors, setAuthors] = useState('');
  const [dates, setDates] = useState<Record<Fmt, string>>({ ebook: '', physical: '', audio: '' });
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    const parsed: Partial<Record<Fmt, string | 'tba'>> = {};
    for (const f of FMTS) { const v = dates[f].trim(); if (v) parsed[f] = v.toLowerCase() === 'tba' ? 'tba' : v; }
    try { await act.add(title, authors.split(',').map((a) => a.trim()).filter(Boolean), parsed); onDone(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  return (
    <div className="bcard newchal">
      <span className="lbl2">A book you are waiting for (goes on your TBR)</span>
      <input className="field big" aria-label="Title" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <input className="field" aria-label="Authors" placeholder="Authors, separated by commas" value={authors} onChange={(e) => setAuthors(e.target.value)} />
      <div className="relform">
        {FMTS.map((f) => <label key={f} className="stack"><span className="lbl2">{FMT_LABEL[f]} release</span>
          <input className="field" aria-label={`${FMT_LABEL[f]} release`} placeholder="YYYY-MM-DD or TBA" value={dates[f]} onChange={(e) => setDates({ ...dates, [f]: e.target.value })} /></label>)}
      </div>
      {error && <div className="muted" role="alert">{error}</div>}
      <div className="actions"><button type="button" className="btn" onClick={onDone}>Cancel</button><span className="grow" /><button type="button" className="btn on" onClick={submit}>Add book</button></div>
    </div>
  );
}

export default function ReleasesView({ upcoming, justReleased, covers, today, act }: { upcoming: ReleaseBook[]; justReleased: ReleaseBook[]; covers: Record<string, string>; today: string; act: ReleasesActions }) {
  const [scope, setScope] = useState<Scope>('all');
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const keep = (b: ReleaseBook) => scope === 'all' || (scope === 'series' ? !!b.series_id : !!b.shelf);
  const list = upcoming.filter(keep);
  const groups: { title: string; books: ReleaseBook[] }[] = [];
  for (const b of list) {
    const title = b.next ? monthTitle(b.next) : 'Date to be announced';
    const g = groups.find((x) => x.title === title);
    if (g) g.books.push(b); else groups.push({ title, books: [b] });
  }
  const recent = justReleased.filter(keep);
  return (
    <div className="relpage">
      <div className="toolbar">
        <div className="seg" role="group" aria-label="Show">
          {SCOPES.map((s) => <button key={s.value} type="button" className={scope === s.value ? 'on' : ''} aria-pressed={scope === s.value} onClick={() => setScope(s.value)}>{s.label}</button>)}
        </div>
        <span className="grow" />
        <button type="button" className={`btn${editing ? ' on' : ''}`} aria-pressed={editing} onClick={() => setEditing((e) => !e)}>{editing ? 'Done editing dates' : 'Edit dates'}</button>
        {!adding && <button type="button" className="btn" onClick={() => setAdding(true)}>+ Add a book</button>}
      </div>
      {adding && <AddForm act={act} onDone={() => setAdding(false)} />}
      {recent.length > 0 && (
        <section className="bcard" aria-label="Just released">
          <h2 className="gname-sm">Just released <span className="muted small">in the last 30 days, not started</span></h2>
          <ul className="rellist">{recent.map((b) => <Row key={b.id} b={b} cover={covers[b.id]} today={today} editing={editing} act={act} />)}</ul>
        </section>
      )}
      {groups.map((g) => (
        <section key={g.title} className="bcard" aria-label={g.title}>
          <h2 className="gname-sm">{g.title} <span className="muted small">{g.books.length}</span></h2>
          <ul className="rellist">{g.books.map((b) => <Row key={b.id} b={b} cover={covers[b.id]} today={today} editing={editing} act={act} />)}</ul>
        </section>
      ))}
      {groups.length === 0 && <p className="muted">{upcoming.length ? 'Nothing matches that.' : 'No upcoming releases yet. Add a release date on a series page or a book, or use Add a book.'}</p>}
    </div>
  );
}

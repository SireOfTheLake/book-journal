import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Move, Shelf, ShelfBook } from '../repo/shelf';

export interface ShelfActions {
  start(bookId: string): void;
  move(bookId: string, move: Move): void;
  toShelf(bookId: string, shelf: Shelf): void;
  remove(bookId: string): void;
  add(title: string, authors: string[], shelf: Shelf): Promise<void>;
}

type SortKey = 'priority' | 'title' | 'series' | 'author' | 'added';
const SORTS: { value: SortKey; label: string }[] = [
  { value: 'priority', label: 'My order' }, { value: 'title', label: 'Title' }, { value: 'series', label: 'Series' }, { value: 'author', label: 'Author' }, { value: 'added', label: 'Newest added' },
];
const PAGE = 40;
const COVER_COLORS = ['#5a1f3a', '#2f3a5a', '#3a2f5a', '#4a2f3a', '#2d4a3a', '#5a3a1f'];
const hue = (t: string) => COVER_COLORS[[...t].reduce((n, c) => n + c.charCodeAt(0), 0) % COVER_COLORS.length];
const lc = (s: string | null) => (s ?? '').toLowerCase();

function sortBooks(list: ShelfBook[], sort: SortKey): ShelfBook[] {
  if (sort === 'priority') return list;
  const by = (f: (b: ShelfBook) => string | number) => [...list].sort((a, b) => { const x = f(a), y = f(b); return x < y ? -1 : x > y ? 1 : 0; });
  if (sort === 'title') return by((b) => lc(b.title));
  if (sort === 'author') return by((b) => `${lc(b.authors)}|${lc(b.series)}|${String(b.position ?? 999).padStart(5, '0')}|${lc(b.title)}`);
  if (sort === 'series') return by((b) => `${b.series ? '0' : '1'}${lc(b.series)}|${String(b.position ?? 999).padStart(5, '0')}|${lc(b.title)}`);
  return [...list].sort((a, b) => (a.added < b.added ? 1 : a.added > b.added ? -1 : 0));
}

function Thumb({ b, src }: { b: ShelfBook; src: string | undefined }) {
  return (
    <div className="shelfthumb" aria-hidden="true">
      {src ? <img className="libimg" src={src} alt="" /> : <div className="libgen" style={{ background: hue(b.title) }}><span className="ttl">{b.title.toUpperCase()}</span></div>}
    </div>
  );
}

function releaseText(r: string): string {
  if (r === 'tba') return 'Release date TBA';
  return `Releases ${new Date(`${r}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

function Row({ b, cover, index, count, ordered, act }: { b: ShelfBook; cover: string | undefined; index: number; count: number; ordered: boolean; act: ShelfActions }) {
  const [confirming, setConfirming] = useState(false);
  const other: Shelf = b.shelf === 'up_next' ? 'tbr' : 'up_next';
  return (
    <li className="shelfrow">
      <Link to={`/book/${b.id}`} aria-label={`Open ${b.title}`}><Thumb b={b} src={cover} /></Link>
      <div className="shelfinfo">
        <Link className="l" to={`/book/${b.id}`}>{b.title}</Link>
        <span className="muted small">{b.authors ?? 'No author'}</span>
        <span className="small">
          {b.series && <>{b.series_id ? <Link className="l inline" to={`/series/${b.series_id}`}>{b.series}</Link> : b.series}{b.position !== null ? ` #${b.position}` : ''}</>}
          {b.page_count ? <span className="muted">{`${b.series ? ' · ' : ''}${b.page_count} pages`}</span> : null}
        </span>
        <span className="chips">
          {b.series_state === 'next' && <span className="chip">Next in series</span>}
          {b.series_state === 'waiting' && <span className="chip muted">Earlier books unread</span>}
          {b.release && <span className="chip">{releaseText(b.release)}</span>}
          {!b.release && b.released && <span className="chip fav" title="Its release date has passed">{`Out now · ${new Date(`${b.released}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}</span>}
        </span>
      </div>
      <div className="shelfacts">
        <button type="button" className="mini on" aria-label={`Start ${b.title}`} disabled={!!b.release} title={b.release ? 'Not released yet' : undefined} onClick={() => act.start(b.id)}>Start</button>
        {ordered && (
          <span className="movebtns">
            <button type="button" className="mini" aria-label={`Move ${b.title} to the top`} disabled={index === 0} onClick={() => act.move(b.id, 'top')}>Top</button>
            <button type="button" className="mini" aria-label={`Move ${b.title} up`} disabled={index === 0} onClick={() => act.move(b.id, 'up')}>&#9650;</button>
            <button type="button" className="mini" aria-label={`Move ${b.title} down`} disabled={index === count - 1} onClick={() => act.move(b.id, 'down')}>&#9660;</button>
          </span>
        )}
        <button type="button" className="mini" aria-label={`Move ${b.title} to ${other === 'up_next' ? 'Up Next' : 'TBR'}`} onClick={() => act.toShelf(b.id, other)}>{other === 'up_next' ? 'To Up Next' : 'To TBR'}</button>
        {confirming ? (
          <span className="movebtns">
            <button type="button" className="mini danger" aria-label={`Confirm removing ${b.title} from the shelf`} onClick={() => act.remove(b.id)}>Remove it</button>
            <button type="button" className="mini" onClick={() => setConfirming(false)}>Keep</button>
          </span>
        ) : <button type="button" className="mini" aria-label={`Remove ${b.title} from the shelf`} onClick={() => setConfirming(true)}>Remove</button>}
      </div>
    </li>
  );
}

function Section({ title, hint, books, covers, requestCovers, ordered, act, empty }: { title: string; hint: string; books: ShelfBook[]; covers: Record<string, string>; requestCovers(ids: string[]): void; ordered: boolean; act: ShelfActions; empty: string }) {
  const [shown, setShown] = useState(PAGE);
  const visible = books.slice(0, shown);
  const need = visible.filter((b) => b.has_cover === 1 && !covers[b.id]).map((b) => b.id);
  const needKey = need.join(',');
  useEffect(() => { if (need.length) requestCovers(need); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [needKey]);
  return (
    <section className="bcard shelfsection" aria-label={title}>
      <span className="lbl2">{`${title} (${books.length})`}</span>
      <span className="muted small">{hint}</span>
      {books.length === 0 ? <p className="muted">{empty}</p> : (
        <ol className="shelflist">{visible.map((b, i) => <Row key={b.id} b={b} cover={covers[b.id]} index={i} count={books.length} ordered={ordered} act={act} />)}</ol>
      )}
      {books.length > shown && <button type="button" className="btn" onClick={() => setShown(shown + PAGE)}>{`Show ${Math.min(PAGE, books.length - shown)} more`}</button>}
    </section>
  );
}

export default function ShelfView({ books, covers, requestCovers, act }: { books: ShelfBook[]; covers: Record<string, string>; requestCovers(ids: string[]): void; act: ShelfActions }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('priority');
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [addTo, setAddTo] = useState<Shelf>('tbr');
  const [busy, setBusy] = useState(false);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => (q ? books.filter((b) => `${b.title} ${b.authors ?? ''} ${b.series ?? ''}`.toLowerCase().includes(q)) : books), [books, q]);
  const upNext = useMemo(() => sortBooks(filtered.filter((b) => b.shelf === 'up_next'), sort), [filtered, sort]);
  const tbr = useMemo(() => sortBooks(filtered.filter((b) => b.shelf === 'tbr'), sort), [filtered, sort]);
  // The arrows only make sense when the list is in your own order and nothing is hidden by the search.
  const ordered = sort === 'priority' && !q;

  async function add() {
    if (!title.trim() || busy) return;
    setBusy(true);
    try { await act.add(title, author.split(',').map((a) => a.trim()).filter(Boolean), addTo); setTitle(''); setAuthor(''); } finally { setBusy(false); }
  }

  return (
    <div className="shelfpage">
      <div className="bltools">
        <input className="field search2" placeholder="Search title, author, or series" aria-label="Search the shelves" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select aria-label="Sort by" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>{SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
      </div>
      <div className="bcard shelfadd">
        <span className="lbl2">Add a book</span>
        <div className="bltools">
          <input className="field" placeholder="Title" aria-label="New book title" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
          <input className="field" placeholder="Authors (commas)" aria-label="New book authors" value={author} onChange={(e) => setAuthor(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
          <div className="seg" role="group" aria-label="Add to">
            {(['tbr', 'up_next'] as const).map((s) => <button type="button" key={s} aria-pressed={addTo === s} className={addTo === s ? 'on' : ''} onClick={() => setAddTo(s)}>{s === 'tbr' ? 'TBR' : 'Up Next'}</button>)}
          </div>
          <button type="button" className="btn on" disabled={busy || !title.trim()} onClick={add}>Add</button>
        </div>
      </div>
      <Section title="Up Next" hint="The books you plan to read soon, in the order you will read them." books={upNext} covers={covers} requestCovers={requestCovers} ordered={ordered} act={act} empty={q ? 'No matches.' : 'Nothing is queued. Move a book here with To Up Next.'} />
      <Section title="TBR" hint="Everything else you want to read, in your priority order." books={tbr} covers={covers} requestCovers={requestCovers} ordered={ordered} act={act} empty={q ? 'No matches.' : 'Your TBR is empty.'} />
    </div>
  );
}

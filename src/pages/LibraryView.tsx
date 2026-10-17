import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { filterLibrary, sortLibrary, STATUS_LABEL, type SortKey, type StatusFilter, type TagMode } from '../domain/library';
import type { TagOption } from '../repo/search';
import type { LibraryBook } from '../repo/library';
import type { Status } from '../repo/bookLog';
import { StarRow } from './bookLog/parts';

export interface LibraryActions { addBook(title: string, status: Status): Promise<void> | void }

const SORTS: { value: SortKey; label: string }[] = [
  { value: 'title', label: 'Title A to Z' }, { value: 'author', label: 'Author A to Z' }, { value: 'finished', label: 'Recently finished' },
  { value: 'added', label: 'Recently added' }, { value: 'rating', label: 'Highest rated' },
];
const ADD_STATUS: { value: Status; label: string }[] = [
  { value: 'tbr', label: 'TBR' }, { value: 'up_next', label: 'Up Next' }, { value: 'reading', label: 'In Progress' }, { value: 'finished', label: 'Read' },
];
const COVER_COLORS = ['#5a1f3a', '#2f3a5a', '#3a2f5a', '#4a2f3a', '#2d4a3a', '#5a3a1f'];
const hue = (title: string) => COVER_COLORS[[...title].reduce((n, c) => n + c.charCodeAt(0), 0) % COVER_COLORS.length];
const bookLink = (b: LibraryBook) => `/book/${b.id}${b.read_id ? `/${b.read_id}` : ''}`;
const stars = (b: LibraryBook) => (b.rating === null ? null : Math.round(b.rating * 4) / 4);

function Cover({ b, src }: { b: LibraryBook; src?: string }) {
  return src
    ? <img className="libimg" src={src} alt="" />
    : <div className="libgen" style={{ background: hue(b.title) }} aria-hidden="true"><span className="by">{(b.authors ?? '').split(', ')[0].toUpperCase()}</span><span className="ttl">{b.title.toUpperCase()}</span></div>;
}

const Badge = ({ b }: { b: LibraryBook }) => <span className={`libstatus st-${b.status ?? 'none'}`}>{STATUS_LABEL[b.status ?? 'none']}</span>;

export default function LibraryView({ books, covers, requestCovers, act, pageSize = 60, tagOptions = [], bookTags = {}, initialTags = [], initialQuery = '' }: { books: LibraryBook[]; covers: Record<string, string>; requestCovers: (ids: string[]) => void; act: LibraryActions; pageSize?: number; tagOptions?: TagOption[]; bookTags?: Record<string, string[]>; initialTags?: string[]; initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [tags, setTags] = useState<string[]>(initialTags);
  const [tagMode, setTagMode] = useState<TagMode>('all');
  const [tagPanel, setTagPanel] = useState(initialTags.length > 0);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<SortKey>('title');
  const [favorites, setFavorites] = useState(false);
  const [noCover, setNoCover] = useState(false);
  const [mode, setMode] = useState<'grid' | 'list'>('grid');
  const [shown, setShown] = useState(pageSize);
  const [title, setTitle] = useState('');
  const [addStatus, setAddStatus] = useState<Status>('tbr');
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLInputElement>(null);

  const list = useMemo(() => sortLibrary(filterLibrary(books, { query, status, favorites, noCover, tags, tagMode, bookTags }), sort), [books, query, status, favorites, noCover, sort, tags, tagMode, bookTags]);
  const visible = list.slice(0, shown);
  const missing = books.filter((b) => b.has_cover === 0).length;

  // Whenever the filters or sort change, start again from the first page.
  useEffect(() => setShown(pageSize), [query, status, favorites, noCover, sort, pageSize, tags, tagMode]);
  // Covers are big, so only the ones on screen are loaded.
  const need = visible.filter((b) => b.has_cover === 1 && !covers[b.id]).map((b) => b.id);
  const needKey = need.join(',');
  useEffect(() => { if (need.length) requestCovers(need); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [needKey]);

  async function add() {
    if (!title.trim() || busy) return;
    setBusy(true);
    try { await act.addBook(title, addStatus); setTitle(''); } finally { setBusy(false); box.current?.focus(); }
  }

  return (
    <div className="library">
      {missing > 0 && (
        <div className="notice libbanner" role="note">
          <span>{`${missing} ${missing === 1 ? 'book has' : 'books have'} no cover yet.`}</span>
          <Link className="btn" to="/import?tab=covers">Find covers</Link>
        </div>
      )}
      <div className="bltools">
        <input className="field search2" placeholder="Search title, author, series, narrator, or character" aria-label="Search the library" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
          <option value="all">Any status</option>
          {(['finished', 'reading', 'on_hold', 'dnf', 'up_next', 'tbr', 'none'] as const).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <select aria-label="Sort by" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>{SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
        <button type="button" className={`mini ${favorites ? 'activebtn' : ''}`} aria-pressed={favorites} onClick={() => setFavorites(!favorites)}>Favorites</button>
        <button type="button" className={`mini ${noCover ? 'activebtn' : ''}`} aria-pressed={noCover} onClick={() => setNoCover(!noCover)}>No cover</button>
        <button type="button" className={`mini ${tags.length ? 'activebtn' : ''}`} aria-expanded={tagPanel} onClick={() => setTagPanel(!tagPanel)}>{tags.length ? `Tags (${tags.length})` : 'Tags'}</button>
        <span className="grow" />
        <div className="seg" role="group" aria-label="View">
          <button type="button" aria-pressed={mode === 'grid'} className={mode === 'grid' ? 'on' : ''} onClick={() => setMode('grid')}>Covers</button>
          <button type="button" aria-pressed={mode === 'list'} className={mode === 'list' ? 'on' : ''} onClick={() => setMode('list')}>List</button>
        </div>
        <span className="muted">{`${list.length} of ${books.length} books`}</span>
      </div>
      {tagPanel && (
        <div className="bcard tagpanel" aria-label="Filter by tags">
          <div className="bltools">
            <span className="lbl2">Show books with</span>
            <div className="seg" role="group" aria-label="Match">
              <button type="button" aria-pressed={tagMode === 'all'} className={tagMode === 'all' ? 'on' : ''} onClick={() => setTagMode('all')}>All of these</button>
              <button type="button" aria-pressed={tagMode === 'any'} className={tagMode === 'any' ? 'on' : ''} onClick={() => setTagMode('any')}>Any of these</button>
            </div>
            {tags.length > 0 && <button type="button" className="mini" onClick={() => setTags([])}>Clear tags</button>}
          </div>
          {tagOptions.length === 0 && <p className="muted">No genres, tropes or themes are on any book yet.</p>}
          {(['genre', 'trope', 'theme'] as const).map((k) => {
            const opts = tagOptions.filter((o) => o.kind === k);
            return opts.length ? (
              <div key={k} className="tagrow"><span className="lbl2">{k === 'genre' ? 'Genres' : k === 'trope' ? 'Tropes' : 'Themes'}</span>
                <div className="chips">{opts.map((o) => { const key = `${k}:${o.id}`; const on = tags.includes(key); return (
                  <button type="button" key={key} className={`chip ${on ? 'on' : ''}`} aria-pressed={on} style={o.color ? { borderColor: o.color } : undefined}
                    onClick={() => setTags(on ? tags.filter((t) => t !== key) : [...tags, key])}>{o.name} <span className="muted small">{o.count}</span></button>); })}</div>
              </div>) : null;
          })}
        </div>
      )}
      <div className="addrow card-ish">
        <input ref={box} className="field grow" placeholder="+ Add a book: type a title and press Enter" aria-label="Add a book" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <select aria-label="Add as" value={addStatus} onChange={(e) => setAddStatus(e.target.value as Status)}>{ADD_STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
        <button type="button" className="mini" disabled={busy} onClick={add}>Add</button>
      </div>

      {mode === 'grid' ? (
        <div className="libgrid">
          {visible.map((b) => (
            <Link key={b.id} className="libcard" to={bookLink(b)} aria-label={`${b.title}${b.authors ? ` by ${b.authors}` : ''}`}>
              <div className="libcover"><Cover b={b} src={covers[b.id]} /><Badge b={b} />{b.is_favorite === 1 && <span className="libfav" title="Favorite" aria-label="Favorite">&#9829;</span>}</div>
              <b className="libtitle">{b.title}</b>
              <span className="muted small">{b.authors ?? 'No author'}</span>
              {b.series && <span className="libseries">{`${b.series}${b.position !== null ? ` #${b.position}` : ''}`}</span>}
              {stars(b) !== null && <StarRow value={stars(b)} size={13} />}
            </Link>
          ))}
        </div>
      ) : (
        <div className="ltable">
          <div className="librow lhead"><span /><span>Title</span><span>Authors</span><span>Series</span><span>Status</span><span>Finished</span><span>Rating</span></div>
          {visible.map((b) => (
            <Link key={b.id} className="librow" to={bookLink(b)}>
              <span className="libthumb"><Cover b={b} src={covers[b.id]} /></span>
              <b>{b.title}</b>
              <span>{b.authors ?? <span className="muted">—</span>}</span>
              <span>{b.series ? `${b.series}${b.position !== null ? ` #${b.position}` : ''}` : <span className="muted">—</span>}</span>
              <span><Badge b={b} /></span>
              <span className="muted">{b.finish_date ?? '—'}</span>
              <span>{stars(b) !== null ? <StarRow value={stars(b)} size={13} /> : <span className="muted">—</span>}</span>
            </Link>
          ))}
        </div>
      )}

      {list.length === 0 && <p className="muted">{books.length === 0 ? 'Your library is empty. Add a book above, or import your books.' : 'No books match these filters.'}</p>}
      {list.length > shown && <button type="button" className="btn" onClick={() => setShown(shown + pageSize)}>{`Show ${Math.min(pageSize, list.length - shown)} more (${list.length - shown} left)`}</button>}
    </div>
  );
}

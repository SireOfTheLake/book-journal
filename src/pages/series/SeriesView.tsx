import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Item, Status } from '../../repo/bookLog';
import type { Release, SeriesBook, SeriesPage } from '../../repo/series';
import { Card, Combo, EditNotes, EditSelect, EditText, Icon, StarRow, TagEditor } from '../bookLog/parts';

export interface SeriesLists { universes: Item[]; genres: Item[]; books: (Item & { authors: string | null })[]; authors: Item[] }
export interface SeriesActions {
  update(f: Record<string, string | number | null>): void;
  createUniverse(name: string): void;
  addGenre(name: string): void;
  removeGenre(id: string): void;
  renameGenre(id: string, name: string): void;
  addBook(title: string): Promise<void> | void;
  setRelease(bookId: string, format: Release['format'], value: string | 'tba' | null): void;
  markReleased(bookId: string): void;
  addAuthor(authorId: string): void;
  createAuthor(name: string): void;
  removeAuthor(authorId: string): void;
  addExistingBook(bookId: string, position: number | null): void;
  setBookStatus(bookId: string, readId: string | null, status: Status): void;
  setPosition(bookId: string, position: number | null): void;
}

const STATUS_OPTIONS: { value: Status; label: string }[] = [
  { value: 'tbr', label: 'TBR' }, { value: 'up_next', label: 'Up Next' }, { value: 'reading', label: 'In Progress' },
  { value: 'finished', label: 'Read' }, { value: 'on_hold', label: 'Paused' }, { value: 'dnf', label: 'DNF' },
];

const STATUS_TEXT = { finished: 'Finished', caught_up: 'Caught up', in_progress: 'In progress', on_hold: 'Paused', dnf: 'Did not finish', not_started: 'Not started' } as const;
const FORMATS: Release['format'][] = ['ebook', 'physical', 'audio'];
const COVER = ['#5a1f3a', '#2f3a5a', '#3a2f5a', '#4a2f3a', '#2d4a3a', '#5a3a1f'];

function Releases({ book, act, onDone }: { book: SeriesBook; act: SeriesActions; onDone?(): void }) {
  return (
    <div className="releases">
      <span className="lbl2">Releases</span>
      {FORMATS.map((f) => {
        const r = book.releases.find((x) => x.format === f);
        return (
          <div className="relrow" key={f}>
            <span className="muted">{f === 'ebook' ? 'Ebook' : f === 'audio' ? 'Audio' : 'Physical'}</span>
            <EditText label={`${f} release date`} addLabel="Add date" type="date" value={r?.release_date ?? null} display={r?.release_date} onCommit={(v) => act.setRelease(book.id, f, v || null)} />
            {r?.status === 'tba' ? <button type="button" className="mini" onClick={() => act.setRelease(book.id, f, null)}>TBA ×</button> : !r?.release_date && <button type="button" className="mini" onClick={() => act.setRelease(book.id, f, 'tba')}>TBA</button>}
          </div>
        );
      })}
      {book.shelf && <button type="button" className="mini" onClick={() => { act.markReleased(book.id); onDone?.(); }}>Already released</button>}
    </div>
  );
}

// The circle on a cover: click it to change where this book sits in the series. Leave it empty for "not set"; 5.5 makes a novella.
// How much text the circle has to hold: 1-2 characters are "whole", longer decimals step the text size down.
const posSize = (p: number | null) => { const n = String(p ?? '?').length; return n <= 2 ? 'a' : n === 3 ? 'b' : n === 4 ? 'c' : n === 5 ? 'd' : 'e'; };

function PositionEditor({ book, act }: { book: SeriesBook; act: SeriesActions }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState('');
  const start = () => { setV(book.position === null ? '' : String(book.position)); setEditing(true); };
  const finish = (save: boolean) => {
    setEditing(false);
    if (!save) return;
    const t = v.trim();
    const n = t === '' ? null : Number(t);
    if (n !== null && (!Number.isFinite(n) || n < 0)) return;
    if (n !== book.position) act.setPosition(book.id, n);
  };
  if (editing) {
    return <input className="field posinput" type="number" step="0.5" min="0" autoFocus aria-label="Series position" value={v} onChange={(e) => setV(e.target.value)}
      onBlur={() => finish(true)} onKeyDown={(e) => { if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); }} />;
  }
  return <button type="button" className="pos" data-len={posSize(book.position)} aria-label={book.position === null ? `Set series position of ${book.title}` : `Change series position of ${book.title}, now ${book.position}`} title="Change series position" onClick={start}>{book.position ?? '?'}</button>;
}

function BookCard({ b, act }: { b: SeriesBook; act: SeriesActions }) {
  const [dating, setDating] = useState(false);
  const unreleased = b.state === 'unreleased';
  const stateText = b.state === 'read' ? `Finished ${b.finish_date ?? ''}` : b.state === 'dnf' ? 'Did not finish' : unreleased ? 'Unreleased' : b.shelf === 'up_next' ? 'Up next' : b.shelf === 'tbr' ? 'TBR' : 'Not started';
  const h = [...b.title].reduce((n, c) => n + c.charCodeAt(0), 0);
  return (
    <div className="bookcard">
      <div className={`scover ${unreleased ? 'dashed' : ''}`} style={b.cover ? { backgroundImage: `url("${b.cover}")`, backgroundSize: 'cover', backgroundPosition: 'center' } : { background: unreleased ? 'var(--panel)' : COVER[h % COVER.length] }}>
        <PositionEditor book={b} act={act} />
        {b.position !== null && !Number.isInteger(b.position) && <span className="novella">NOVELLA</span>}
        {!b.cover && <span className="by">{(b.authors ?? '').split(', ')[0].toUpperCase()}</span>}
        {!b.cover && <span className="ttl">{b.title.toUpperCase()}</span>}
        <span />
      </div>
      <Link className="l ttl2" to={`/book/${b.id}${b.read_id ? `/${b.read_id}` : ''}`}>{b.title}</Link>
      <EditSelect label="Status" addLabel="Set status" value={b.status} options={STATUS_OPTIONS} onChange={(v) => v && act.setBookStatus(b.id, b.read_id, v as Status)} />
      <span className="muted">{unreleased ? <b className="gold">Unreleased</b> : stateText}{b.format && b.state === 'read' ? <span className="fmt"> · <Icon name={b.format} /></span> : null}</span>
      {b.rating !== null ? <span className="inline"><StarRow value={b.rating} /><span className="muted">{b.rating}</span></span> : <span className="muted">Unrated</span>}
      {b.tropes && <div className="chips">{b.tropes.split(', ').map((t) => <span key={t} className="chip tiny" style={{ borderColor: 'var(--trope)' }}>{t}</span>)}</div>}
      {(unreleased || b.releases.length > 0 || dating) && <Releases book={b} act={act} onDone={() => setDating(false)} />}
      {b.shelf && !unreleased && b.releases.length === 0 && !dating && <button type="button" className="mini" onClick={() => setDating(true)}>Add release date</button>}
    </div>
  );
}

// The series' own authors. Click an x to remove one, or search to add one (or create a new author).
function SeriesAuthors({ page, lists, act }: { page: SeriesPage; lists: SeriesLists; act: SeriesActions }) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="stack"><span className="lbl2">Authors</span>
      <div className="chips">
        {page.authors.map((a) => (
          <span key={a.id} className="chip" style={{ borderColor: 'var(--line2)' }}>
            <Link className="l" to={`/authors/${a.id}`}>{a.name}</Link>
            <button type="button" className="x" aria-label={`Remove ${a.name}`} onClick={() => act.removeAuthor(a.id)}>&times;</button>
          </span>
        ))}
      </div>
      {adding ? (
        <Combo autoFocus label="Search authors" placeholder="Search for an author" onClose={() => setAdding(false)}
          options={lists.authors.filter((x) => !page.authors.some((y) => y.id === x.id)).map((x) => ({ key: x.id, label: x.name }))}
          onPick={act.addAuthor} onCreate={act.createAuthor} createLabel={(t) => `+ Add "${t}" as a new author`} />
      ) : <button type="button" className="ed add" onClick={() => setAdding(true)}>{page.authors.length ? 'Add another author' : 'Add author'}</button>}
    </div>
  );
}

function ExistingBook({ lists, act }: { lists: SeriesLists; act: SeriesActions }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState('');
  if (!open) return <button type="button" className="mini addchar" onClick={() => setOpen(true)}>+ Add a book you already have</button>;
  return (
    <div className="addrel">
      <input className="field" type="number" step="0.5" placeholder="Position (0.5 for a novella)" aria-label="Position in the series" value={position} onChange={(e) => setPosition(e.target.value)} />
      <Combo autoFocus label="Search your books" placeholder="Search your books by title" onClose={() => setOpen(false)} options={lists.books.map((b) => ({ key: b.id, label: b.name, sub: b.authors }))}
        onPick={(id) => { act.addExistingBook(id, position.trim() === '' ? null : Number(position)); setPosition(''); }} />
    </div>
  );
}

export default function SeriesView({ page, lists, act }: { page: SeriesPage; lists: SeriesLists; act: SeriesActions }) {
  const { series } = page;
  const [title, setTitle] = useState('');
  const add = async () => { if (title.trim()) { await act.addBook(title); setTitle(''); } };
  return (
    <div className="seriespage">
      <div className="sphead">
        <EditText label="Series title" className="seriestitle" value={series.title} onCommit={(v) => v.trim() && act.update({ title: v.trim() })} />
        <span className="grow" />
        <button type="button" className="btn" aria-pressed={series.is_favorite === 1} onClick={() => act.update({ is_favorite: series.is_favorite ? 0 : 1 })}>{series.is_favorite ? 'Favorite' : 'Mark as favorite'}</button>
      </div>

      <div className="bcard">
        <div className="spgrid">
          <SeriesAuthors page={page} lists={lists} act={act} />
          <div className="stack"><span className="lbl2">Universe</span>
            <EditSelect label="Universe" addLabel="Add universe" value={page.universe?.id ?? null} options={lists.universes.map((u) => ({ value: u.id, label: u.name }))} onChange={(id) => act.update({ universe_id: id })} onCreate={act.createUniverse} /></div>
          <div className="stack"><span className="lbl2">Books read</span><span className="big">{`${page.read} of ${page.total}`}</span>
            <span className="muted small">{`${page.allBooks} ${page.allBooks === 1 ? 'book' : 'books'} in total${page.novellas ? `, including ${page.novellas} ${page.novellas === 1 ? 'novella' : 'novellas'}` : ''}`}</span>
            <span className="inline"><span className="muted small">Numbered books</span><EditText label="Total books in the series" addLabel="Set total" type="number" value={series.total_books} onCommit={(v) => act.update({ total_books: v === '' ? null : Number(v) })} /></span></div>
          <div className="stack"><span className="lbl2">Average rating</span>
            {page.avgStars !== null ? <span className="inline"><StarRow value={Math.round(page.avgStars * 4) / 4} size={20} /><span className="muted">{(Math.round(page.avgStars * 100) / 100).toString()} · {page.ratedBooks} rated</span></span> : <span className="muted">No ratings yet</span>}</div>
          <label className="stack"><span className="lbl2">Interconnected standalones</span>
            <span className="inline"><input type="checkbox" checked={series.interconnected_standalones === 1} onChange={(e) => act.update({ interconnected_standalones: e.target.checked ? 1 : 0 })} aria-label="Interconnected standalones" /><span className="muted">{series.interconnected_standalones ? 'Yes' : 'No'}</span></span></label>
        </div>
        <div className="spgrid divider">
          <div className="stack"><span className="lbl2">Publication status</span>
            <button type="button" className={`schip ${series.publication_status === 'complete' ? 'finished' : 'caught_up'} btnchip`} onClick={() => act.update({ publication_status: series.publication_status === 'complete' ? 'incomplete' : 'complete' })}>
              {series.publication_status === 'complete' ? 'Finished (all books out)' : 'Not marked finished'}</button>
            <span className="muted small">Click to change. Adding a book to a finished series reopens it.</span></div>
          <div className="stack"><span className="lbl2">Reading status</span><span className={`schip ${page.status}`}>{STATUS_TEXT[page.status]}</span>
            <EditSelect label="Reading status" addLabel="Set it yourself" value={series.reading_status_override} options={[{ value: 'completed', label: 'Completed' }, { value: 'in_progress', label: 'In progress' }, { value: 'on_hold', label: 'Paused' }, { value: 'dnf', label: 'Did not finish' }]} onChange={(v) => act.update({ reading_status_override: v })} /></div>
          <div className="span3"><TagEditor label="Genres" items={page.genres} options={lists.genres} onAdd={act.addGenre} onRemove={act.removeGenre} onRename={act.renameGenre} /></div>
        </div>
      </div>

      <div className="addrow card-ish">
        <input className="field grow" placeholder="+ Add a book to this series (goes on your TBR)" aria-label="Add a book to this series" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button type="button" className="mini" onClick={add}>Add book</button>
      </div>
      <ExistingBook lists={lists} act={act} />
      <div className="bookgrid">
        {page.books.map((b) => <BookCard key={b.id} b={b} act={act} />)}
        {page.books.length === 0 && <span className="muted">No books in this series yet.</span>}
      </div>
      <Card label="Series notes"><EditNotes label="Series notes" addLabel="Add series notes" value={series.notes} onCommit={(v) => act.update({ notes: v.trim() || null })} /></Card>
    </div>
  );
}

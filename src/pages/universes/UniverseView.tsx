import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BOOK_COLORS } from '../../domain/colors';
import type { Item } from '../../repo/bookLog';
import type { UniversePage } from '../../repo/universes';
import { Card, Combo, EditNotes, EditText, StarRow } from '../bookLog/parts';
import { MarkView } from '../series/LedgerView';

export interface UniverseLists { series: Item[]; books: (Item & { authors: string | null })[] }
export interface UniverseActions {
  update(f: Record<string, string | null>): void;
  addSeries(seriesId: string): void;
  removeSeries(seriesId: string): void;
  addBook(bookId: string): void;
  removeBook(bookId: string): void;
  remove(): void;
}

const STATUS_LABEL = { finished: 'Finished', caught_up: 'Caught up', in_progress: 'In progress', on_hold: 'Paused', dnf: 'Did not finish', not_started: 'Not started' } as const;
const COVER = ['#5a1f3a', '#2f3a5a', '#3a2f5a', '#4a2f3a', '#2d4a3a', '#5a3a1f'];

function Adder({ label, placeholder, options, onPick }: { label: string; placeholder: string; options: { key: string; label: string; sub?: string | null }[]; onPick(id: string): void }) {
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" className="mini addchar" onClick={() => setOpen(true)}>{label}</button>;
  return <Combo autoFocus label={label} placeholder={placeholder} options={options} onClose={() => setOpen(false)} onPick={onPick} />;
}

export default function UniverseView({ page, lists, act }: { page: UniversePage; lists: UniverseLists; act: UniverseActions }) {
  const { universe, totals } = page;
  const [confirm, setConfirm] = useState(false);
  const inSeries = new Set(page.series.map((s) => s.id));
  return (
    <div className="seriespage">
      <div className="sphead">
        <EditText label="Universe name" className="seriestitle" value={universe.name} onCommit={(v) => v.trim() && act.update({ name: v.trim() })} />
        <span className="grow" />
        {confirm ? (
          <span className="inline">
            <span className="muted small">Series and books stay; only this grouping goes.</span>
            <button type="button" className="mini" onClick={act.remove}>Delete universe</button>
            <button type="button" className="mini" onClick={() => setConfirm(false)}>Cancel</button>
          </span>
        ) : <button type="button" className="quiet" onClick={() => setConfirm(true)}>Delete this universe</button>}
      </div>

      <div className="bcard">
        <div className="spgrid">
          <div className="stack"><span className="lbl2">Books read</span><span className="big">{`${totals.read} of ${totals.books}`}</span>
            <span className="muted small">{`${page.series.length} ${page.series.length === 1 ? 'series' : 'series'}, ${page.books.length} on their own`}</span></div>
          <div className="stack"><span className="lbl2">Average rating</span>
            {totals.avgStars !== null ? <span className="inline"><StarRow value={Math.round(totals.avgStars * 4) / 4} size={20} /><span className="muted">{(Math.round(totals.avgStars * 100) / 100).toString()} · {totals.rated} rated</span></span> : <span className="muted">No ratings yet</span>}</div>
          <div className="stack span2"><span className="lbl2">Authors</span>
            <div className="chips">
              {page.authors.map((a) => <span key={a.id} className="chip" style={{ borderColor: 'var(--line2)' }}><Link className="l" to={`/authors/${a.id}`}>{a.name}</Link><span className="muted small"> {a.books}</span></span>)}
              {page.authors.length === 0 && <span className="muted">None yet</span>}
            </div></div>
        </div>
      </div>

      <h2 className="lbl2 sect">Series</h2>
      <div className="ltable">
        <div className="srow shead"><span>Series</span><span>Books (position shown in each circle)</span><span>Read</span><span>Status</span></div>
        {page.series.map((r, i) => {
          const color = BOOK_COLORS[i % BOOK_COLORS.length];
          return (
            <div key={r.id} className="srow">
              <span><Link className="l ttl" to={`/series/${r.id}`}>{r.title}</Link> <button type="button" className="quiet" aria-label={`Take ${r.title} out of this universe`} onClick={() => act.removeSeries(r.id)}>remove</button></span>
              <div className="ms">{r.marks.length ? r.marks.map((m, k) => <MarkView key={k} m={m} color={color} />) : <span className="muted">No books yet</span>}</div>
              <span className="muted">{`${r.read} of ${r.total}`}</span>
              <span><span className={`schip ${r.status}`}>{STATUS_LABEL[r.status]}</span></span>
            </div>
          );
        })}
        {page.series.length === 0 && <div className="srow"><span className="muted">No series in this universe yet.</span></div>}
      </div>
      <Adder label="+ Add a series" placeholder="Search your series" options={lists.series.filter((s) => !inSeries.has(s.id)).map((s) => ({ key: s.id, label: s.name }))} onPick={act.addSeries} />

      <h2 className="lbl2 sect">Books on their own</h2>
      <p className="muted small">Standalones, or single books from a larger shared series, placed in this universe without the rest of their series.</p>
      <div className="bookgrid">
        {page.books.map((b) => {
          const h = [...b.title].reduce((n, c) => n + c.charCodeAt(0), 0);
          return (
            <div className="bookcard" key={b.id}>
              <div className="scover" style={b.cover ? { backgroundImage: `url("${b.cover}")`, backgroundSize: 'cover', backgroundPosition: 'center' } : { background: COVER[h % COVER.length] }}>
                <span />{!b.cover && <span className="by">{(b.authors ?? '').split(', ')[0].toUpperCase()}</span>}{!b.cover && <span className="ttl">{b.title.toUpperCase()}</span>}<span />
              </div>
              <Link className="l ttl2" to={`/book/${b.id}`}>{b.title}</Link>
              {b.series && <span className="muted small">{`${b.series}${b.position !== null ? ` #${b.position}` : ''}`}</span>}
              <span className="muted">{b.read ? 'Read' : 'Not read yet'}</span>
              {b.rating !== null ? <span className="inline"><StarRow value={b.rating} /><span className="muted">{b.rating}</span></span> : <span className="muted">Unrated</span>}
              <button type="button" className="quiet" aria-label={`Take ${b.title} out of this universe`} onClick={() => act.removeBook(b.id)}>remove</button>
            </div>
          );
        })}
        {page.books.length === 0 && <span className="muted">None.</span>}
      </div>
      <Adder label="+ Add a single book" placeholder="Search your books by title" options={lists.books.map((b) => ({ key: b.id, label: b.name, sub: b.authors }))} onPick={act.addBook} />

      <Card label="Universe notes"><EditNotes label="Universe notes" addLabel="Add universe notes" value={universe.notes} onCommit={(v) => act.update({ notes: v.trim() || null })} /></Card>
    </div>
  );
}

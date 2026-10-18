import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDuration, parseDuration } from '../../domain/format';
import type { Quote, QuoteInput } from '../../repo/quotes';
import { Card } from './parts';

export interface QuoteActions { add(i: QuoteInput): Promise<void>; update(id: string, i: QuoteInput): Promise<void>; favorite(id: string, fav: boolean): void; remove(id: string): void }

export const quotePlace = (q: { page: number | null; audio_seconds: number | null }) => [q.page !== null ? `p. ${q.page}` : null, q.audio_seconds !== null ? formatDuration(q.audio_seconds) : null].filter(Boolean).join(' · ');

// Add or edit one quote: the passage, where it is (page and/or audio time), and a note of your own.
export function QuoteForm({ initial, onSave, onCancel }: { initial?: Quote; onSave(i: QuoteInput): Promise<void>; onCancel(): void }) {
  const [text, setText] = useState(initial?.text ?? '');
  const [page, setPage] = useState(initial?.page?.toString() ?? '');
  const [time, setTime] = useState(initial?.audio_seconds != null ? formatDuration(initial.audio_seconds) : '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    const pageN = page.trim() ? Number(page) : null;
    const secs = time.trim() ? parseDuration(time) : null;
    if (pageN !== null && (!Number.isInteger(pageN) || pageN < 0)) { setError('The page must be a whole number.'); return; }
    if (time.trim() && secs === null) { setError('Write the time like 1:23 or 1h 23m.'); return; }
    try { await onSave({ text, page: pageN, audio_seconds: secs, note }); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  return (
    <div className="quoteform">
      <textarea className="field" aria-label="Passage" placeholder="The passage" value={text} onChange={(e) => setText(e.target.value)} autoFocus />
      <div className="inline">
        <input className="field small" type="number" min="0" aria-label="Page" placeholder="Page" value={page} onChange={(e) => setPage(e.target.value)} />
        <input className="field small" aria-label="Audio time" placeholder="Audio time (1:23)" value={time} onChange={(e) => setTime(e.target.value)} />
      </div>
      <input className="field" aria-label="Quote note" placeholder="Why it stuck with you (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      {error && <span className="notice" role="alert">{error}</span>}
      <div className="inline"><button type="button" className="btn on" onClick={save}>Save</button><button type="button" className="btn" onClick={onCancel}>Cancel</button></div>
    </div>
  );
}

export function QuoteItem({ q, act, title }: { q: Quote; act: QuoteActions; title?: { text: string; to: string } }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  if (editing) return <li className="quoteitem"><QuoteForm initial={q} onSave={async (i) => { await act.update(q.id, i); setEditing(false); }} onCancel={() => setEditing(false)} /></li>;
  const place = quotePlace(q);
  return (
    <li className={`quoteitem${q.is_favorite ? ' fav' : ''}`}>
      <span className="quotetext">{q.text}</span>
      {q.note && <span className="muted small">{q.note}</span>}
      <span className="small inline">
        {title && <Link className="l" to={title.to}>{title.text}</Link>}
        {place && <span className="muted">{place}</span>}
        <span className="grow" />
        <button type="button" className="mini" aria-pressed={q.is_favorite === 1} aria-label={q.is_favorite ? 'Remove from favorites' : 'Mark as a favorite passage'} onClick={() => act.favorite(q.id, !q.is_favorite)}>{q.is_favorite ? '★ Favorite' : '☆ Favorite'}</button>
        <button type="button" className="mini" onClick={() => setEditing(true)} aria-label="Edit quote">Edit</button>
        {confirming
          ? <><button type="button" className="mini danger" aria-label="Confirm deleting this quote" onClick={() => act.remove(q.id)}>Delete it</button><button type="button" className="mini" onClick={() => setConfirming(false)}>Keep</button></>
          : <button type="button" className="mini" aria-label="Delete quote" onClick={() => setConfirming(true)}>Delete</button>}
      </span>
    </li>
  );
}

export default function QuotesCard({ quotes, act }: { quotes: Quote[]; act: QuoteActions }) {
  const [adding, setAdding] = useState(false);
  return (
    <Card label="Quotes and favorite passages" className="span4">
      {quotes.length === 0 && !adding && <span className="muted">No quotes saved for this book yet.</span>}
      {quotes.length > 0 && <ul className="quotelist">{quotes.map((q) => <QuoteItem key={q.id} q={q} act={act} />)}</ul>}
      {adding ? <QuoteForm onSave={async (i) => { await act.add(i); setAdding(false); }} onCancel={() => setAdding(false)} />
        : <button type="button" className="btn" onClick={() => setAdding(true)}>+ Add a quote</button>}
    </Card>
  );
}

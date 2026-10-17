import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDb } from '../db/DbContext';
import { quickAdd, type Status } from '../repo/bookLog';

const CHOICES: { value: Status; label: string }[] = [
  { value: 'tbr', label: 'TBR' }, { value: 'up_next', label: 'Up Next' }, { value: 'reading', label: 'In Progress' },
];

// The "+ New book" dialog: a title is enough. Enter adds the book and opens its Book Log.
export default function QuickAdd({ onClose, initialTitle = '' }: { onClose: () => void; initialTitle?: string }) {
  const db = useDb();
  const nav = useNavigate();
  const [title, setTitle] = useState(initialTitle);
  const [authors, setAuthors] = useState('');
  const [status, setStatus] = useState<Status>('up_next');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => box.current?.focus(), []);

  async function submit() {
    if (!title.trim()) { setError('Type a title first.'); return; }
    setBusy(true); setError(null);
    try {
      const r = await quickAdd(db, { title, authors: authors.split(',').map((a) => a.trim()).filter(Boolean), status });
      onClose();
      nav(`/book/${r.bookId}${r.readId ? `/${r.readId}` : ''}`);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setBusy(false); }
  }

  return (
    <div className="overlay" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label="New book">
        <h2 className="pagetitle small2">NEW BOOK</h2>
        <label className="stack"><span className="lbl2">Title</span>
          <input ref={box} className="field big" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        </label>
        <label className="stack"><span className="lbl2">Authors (separate with commas)</span>
          <input className="field" value={authors} onChange={(e) => setAuthors(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        </label>
        <div className="stack"><span className="lbl2">Status</span>
          <div className="seg" role="group" aria-label="Status">
            {CHOICES.map((c) => <button type="button" key={c.value} aria-pressed={status === c.value} className={status === c.value ? 'on' : ''} onClick={() => setStatus(c.value)}>{c.label}</button>)}
          </div>
        </div>
        {error && <div className="muted" role="alert">{error}</div>}
        <div className="actions"><button type="button" className="btn" onClick={onClose}>Cancel</button><span className="grow" />
          <button type="button" className="btn on" disabled={busy} onClick={submit}>Add book</button></div>
      </div>
    </div>
  );
}

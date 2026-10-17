import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDb } from '../db/DbContext';
import { createSeries, listSeriesOptions } from '../repo/series';

// The "New series" quick add: a name is enough. The author and number of books can be filled in later.
export default function QuickSeries({ onClose }: { onClose: () => void }) {
  const db = useDb();
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [authors, setAuthors] = useState('');
  const [count, setCount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => box.current?.focus(), []);

  async function submit() {
    setError(null); setExisting(null);
    if (!name.trim()) { setError('Type the series name first.'); return; }
    const total = count.trim() === '' ? null : Number(count);
    if (total !== null && (!Number.isInteger(total) || total < 1)) { setError('The number of books must be a whole number, or left blank.'); return; }
    setBusy(true);
    try {
      const found = (await listSeriesOptions(db)).find((s) => s.name.toLowerCase() === name.trim().toLowerCase());
      if (found) { setExisting(found.id); setError('You already have a series with that name.'); setBusy(false); return; }
      const id = await createSeries(db, name, { authors: authors.split(',').map((a) => a.trim()).filter(Boolean), totalBooks: total });
      onClose();
      nav(`/series/${id}`);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setBusy(false); }
  }

  return (
    <div className="overlay" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label="New series">
        <h2 className="pagetitle small2">NEW SERIES</h2>
        <label className="stack"><span className="lbl2">Series name</span>
          <input ref={box} className="field big" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        </label>
        <label className="stack"><span className="lbl2">Author (separate with commas)</span>
          <input className="field" value={authors} onChange={(e) => setAuthors(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        </label>
        <label className="stack"><span className="lbl2">Number of books</span>
          <input className="field num" type="number" min="1" value={count} placeholder="Optional" onChange={(e) => setCount(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        </label>
        <span className="muted small">You can add the books, and say whether the series is finished, on its page afterward.</span>
        {error && <div className="muted" role="alert">{error}{existing && <> <button type="button" className="mini" onClick={() => { onClose(); nav(`/series/${existing}`); }}>Open it</button></>}</div>}
        <div className="actions"><button type="button" className="btn" onClick={onClose}>Cancel</button><span className="grow" />
          <button type="button" className="btn on" disabled={busy} onClick={submit}>Add series</button></div>
      </div>
    </div>
  );
}

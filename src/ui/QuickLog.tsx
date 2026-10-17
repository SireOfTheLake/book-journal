import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDb } from '../db/DbContext';
import { parseDuration } from '../domain/format';
import { listInProgressReads, saveDayEntry, type InProgressRead } from '../repo/bookLog';

// The Daily Log quick add: choose which book you are reading, and where you got to today.
export default function QuickLog({ onClose, onSaved, initialReadId }: { onClose: () => void; onSaved: () => void; initialReadId?: string }) {
  const db = useDb();
  const nav = useNavigate();
  const [reads, setReads] = useState<InProgressRead[] | null>(null);
  const [readId, setReadId] = useState('');
  const [date, setDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [page, setPage] = useState('');
  const [pct, setPct] = useState('');
  const [time, setTime] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const first = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    listInProgressReads(db).then((r) => { setReads(r); if (initialReadId && r.some((x) => x.read_id === initialReadId)) setReadId(initialReadId); else if (r.length === 1) setReadId(r[0].read_id); }, (e) => setError(String(e)));
  }, [db, initialReadId]);
  useEffect(() => { first.current?.focus(); }, [reads]);

  const num = (s: string) => (s.trim() && !Number.isNaN(Number(s)) ? Number(s) : null);
  async function save(open: boolean) {
    setError(null);
    if (!readId) { setError('Choose which book this is for.'); return; }
    if (!date) { setError('Choose a date.'); return; }
    if (time.trim() && parseDuration(time) === null) { setError('Type the time as 1:23 or 1h 23m.'); return; }
    try {
      await saveDayEntry(db, readId, { date, page: num(page), percent: num(pct), seconds: time.trim() ? parseDuration(time) : null, text: note });
      const book = reads!.find((r) => r.read_id === readId)!;
      onSaved(); onClose();
      if (open) nav(`/book/${book.book_id}/${readId}`);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  return (
    <div className="overlay" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Daily log">
        <h2 className="pagetitle small2">DAILY LOG</h2>
        {reads === null ? <p className="muted">Loading...</p> : reads.length === 0 ? (
          <p className="muted">No books are in progress. Set a book's status to In Progress, then log where you got to.</p>
        ) : (
          <>
            <label className="stack"><span className="lbl2">Book</span>
              <select ref={first} className="field" aria-label="Book" value={readId} onChange={(e) => setReadId(e.target.value)}>
                {reads.length > 1 && <option value="">Choose a book you are reading</option>}
                {reads.map((r) => <option key={r.read_id} value={r.read_id}>{r.title}{r.authors ? ` (${r.authors})` : ''}</option>)}
              </select>
            </label>
            <div className="stack"><span className="lbl2">Date</span>
              <input className="field" type="date" value={date} aria-label="Entry date" max={new Date().toLocaleDateString('en-CA')} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="stack"><span className="lbl2">Where you got to (any one, or none)</span>
              <span className="inline">
                <input className="field num" placeholder="Page" aria-label="Page reached" value={page} onChange={(e) => setPage(e.target.value)} />
                <input className="field num" placeholder="%" aria-label="Percent reached" value={pct} onChange={(e) => setPct(e.target.value)} />
                <input className="field num" placeholder="1:23" aria-label="Time reached" value={time} onChange={(e) => setTime(e.target.value)} />
              </span></div>
            <label className="stack"><span className="lbl2">Note</span>
              <input className="field" value={note} aria-label="Entry note" onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save(false)} /></label>
          </>
        )}
        {error && <div className="muted" role="alert">{error}</div>}
        <div className="actions"><button type="button" className="btn" onClick={onClose}>Cancel</button><span className="grow" />
          {reads && reads.length > 0 && <><button type="button" className="btn" onClick={() => save(true)}>Save and open the book</button><button type="button" className="btn on" onClick={() => save(false)}>Save entry</button></>}</div>
      </div>
    </div>
  );
}

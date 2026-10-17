import { useEffect, useState } from 'react';
import type { MergeCandidate } from '../../repo/bookMerge';
import { Combo } from './parts';

export interface BookMenuActions {
  deleteBook?(): void;
  mergeCandidates?(): Promise<{ similar: MergeCandidate[]; all: MergeCandidate[] }>;
  startMerge?(otherId: string): void;
}

// The "..." button at the top right of a book's page: merge another book into this one, or delete this book.
export default function BookMenu({ title, act }: { title: string; act: BookMenuActions }) {
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<'merge' | 'delete' | null>(null);
  if (!act.deleteBook && !act.mergeCandidates) return null;
  return (
    <div className="charmenu bookmenu">
      <button type="button" className="mini menubtn" aria-label="Book menu" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>&#8943;</button>
      {open && (
        <div className="menupop" role="menu">
          {act.mergeCandidates && <button type="button" role="menuitem" onClick={() => { setOpen(false); setDialog('merge'); }}>Merge with another book...</button>}
          {act.deleteBook && <button type="button" role="menuitem" onClick={() => { setOpen(false); setDialog('delete'); }}>Delete this book...</button>}
        </div>
      )}
      {dialog === 'delete' && (
        <div className="overlay" onKeyDown={(e) => e.key === 'Escape' && setDialog(null)}>
          <div className="dialog" role="dialog" aria-label="Delete this book">
            <h2 className="pagetitle small2">Delete this book?</h2>
            <span className="muted">This removes <b>{title}</b> and all of its reads, ratings, notes, daily logs and challenge picks. Authors, series and characters stay.</span>
            <div className="actions"><button type="button" className="btn" onClick={() => setDialog(null)}>Keep it</button><span className="grow" />
              <button type="button" className="btn on" onClick={() => { setDialog(null); act.deleteBook?.(); }}>Delete the book</button></div>
          </div>
        </div>
      )}
      {dialog === 'merge' && act.mergeCandidates && act.startMerge && <MergePicker title={title} load={act.mergeCandidates} onPick={act.startMerge} onClose={() => setDialog(null)} />}
    </div>
  );
}

function MergePicker({ title, load, onPick, onClose }: { title: string; load: NonNullable<BookMenuActions['mergeCandidates']>; onPick(id: string): void; onClose(): void }) {
  const [data, setData] = useState<{ similar: MergeCandidate[]; all: MergeCandidate[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { load().then(setData, (e) => setError(e instanceof Error ? e.message : String(e))); }, [load]);
  const line = (c: MergeCandidate) => `${c.authors ? `${c.authors} · ` : ''}${c.reads} read${c.reads === 1 ? '' : 's'}`;
  return (
    <div className="overlay" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="dialog pickdlg" role="dialog" aria-label="Merge with another book">
        <h2 className="pagetitle small2">Merge with another book</h2>
        <span className="muted">Pick the other copy of <b>{title}</b>. You will review every difference before anything changes.</span>
        {error && <div className="muted" role="alert">{error}</div>}
        {!data && !error && <span className="muted">Looking for similar titles...</span>}
        {data && (
          <>
            <span className="lbl2">Books with the same or a similar title</span>
            {data.similar.length === 0 ? <span className="muted small">No other book has a similar title. You can search for one below.</span> : (
              <ul className="pickist">
                {data.similar.map((c) => (
                  <li key={c.id}><button type="button" className="pickrow" aria-label={`Merge with ${c.title}`} onClick={() => onPick(c.id)}>
                    <span className="pt">{c.title}</span><span className="muted small">{line(c)}</span>
                    <span className="small"><span className={`chip${c.same ? ' on' : ''}`}>{c.same ? 'Same title' : 'Similar title'}</span></span>
                  </button></li>
                ))}
              </ul>
            )}
            <div className="pickrow"><span className="lbl2">Or search all books</span>
              <Combo label="Search for a book" placeholder="Search by title or author" options={data.all.map((c) => ({ key: c.id, label: c.title, sub: c.authors }))} onPick={onPick} /></div>
          </>
        )}
        <div className="actions"><span className="grow" /><button type="button" className="btn" onClick={onClose}>Cancel</button></div>
      </div>
    </div>
  );
}

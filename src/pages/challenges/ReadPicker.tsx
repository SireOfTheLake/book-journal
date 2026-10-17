import { useEffect, useRef, useState } from 'react';
import type { Candidate } from '../../repo/challenges';

const STATUS: Record<string, string> = { reading: 'Reading', on_hold: 'Paused', finished: 'Finished', dnf: 'Did not finish' };

// A window for choosing which book (and which read of it) goes on a prompt. In progress books come first; type to search the rest.
export default function ReadPicker({ prompt, search, onPick, onClose }: {
  prompt: string; search(query: string): Promise<Candidate[]>; onPick(readId: string): void; onClose(): void;
}) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Candidate[] | null>(null);
  const box = useRef<HTMLInputElement>(null);
  const seq = useRef(0);
  const [active, setActive] = useState(0);
  useEffect(() => { box.current?.focus(); }, []);
  useEffect(() => {
    const n = ++seq.current;
    search(q).then((r) => { if (n === seq.current) setRows(r); }, () => { if (n === seq.current) setRows([]); });
  }, [q, search]);
  useEffect(() => { setActive(0); }, [rows]);
  useEffect(() => { document.getElementById(`pick-${active}`)?.scrollIntoView?.({ block: 'nearest' }); }, [active]);
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return; }
    const n = rows?.length ?? 0;
    if (e.key === 'ArrowDown' && n) { e.preventDefault(); setActive((a) => Math.min(n - 1, a + 1)); }
    else if (e.key === 'ArrowUp' && n) { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter' && rows?.[active] && (e.target as HTMLElement).tagName !== 'BUTTON') { e.preventDefault(); onPick(rows[active].read_id); }
  };
  return (
    <div className="overlay" onKeyDown={keys}>
      <div className="dialog pickdlg" role="dialog" aria-modal="true" aria-label="Choose a book">
        <h2 className="pagetitle small2">CHOOSE A BOOK</h2>
        <div className="muted small">For: {prompt}</div>
        <input ref={box} className="field big" placeholder="Search by title, author or series" aria-label="Search books" aria-activedescendant={rows?.length ? `pick-${active}` : undefined} value={q} onChange={(e) => setQ(e.target.value)} />
        <ul className="pickist">
          {rows === null && <li className="muted">Loading...</li>}
          {rows?.length === 0 && <li className="muted">{q ? 'No reads match that.' : 'You have no reads yet. Start a book first.'}</li>}
          {rows?.map((c, i) => (
            <li key={c.read_id}>
              <button type="button" id={`pick-${i}`} className={i === active ? 'pickrow active' : 'pickrow'} aria-current={i === active} tabIndex={-1} onMouseMove={() => setActive(i)} onClick={() => onPick(c.read_id)}>
                <span className="pt">{c.title}</span>
                <span className="muted small">{[c.authors, c.series].filter(Boolean).join(' · ') || 'No author'}</span>
                <span className="small">
                  <span className={`chip${c.status === 'reading' || c.status === 'on_hold' ? ' on' : ''}`}>{STATUS[c.status] ?? c.status}</span>
                  {c.when && <span className="muted">{` ${c.when}`}</span>}
                  {c.used_on && <span className="muted">{` · now on "${c.used_on}"`}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="actions"><span className="grow" /><button type="button" className="btn" onClick={onClose}>Cancel</button></div>
      </div>
    </div>
  );
}

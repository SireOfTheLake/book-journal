import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDb } from '../db/DbContext';
import { loadSearchIndex } from '../repo/search';
import { searchAll, searchPath, type SearchItem } from '../domain/search';

// The header search: books, series, people, universes, then genres, tropes and themes, with "+ Add new book" at the bottom.
export default function SearchBox({ onAddBook }: { onAddBook: (title: string) => void }) {
  const db = useDb();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState<SearchItem[] | null>(null);
  const [cur, setCur] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);

  async function ensureIndex() { try { setIndex(await loadSearchIndex(db)); } catch { setIndex([]); } }
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); input.current?.focus(); } };
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('keydown', key); document.addEventListener('mousedown', away);
    return () => { window.removeEventListener('keydown', key); document.removeEventListener('mousedown', away); };
  }, []);

  const groups = useMemo(() => (index ? searchAll(index, q) : []), [index, q]);
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const canAdd = q.trim().length > 0;
  const total = flat.length + (canAdd ? 1 : 0);

  function pick(i: SearchItem) { setOpen(false); setQ(''); input.current?.blur(); nav(searchPath(i)); }
  function add() { const t = q.trim(); setOpen(false); setQ(''); input.current?.blur(); onAddBook(t); }
  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { setOpen(false); input.current?.blur(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setCur((c) => Math.min(total - 1, c + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCur((c) => Math.max(0, c - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (cur < flat.length) pick(flat[cur]); else if (canAdd) add(); }
  }
  let n = -1;
  return (
    <div className="searchwrap" ref={box}>
      <input ref={input} className="search" placeholder="Search everything (Ctrl+K)" aria-label="Search" value={q} role="combobox" aria-expanded={open && canAdd} aria-controls="search-results"
        onChange={(e) => { setQ(e.target.value); setCur(0); setOpen(true); }} onFocus={() => { setOpen(true); void ensureIndex(); }} onKeyDown={onKey} />
      {open && canAdd && (
        <div className="sresults" id="search-results" role="listbox" aria-label="Search results">
          {groups.map((g) => (
            <div key={g.kind} className="sgroup">
              <div className="shead">{g.title}</div>
              {g.items.map((i) => { n += 1; const idx = n; return (
                <button type="button" role="option" aria-selected={cur === idx} key={`${i.kind}${i.id}`} className={`sitem ${cur === idx ? 'cur' : ''}`} onMouseEnter={() => setCur(idx)} onClick={() => pick(i)}>
                  <span>{i.label}</span>{i.sub ? <span className="muted ssub">{i.sub}</span> : null}
                </button>); })}
            </div>
          ))}
          {index && !flat.length && <div className="muted sempty">No matches.</div>}
          <button type="button" role="option" aria-selected={cur === flat.length} className={`sitem sadd ${cur === flat.length ? 'cur' : ''}`} onMouseEnter={() => setCur(flat.length)} onClick={add}>+ Add new book &ldquo;{q.trim()}&rdquo;</button>
        </div>
      )}
    </div>
  );
}

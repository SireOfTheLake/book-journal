import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useDb } from '../db/DbContext';
import { loadSearchIndex } from '../repo/search';
import { PREFIXES, narrowQuery, searchAll, searchPages, searchPath, type SearchItem } from '../domain/search';

const RECENT_KEY = 'bj.recentSearch';
const loadRecent = (): SearchItem[] => { try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); return Array.isArray(v) ? v.slice(0, 8) : []; } catch { return []; } };
const saveRecent = (item: SearchItem) => {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([{ kind: item.kind, id: item.id, label: item.label, sub: item.sub ?? null }, ...loadRecent().filter((r) => !(r.kind === item.kind && r.id === item.id))].slice(0, 8))); } catch { /* no storage: nothing is remembered */ }
};
const KIND_LABEL: Record<string, string> = { book: 'Book', series: 'Series', author: 'Author', narrator: 'Narrator', character: 'Character', universe: 'Universe', genre: 'Genre', trope: 'Trope', theme: 'Theme' };

type Row =
  | { t: 'item'; item: SearchItem; recent?: boolean }
  | { t: 'page'; label: string; path: string }
  | { t: 'adv'; where: 'library' | 'shelf' }
  | { t: 'add' };

// The window that opens with Ctrl+K or a click on the header search: type to find a book, series, person, tag or page, or choose Advanced search.
export default function QuickSearch({ onClose, onAddBook }: { onClose: () => void; onAddBook: (title: string) => void }) {
  const db = useDb();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [index, setIndex] = useState<SearchItem[] | null>(null);
  const [cur, setCur] = useState(0);
  const [recent] = useState(loadRecent);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); loadSearchIndex(db).then(setIndex, () => setIndex([])); }, [db]);

  const { kinds, text, prefix } = narrowQuery(q);
  const groups = useMemo(() => (index && text ? searchAll(kinds ? index.filter((i) => kinds.includes(i.kind)) : index, text, kinds ? 8 : 5) : []), [index, text, kinds]);
  const pages = useMemo(() => (kinds ? [] : searchPages(text)), [text, kinds]);
  const hasText = text.length > 0;

  // Everything that can be chosen, in the order it is drawn, so the arrow keys and Enter work on one list.
  const sections: { title: string; rows: Row[] }[] = [];
  if (hasText) {
    for (const g of groups) sections.push({ title: g.title, rows: g.items.map((item) => ({ t: 'item', item })) });
    if (pages.length) sections.push({ title: 'Pages', rows: pages.map((p) => ({ t: 'page', ...p })) });
    sections.push({ title: 'More', rows: [{ t: 'adv', where: 'library' }, { t: 'adv', where: 'shelf' }, ...(kinds ? [] : [{ t: 'add' } as Row])] });
  } else {
    if (recent.length) sections.push({ title: 'Recent', rows: recent.map((item) => ({ t: 'item', item, recent: true })) });
    sections.push({ title: 'Advanced', rows: [{ t: 'adv', where: 'library' }, { t: 'adv', where: 'shelf' }] });
  }
  const flat = sections.flatMap((s) => s.rows);

  const go = (path: string) => { onClose(); nav(path); };
  function choose(r: Row) {
    if (r.t === 'item') { saveRecent(r.item); go(searchPath(r.item)); }
    else if (r.t === 'page') go(r.path);
    else if (r.t === 'adv') go(`${r.where === 'library' ? '/library' : '/shelf'}?adv=1${text ? `&q=${encodeURIComponent(text)}` : ''}`);
    else { onClose(); onAddBook(text); }
  }
  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setCur((c) => Math.min(flat.length - 1, c + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCur((c) => Math.max(0, c - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (flat[cur]) choose(flat[cur]); }
  }
  useEffect(() => { document.querySelector('.qsrow.cur')?.scrollIntoView?.({ block: 'nearest' }); }, [cur]);

  let n = -1;
  const label = (r: Row) => r.t === 'item' ? <><span className="qskind">{KIND_LABEL[r.item.kind]}</span><span className="qslabel">{r.item.label}</span>{r.item.sub ? <span className="muted qssub">{r.item.sub}</span> : null}</>
    : r.t === 'page' ? <><span className="qskind">Page</span><span className="qslabel">{r.label}</span></>
    : r.t === 'adv' ? <><span className="qskind">Advanced</span><span className="qslabel">{`Advanced search in ${r.where === 'library' ? 'All Books' : 'TBR & Up Next'}`}{hasText ? <span className="muted">{` starting with “${text}”`}</span> : null}</span></>
    : <span className="qslabel">{`+ Add new book “${text}”`}</span>;

  return createPortal(
    <div className="overlay qsoverlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="qswin" role="dialog" aria-modal="true" aria-label="Quick search" onKeyDown={onKey}>
        <div className="qstitle">Search for books, series, people, tags or pages</div>
        <input ref={input} className="qsinput" placeholder="Where would you like to go?" aria-label="Search everything" role="combobox" aria-expanded="true" aria-controls="qs-list" value={q} onChange={(e) => { setQ(e.target.value); setCur(0); }} />
        {prefix && <div className="muted small qsnote">{`Only searching ${PREFIXES.find((p) => p.key === prefix)!.title.toLowerCase()}.`}</div>}
        <div className="qslist" id="qs-list" role="listbox">
          {sections.map((s) => (
            <div key={s.title} className="qssec">
              <div className="qshead">{s.title}</div>
              {s.rows.map((r) => { n += 1; const idx = n; return (
                <button type="button" role="option" aria-selected={cur === idx} key={`${s.title}${idx}`} className={`qsrow ${cur === idx ? 'cur' : ''}`} onMouseEnter={() => setCur(idx)} onClick={() => choose(r)}>{label(r)}</button>); })}
            </div>
          ))}
          {index && hasText && !groups.length && !pages.length && <div className="muted sempty">No matches.</div>}
          {!index && hasText && <div className="muted sempty">Searching...</div>}
        </div>
        <div className="qsfoot"><b className="qstip">Protip:</b> start searches with {PREFIXES.map((p) => <kbd key={p.key} title={p.title}>{p.key}</kbd>)} to narrow results. <span className="muted">@ people · # series · ! books · * tags</span></div>
      </div>
    </div>, document.body);
}

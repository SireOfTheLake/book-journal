import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { chipStyle } from '../../domain/colors';
import { starFills, starQuarters } from '../../domain/rating';
import type { Item } from '../../repo/bookLog';

export function Card({ label, children, className = '' }: { label?: string; children: ReactNode; className?: string }) {
  return <div className={`bcard ${className}`}>{label && <span className="lbl2">{label}</span>}{children}</div>;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const isoDay = (y: number, m: number, d: number) => `${y}-${pad2(m)}-${pad2(d)}`;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// A month grid. Moving between months never selects anything: a date is only chosen when you click a day.
export function DatePicker({ value, min, max, initial, onPick, onClear }: { value: string | null; min?: string | null; max?: string | null; initial?: string | null; onPick: (d: string) => void; onClear: () => void }) {
  const today = new Date().toLocaleDateString('en-CA');
  const start = value ?? initial ?? today;
  const [view, setView] = useState({ y: Number(start.slice(0, 4)), m: Number(start.slice(5, 7)) });
  const move = (months: number) => setView((v) => { const t = v.y * 12 + (v.m - 1) + months; return { y: Math.floor(t / 12), m: (t % 12) + 1 }; });
  const [mode, setMode] = useState<'days' | 'months' | 'years'>('days');
  const [yearBase, setYearBase] = useState(view.y - 5);
  const offset = new Date(view.y, view.m - 1, 1).getDay();
  const days = new Date(view.y, view.m, 0).getDate();
  const out = (d: string) => (!!min && d < min) || (!!max && d > max);
  const step = (dir: -1 | 1) => (mode === 'years' ? setYearBase((b) => b + 12 * dir) : mode === 'months' ? setView((v) => ({ ...v, y: v.y + dir })) : move(dir));
  const label = mode === 'years' ? 'years' : mode === 'months' ? 'year' : 'month';
  return (
    <div className="datepicker" role="dialog" aria-label="Choose a date" onMouseDown={(e) => e.preventDefault()}>
      <div className="dphead">
        {mode === 'days' && <button type="button" className="mini" aria-label="Previous year" onClick={() => move(-12)}>&laquo;</button>}
        <button type="button" className="mini" aria-label={`Previous ${label}`} onClick={() => step(-1)}>&lsaquo;</button>
        <span className="dpmonth">
          <button type="button" className={`dpjump${mode === 'months' ? ' on' : ''}`} aria-label="Choose month" aria-expanded={mode === 'months'} onClick={() => setMode(mode === 'months' ? 'days' : 'months')}>{MONTHS[view.m - 1]}</button>
          <button type="button" className={`dpjump${mode === 'years' ? ' on' : ''}`} aria-label="Choose year" aria-expanded={mode === 'years'} onClick={() => { setYearBase(view.y - 5); setMode(mode === 'years' ? 'days' : 'years'); }}>{view.y}</button>
        </span>
        <button type="button" className="mini" aria-label={`Next ${label}`} onClick={() => step(1)}>&rsaquo;</button>
        {mode === 'days' && <button type="button" className="mini" aria-label="Next year" onClick={() => move(12)}>&raquo;</button>}
      </div>
      {mode === 'months' && (
        <div className="dppick">
          {MONTHS.map((n, i) => <button type="button" key={n} className={`dpday${i + 1 === view.m ? ' on' : ''}`} aria-label={`${n} ${view.y}`} onClick={() => { setView({ y: view.y, m: i + 1 }); setMode('days'); }}>{n.slice(0, 3)}</button>)}
        </div>
      )}
      {mode === 'years' && (
        <div className="dppick">
          {Array.from({ length: 12 }, (_, i) => yearBase + i).map((y) => <button type="button" key={y} className={`dpday${y === view.y ? ' on' : ''}`} aria-label={`Year ${y}`} onClick={() => { setView({ y, m: view.m }); setMode('days'); }}>{y}</button>)}
        </div>
      )}
      {mode === 'days' && (
        <div className="dpgrid">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((w, i) => <span key={i} className="dpwd">{w}</span>)}
          {Array.from({ length: offset }, (_, i) => <span key={`b${i}`} />)}
          {Array.from({ length: days }, (_, i) => {
            const d = isoDay(view.y, view.m, i + 1);
            return <button type="button" key={d} disabled={out(d)} className={`dpday${d === value ? ' on' : ''}${d === today ? ' today' : ''}`} aria-label={d} aria-pressed={d === value} onClick={() => onPick(d)}>{i + 1}</button>;
          })}
        </div>
      )}
      <div className="dpfoot">
        {value && <button type="button" className="mini" onClick={onClear}>Clear</button>}
        <button type="button" className="mini" disabled={out(today)} onClick={() => onPick(today)}>Today</button>
        {(min || max) && <span className="muted small">{min && max ? `${min} to ${max}` : min ? `from ${min}` : `up to ${max}`}</span>}
      </div>
    </div>
  );
}

// Text that turns into a box when clicked. Saves on Enter or when you click away; Escape cancels.
// An empty value shows as a link such as "Add source". Dates use the picker above.
export function EditText({ value, display, onCommit, label, addLabel, type = 'text', className = '', min, max, initial, validate, ...rest }:
  { value: string | number | null; display?: ReactNode; onCommit: (v: string) => void; label: string; addLabel?: string; type?: 'text' | 'number' | 'date'; className?: string; placeholder?: string; step?: string;
    min?: string | null; max?: string | null; initial?: string | null; validate?: (v: string) => string | null }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(String(value ?? ''));
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => setV(String(value ?? '')), [value]);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);
  const bad = (x: string): string | null => {
    if (type === 'date' && x) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(x)) return 'Type a date as 2026-10-05, or pick a day.';
      if ((min && x < min) || (max && x > max)) return `Pick a day ${min && max ? `between ${min} and ${max}` : min ? `on or after ${min}` : `on or before ${max}`}.`;
    }
    return validate?.(x) ?? null;
  };
  const finish = (save: boolean) => {
    if (!save || v === String(value ?? '')) { setEditing(false); setError(null); setV(String(value ?? '')); return; }
    const err = bad(v);
    if (err) { setError(err); return; }
    setEditing(false); setError(null); onCommit(v);
  };
  if (!editing) {
    const empty = value === null || value === '';
    return <button type="button" className={`ed ${empty ? 'add' : ''} ${className}`} aria-label={empty ? (addLabel ?? `Add ${label.toLowerCase()}`) : `Edit ${label.toLowerCase()}`} onClick={() => setEditing(true)}>{empty ? (addLabel ?? `Add ${label.toLowerCase()}`) : (display ?? value)}</button>;
  }
  const input = (
    <input ref={ref} className={`field ${className}`} type={type === 'date' ? 'text' : type} value={v} aria-label={label} placeholder={type === 'date' ? 'YYYY-MM-DD' : rest.placeholder}
      onChange={(e) => { setV(e.target.value); setError(null); }}
      onBlur={() => finish(true)} onKeyDown={(e) => { if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); }} step={rest.step} />
  );
  return (
    <span className="editwrap">
      {input}
      {type === 'date' && <DatePicker value={/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null} min={min} max={max} initial={initial}
        onPick={(d) => { setEditing(false); setError(null); onCommit(d); }} onClear={() => { setEditing(false); onCommit(''); }} />}
      {error && <span className="fielderr" role="alert">{error}</span>}
    </span>
  );
}

// Longer text (notes). Click to edit; it saves when you click away or press Escape, and Enter makes a new line.
// The box grows with the text instead of leaving blank space.
export function EditNotes({ value, onCommit, label, addLabel }: { value: string | null; onCommit: (v: string) => void; label: string; addLabel: string }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value ?? '');
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);
  useEffect(() => setV(value ?? ''), [value]);
  useEffect(() => { if (editing) { done.current = false; ref.current?.focus(); } }, [editing]);
  useEffect(() => { const t = ref.current; if (t) { t.style.height = 'auto'; t.style.height = `${t.scrollHeight}px`; } }, [v, editing]);
  const finish = () => { if (done.current) return; done.current = true; setEditing(false); if (v !== (value ?? '')) onCommit(v); };
  if (!editing) return <button type="button" className={`ed notes-view ${value ? '' : 'add'}`} aria-label={value ? `Edit ${label.toLowerCase()}` : addLabel} onClick={() => setEditing(true)}>{value || addLabel}</button>;
  return <textarea ref={ref} className="notes" rows={2} aria-label={label} value={v} onChange={(e) => setV(e.target.value)}
    onBlur={finish} onKeyDown={(e) => { if (e.key === 'Escape') finish(); }} />;
}

// A drop-down that shows as plain text until clicked. Optionally lets you add a brand-new entry.
export function EditSelect({ value, options, onChange, onCreate, label, addLabel, className = '' }:
  { value: string | null; options: { value: string; label: string }[]; onChange: (v: string | null) => void; onCreate?: (name: string) => void; label: string; addLabel?: string; className?: string }) {
  const [mode, setMode] = useState<'view' | 'pick' | 'new'>('view');
  const [name, setName] = useState('');
  const sel = useRef<HTMLSelectElement>(null);
  const finished = useRef(false);
  useEffect(() => { if (mode === 'new') finished.current = false; }, [mode]);
  useEffect(() => { if (mode === 'pick') { sel.current?.focus(); try { sel.current?.showPicker?.(); } catch { /* ignore */ } } }, [mode]);
  const current = options.find((o) => o.value === value)?.label ?? null;
  if (mode === 'new') {
    const done = (save: boolean) => { if (finished.current) return; finished.current = true; if (save && name.trim()) onCreate?.(name); setName(''); setMode('view'); };
    return <input className="field" autoFocus value={name} aria-label={`New ${label.toLowerCase()}`} placeholder={`New ${label.toLowerCase()}`} onChange={(e) => setName(e.target.value)}
      onBlur={() => done(true)} onKeyDown={(e) => { if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); }} />;
  }
  if (mode === 'pick') {
    return (
      <select ref={sel} className={`field ${className}`} aria-label={label} value={value ?? ''} onBlur={() => setMode('view')}
        onChange={(e) => { const v = e.target.value; if (v === '__new') setMode('new'); else { setMode('view'); onChange(v || null); } }}>
        <option value="">Not set</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        {onCreate && <option value="__new">+ New {label.toLowerCase()}...</option>}
      </select>
    );
  }
  const empty = !current;
  return <button type="button" className={`ed ${empty ? 'add' : ''} ${className}`} aria-label={empty ? (addLabel ?? `Add ${label.toLowerCase()}`) : `Change ${label.toLowerCase()}`} onClick={() => setMode('pick')}>{empty ? (addLabel ?? `Add ${label.toLowerCase()}`) : current}</button>;
}

export function Seg<T extends string | number>({ value, options, onChange, label, className = '' }: { value: T | null; options: { value: T; label: ReactNode }[]; onChange: (v: T | null) => void; label: string; className?: string }) {
  return (
    <div className={`seg ${className}`.trim()} role="group" aria-label={label}>
      {options.map((o) => (
        <button type="button" key={String(o.value)} aria-pressed={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(value === o.value ? null : o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

const POLY = '12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26';
const QUARTERS = Array.from({ length: 21 }, (_, i) => i / 4);

// Five stars, each split in four and filled like a spiral: top left, bottom left, bottom right, top right.
// Click the part of a star you want filled; the box beside it is the keyboard route.
const QUAD_RECTS = [[0, 0], [0, 12], [12, 12], [12, 0]] as const; // top-left, bottom-left, bottom-right, top-right
export function Stars({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const uid = useId().replace(/:/g, '');
  return (
    <div className="rating">
      <span className="stars">
        {starFills(value).map((f, i) => {
          const k = starQuarters(f);
          return (
            <svg key={i} width="36" height="36" viewBox="0 0 24 24" aria-hidden="true"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                const right = e.clientX - r.left >= r.width / 2; const bottom = e.clientY - r.top >= r.height / 2;
                const q = right ? (bottom ? 3 : 4) : bottom ? 2 : 1; // the quarter you clicked
                onChange(i + q / 4);
              }}>
              <defs><clipPath id={`${uid}${i}`}>{QUAD_RECTS.slice(0, k).map(([x, y]) => <rect key={x + '-' + y} x={x} y={y} width="12" height="12" />)}</clipPath></defs>
              <polygon points={POLY} style={{ fill: 'var(--line)' }} />
              {k > 0 && <polygon points={POLY} fill="#d6a35e" clipPath={`url(#${uid}${i})`} />}
            </svg>
          );
        })}
      </span>
      <select aria-label="Rating" value={value === null ? '' : String(value)} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}>
        <option value="">Unrated</option>
        {QUARTERS.map((q) => <option key={q} value={q}>{q} of 5</option>)}
      </select>
    </div>
  );
}

// The same spiral stars, not clickable (for lists and summaries).
export function StarRow({ value, size = 18 }: { value: number | null; size?: number }) {
  const uid = useId().replace(/:/g, '');
  return (
    <span className="stars static" aria-label={value === null ? 'Unrated' : `${value} of 5`}>
      {starFills(value).map((f, i) => {
        const k = starQuarters(f);
        return (
          <svg key={i} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
            <defs><clipPath id={`${uid}${i}`}>{QUAD_RECTS.slice(0, k).map(([x, y]) => <rect key={x + '-' + y} x={x} y={y} width="12" height="12" />)}</clipPath></defs>
            <polygon points={POLY} style={{ fill: 'var(--line)' }} />
            {k > 0 && <polygon points={POLY} fill="#d6a35e" clipPath={`url(#${uid}${i})`} />}
          </svg>
        );
      })}
    </span>
  );
}

export function Thumbs({ value, onChange }: { value: 'up' | 'neutral' | 'down' | null; onChange: (v: 'up' | 'neutral' | 'down' | null) => void }) {
  const icons = {
    up: <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />,
    neutral: <><circle cx="12" cy="12" r="10" /><line x1="8" y1="15" x2="16" y2="15" /><line x1="9" y1="9.01" x2="9" y2="9" /><line x1="15" y1="9.01" x2="15" y2="9" /></>,
    down: <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-1.97 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />,
  };
  const names = { up: 'Thumbs up', neutral: 'Okay', down: 'Thumbs down' } as const;
  return (
    <div className="seg thumbs" role="group" aria-label="Narrator rating">
      {(['up', 'neutral', 'down'] as const).map((k) => (
        <button type="button" key={k} aria-label={names[k]} aria-pressed={value === k} className={value === k ? `on t-${k}` : ''} onClick={() => onChange(value === k ? null : k)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icons[k]}</svg>
        </button>
      ))}
    </div>
  );
}

// Tags for a book. "+ Add genre" opens a search box: matches appear as you type, Enter picks or creates.
// Click a tag's name to rename it everywhere; the x removes it from this book only.
export function TagEditor({ label, items, options, onAdd, onRemove, onRename }:
  { label: string; items: Item[]; options: Item[]; onAdd: (name: string) => void; onRemove: (id: string) => void; onRename: (id: string, name: string) => void }) {
  const one = label.toLowerCase().replace(/s$/, '');
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const have = new Set(items.map((i) => i.id));
  const q = text.trim().toLowerCase();
  const matches = options.filter((o) => !have.has(o.id) && (!q || o.name.toLowerCase().includes(q))).slice(0, 8);
  const exact = options.some((o) => o.name.toLowerCase() === q);
  const choices = [...matches.map((m) => ({ name: m.name, isNew: false, color: m.color })), ...(q && !exact ? [{ name: text.trim(), isNew: true, color: null }] : [])];
  const pick = (name: string) => { onAdd(name); setText(''); setActive(0); };
  const close = () => { setAdding(false); setText(''); setActive(0); };
  return (
    <Card label={label}>
      <div className="chips">
        {items.map((t) => (
          <span key={t.id} className="chip" style={chipStyle(t.color)}>
            {renaming === t.id ? (
              <input className="chipedit" autoFocus value={draft} aria-label={`Rename ${t.name}`} onChange={(e) => setDraft(e.target.value)}
                onBlur={() => { if (draft.trim() && draft.trim() !== t.name) onRename(t.id, draft); setRenaming(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setDraft(t.name); setRenaming(null); } }} />
            ) : (
              <button type="button" className="chipname" title="Rename (changes it everywhere)" onClick={() => { setDraft(t.name); setRenaming(t.id); }}>{t.name}</button>
            )}
            <button type="button" className="x" aria-label={`Remove ${t.name}`} onClick={() => onRemove(t.id)}>&times;</button>
          </span>
        ))}
      </div>
      {adding ? (
        <div className="combo">
          <input className="field small" autoFocus value={text} placeholder={`Search or add a ${one}`} aria-label={`Search ${label.toLowerCase()}`}
            onChange={(e) => { setText(e.target.value); setActive(0); }} onBlur={() => setTimeout(close, 120)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, choices.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              else if (e.key === 'Enter') { e.preventDefault(); const c = choices[active] ?? (text.trim() ? { name: text.trim() } : null); if (c) pick(c.name); }
              else if (e.key === 'Escape') close();
            }} />
          {choices.length > 0 && (
            <ul className="suggest" role="listbox">
              {choices.map((c, i) => (
                <li key={c.name + c.isNew} role="option" aria-selected={i === active} className={i === active ? 'on' : ''} onMouseDown={(e) => { e.preventDefault(); pick(c.name); }}>
                  {c.color && <span className="sdot" style={{ background: c.color }} />}{c.isNew ? <>Create <b>{c.name}</b></> : c.name}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <button type="button" className="ed add" onClick={() => setAdding(true)}>{`Add ${one}`}</button>
      )}
    </Card>
  );
}

// A search-as-you-type picker. Pick a match, or use the last option to create something new.
export interface ComboOption { key: string; label: string; sub?: string | null }
export function Combo({ options, placeholder, label, onPick, onCreate, createLabel, autoFocus, onClose, footer }:
  { options: ComboOption[]; placeholder: string; label: string; onPick: (key: string) => void; onCreate?: (text: string) => void; createLabel?: (text: string) => string; autoFocus?: boolean; onClose?: () => void; footer?: { label: string; onChoose: () => void } }) {
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const q = text.trim().toLowerCase();
  const matches = options.filter((o) => !q || o.label.toLowerCase().includes(q) || (o.sub ?? '').toLowerCase().includes(q)).slice(0, 8);
  const choices: { key: string; label: string; sub?: string | null; create?: boolean; foot?: boolean }[] = [...matches, ...(onCreate && q ? [{ key: '__create', label: createLabel ? createLabel(text.trim()) : `Add "${text.trim()}"`, create: true }] : []), ...(footer ? [{ key: '__footer', label: footer.label, foot: true }] : [])];
  const choose = (c: (typeof choices)[number]) => { if (c.foot) footer?.onChoose(); else if (c.create) onCreate?.(text.trim()); else onPick(c.key); setText(''); setActive(0); setOpen(false); onClose?.(); };
  return (
    <div className="combo">
      <input className="field small" value={text} placeholder={placeholder} aria-label={label} autoFocus={autoFocus} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => { setOpen(false); onClose?.(); }, 120)}
        onChange={(e) => { setText(e.target.value); setActive(0); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, choices.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === 'Enter') { e.preventDefault(); if (choices[active]) choose(choices[active]); }
          else if (e.key === 'Escape') { setText(''); setOpen(false); onClose?.(); }
        }} />
      {open && choices.length > 0 && (
        <ul className="suggest" role="listbox">
          {choices.map((c, i) => (
            <li key={c.key} role="option" aria-selected={i === active} className={i === active ? 'on' : ''} onMouseDown={(e) => { e.preventDefault(); choose(c); }}>
              <span>{c.label}</span>{c.sub && <span className="muted small"> {c.sub}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// A picture shown full screen. Click outside it, or the X, to close.
export function Lightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => { const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose]);
  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={alt} onClick={onClose}>
      <button type="button" className="lbclose" aria-label="Close" onClick={onClose}>&times;</button>
      <img src={src} alt={alt} onClick={(e) => e.stopPropagation()} />
    </div>
  );
}

// A picture that opens full screen when clicked.
export function ZoomImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={`zoomimg ${className ?? ''}`} aria-label={`View ${alt} full screen`} onClick={() => setOpen(true)}><img src={src} alt={alt} /></button>
      {open && <Lightbox src={src} alt={alt} onClose={() => setOpen(false)} />}
    </>
  );
}

// A box for pasting the address of a picture. The screen decides what to do with the link.
export function LinkImageForm({ onUrl, label = 'Add from a link' }: { onUrl: (url: string) => void | Promise<void>; label?: string }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    setError(null); setBusy(true);
    try { await onUrl(url); setUrl(''); setOpen(false); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  if (!open) return <button type="button" className="mini" onClick={() => setOpen(true)}>{label}</button>;
  return (
    <span className="linkform">
      <input className="field small" autoFocus placeholder="Paste a picture address" aria-label="Picture address" value={url} onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') go(); if (e.key === 'Escape') setOpen(false); }} />
      <button type="button" className="mini" disabled={busy} onClick={go}>{busy ? 'Adding...' : 'Add'}</button>
      <button type="button" className="mini" onClick={() => { setOpen(false); setError(null); }}>Cancel</button>
      {error && <span className="fielderr" role="alert">{error}</span>}
    </span>
  );
}

// A button that opens the file chooser for a picture.
export function FilePicker({ label, onFile, className = 'mini' }: { label: string; onFile: (f: File) => void; className?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className={className} onClick={() => ref.current?.click()}>{label}</button>
      <input ref={ref} type="file" accept="image/*" hidden aria-label={label} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
    </>
  );
}

export const ICON = {
  physical: <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />,
  audio: <><path d="M3 18v-6a9 9 0 0 1 18 0v6" /><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" /></>,
  ebook: <><rect x="5" y="2" width="14" height="20" rx="2" /><line x1="8.5" y1="7" x2="15.5" y2="7" /><line x1="8.5" y1="10.5" x2="15.5" y2="10.5" /><line x1="8.5" y1="14" x2="12.5" y2="14" /><line x1="10" y1="18.5" x2="14" y2="18.5" /></>,
};
export function Icon({ name }: { name: keyof typeof ICON }) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICON[name]}</svg>;
}

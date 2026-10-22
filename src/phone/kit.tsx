import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useSync } from '../sync/SyncContext';
import { coverData } from './covers';
import { useDb } from '../db/DbContext';

/** Runs a query and runs it again after any change, here or from the cloud. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | undefined; error: string | null; reload(): Promise<void> } {
  const { dataVersion } = useSync();
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const run = useRef(fn); run.current = fn;
  const reload = useCallback(async () => {
    try { setData(await run.current()); setError(null); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void reload(); }, [...deps, dataVersion, reload]);
  return { data, error, reload };
}

const TILE = ['#a65e3a', '#5b6e7e', '#d3a05c', '#747a4c', '#8a9a82', '#b5705e', '#7a6a8a', '#8a6a5a'];
const tileColor = (title: string) => TILE[[...title].reduce((n, c) => n + c.charCodeAt(0), 0) % TILE.length];

/** A book cover from the phone's saved covers, or a colored tile with the title when there is none. */
export function Cover({ imageId, title, w, h }: { imageId?: string | null; title: string; w: number; h: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true; setSrc(null);
    if (imageId) void coverData(imageId).then((d) => { if (live) setSrc(d); }, () => undefined);
    return () => { live = false; };
  }, [imageId]);
  return <div className="ph-cover" role="img" aria-label={`Cover of ${title}`} style={{ width: w, height: h, backgroundColor: tileColor(title), backgroundImage: src ? `url(${src})` : undefined, fontSize: w > 80 ? 13 : 9 }}>{src ? null : (w > 40 ? title : null)}</div>;
}

export function Card({ label, children }: { label?: string; children: ReactNode }) {
  return <section className="ph-card">{label && <span className="ph-label">{label}</span>}{children}</section>;
}

export function Seg<T extends string | number>({ value, options, onChange, label, className = '', allowClear }: { value: T | null; options: { value: T; label: string }[]; onChange(v: T | null): void; label: string; className?: string; allowClear?: boolean }) {
  return (
    <div className={`ph-seg ${className}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" className={o.value === value ? 'on' : ''} aria-pressed={o.value === value} onClick={() => onChange(allowClear && o.value === value ? null : o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

/** A text box that saves when you leave it. A change that arrives from another device is not shown while you are typing. */
export function TextField({ label, value, onCommit, type = 'text', multiline, placeholder, inputMode, hideLabel }: {
  label: string; value: string | number | null; onCommit(v: string): void; type?: string; multiline?: boolean; placeholder?: string; inputMode?: 'numeric' | 'decimal' | 'text'; hideLabel?: boolean;
}) {
  const shown = value === null || value === undefined ? '' : String(value);
  const [draft, setDraft] = useState(shown);
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setDraft(shown); }, [shown]);
  const commit = () => { focused.current = false; if (draft !== shown) onCommit(draft); };
  const common = {
    value: draft, placeholder, 'aria-label': label,
    onFocus: () => { focused.current = true; }, onBlur: commit,
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
  };
  return (
    <label className="ph-field" style={{ display: 'block', marginTop: hideLabel ? 0 : 14 }}>
      {!hideLabel && <span className="ph-label">{label}</span>}
      {multiline
        ? <textarea className="ph-textarea" {...common} />
        : <input className="ph-input" type={type} inputMode={inputMode} {...common} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />}
    </label>
  );
}

/** The visible part of the screen. When the keyboard is up, `inset` is how far up from the bottom of the screen it reaches, so sheets can sit on top of it. */
export function useVisibleArea(): { height: number; inset: number } {
  const read = () => {
    const vv = window.visualViewport;
    return vv ? { height: vv.height, inset: Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) } : { height: window.innerHeight, inset: 0 };
  };
  const [area, setArea] = useState(read);
  useEffect(() => {
    const vv = window.visualViewport;
    const update = () => setArea(read());
    vv?.addEventListener('resize', update); vv?.addEventListener('scroll', update); window.addEventListener('resize', update);
    return () => { vv?.removeEventListener('resize', update); vv?.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, []);
  return area;
}

export function Sheet({ title, onClose, children }: { title: string; onClose(): void; children: ReactNode }) {
  const area = useVisibleArea();
  const typing = area.inset > 80; // the keyboard is open
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  return (
    <>
      <div className="ph-sheet-back" onClick={onClose} />
      <div className="ph-sheet" role="dialog" aria-label={title} style={{ bottom: area.inset, maxHeight: Math.round(area.height * 0.92), paddingBottom: typing ? 10 : undefined }}>
        <div className="grip" aria-hidden="true" />
        <header><h2>{title}</h2><button type="button" className="done" onClick={onClose}>Done</button></header>
        <div className="body">{children}</div>
      </div>
    </>
  );
}

export interface Opt { id: string; name: string; note?: string }

/** Pick one from a list as you type, or create a new one. Used for tags, characters, series and so on. */
export function PickerSheet({ title, options, taken = [], onPick, onCreate, createLabel, onClose, placeholder = 'Search', keepOpen, extra, alsoCreate }: {
  title: string; options: Opt[]; taken?: string[]; onPick(o: Opt): void; onCreate?(name: string): void; createLabel?: string; onClose(): void; placeholder?: string; keepOpen?: boolean; extra?: { label: string; onChoose(): void };
  /** A second way to create what was typed (for example a name with no page). */
  alsoCreate?: { label: string; onCreate(name: string): void };
}) {
  const [q, setQ] = useState('');
  const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const t = fold(q.trim());
  const shown = options.filter((o) => !taken.includes(o.id) && (!t || fold(o.name).includes(t))).slice(0, 30);
  const exact = options.some((o) => fold(o.name) === t);
  const done = () => { if (!keepOpen) onClose(); };
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="ph-search"><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label={placeholder} /></div>
      <div>
        {/* Creating comes first so it is never hidden below the keyboard */}
        {onCreate && t && !exact && (
          <button type="button" className="ph-opt create" onClick={() => { onCreate(q.trim()); done(); }}><span aria-hidden="true">+</span> {createLabel ?? 'Create'} &ldquo;{q.trim()}&rdquo;</button>
        )}
        {alsoCreate && t && !exact && (
          <button type="button" className="ph-opt create" onClick={() => { alsoCreate.onCreate(q.trim()); done(); }}><span aria-hidden="true">+</span> {alsoCreate.label} &ldquo;{q.trim()}&rdquo;</button>
        )}
        {extra && <button type="button" className="ph-opt create" onClick={() => { extra.onChoose(); }}><span aria-hidden="true">+</span> {extra.label}</button>}
        {shown.map((o) => (
          <button key={o.id} type="button" className="ph-opt" onClick={() => { onPick(o); done(); }}><span>{o.name}</span>{o.note && <span className="n">{o.note}</span>}</button>
        ))}
        {!shown.length && !(onCreate && t) && <p className="ph-muted ph-small">Nothing to show.</p>}
      </div>
    </Sheet>
  );
}

/** A row of colored chips with a button to add another. */
export function ChipSet({ label, color, items, locked = [], options, onAdd, onCreate, onRemove, addLabel }: {
  label: string; color: string; items: Opt[]; locked?: string[]; options: Opt[]; onAdd(o: Opt): void; onCreate(name: string): void; onRemove(o: Opt): void; addLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Card label={label}>
      <div className="ph-chips">
        {items.map((i) => locked.includes(i.id)
          ? <span key={i.id} className="ph-chip locked" style={{ background: color }}>{i.name}</span>
          : <span key={i.id} className="ph-chip" style={{ background: color }}>{i.name}<button type="button" className="x" aria-label={`Remove ${i.name}`} onClick={() => onRemove(i)}>&times;</button></span>)}
        <button type="button" className="ph-chip add" onClick={() => setOpen(true)}>+ {addLabel ?? 'Add'}</button>
      </div>
      {open && <PickerSheet title={`Add ${label.toLowerCase()}`} options={options} taken={items.map((i) => i.id)} onPick={onAdd} onCreate={onCreate} createLabel={`Create new ${label.toLowerCase().replace(/s$/, '')}`} onClose={() => setOpen(false)} placeholder={`Search ${label.toLowerCase()}`} />}
    </Card>
  );
}

export function SyncDot() {
  const { state } = useSync();
  const cls = state === 'syncing' ? 'busy' : state === 'problem' ? 'bad' : '';
  return <span className={`ph-dot ${cls}`} aria-hidden="true" />;
}

export function useSafeDb() { return useDb(); }

/** A remove button that asks "Remove?" on the first tap, so a slip does not delete something. */
export function ConfirmRemove({ label, onConfirm }: { label: string; onConfirm(): void }) {
  const [sure, setSure] = useState(false);
  useEffect(() => { if (!sure) return; const t = setTimeout(() => setSure(false), 4000); return () => clearTimeout(t); }, [sure]);
  return sure
    ? <button type="button" className="ph-btn danger" style={{ minHeight: 40, padding: '0 10px' }} aria-label={`Confirm: ${label}`} onClick={onConfirm}>Remove?</button>
    : <button type="button" className="ph-btn" style={{ minHeight: 40, padding: '0 10px' }} aria-label={label} onClick={() => setSure(true)}>&times;</button>;
}

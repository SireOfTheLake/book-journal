import { useState } from 'react';
import { useFeatures } from '../features/FeaturesContext';
import type { Status } from '../repo/bookLog';
import { hasChanges, STATUS_NAME, type BulkChanges, type BulkResult, type Copy, type Format } from '../repo/bulkEdit';

export interface BulkOptions { sources: { id: string; name: string }[]; genres: string[]; tropes: string[] }
export interface BulkApi {
  describe(ids: string[], changes: BulkChanges): Promise<string[]>;
  apply(ids: string[], changes: BulkChanges, onProgress: (done: number, total: number) => void): Promise<BulkResult>;
}

const STATUSES: Status[] = ['tbr', 'up_next', 'reading', 'finished', 'on_hold', 'dnf'];
const COPIES: { value: Copy; label: string }[] = [{ value: 'physical', label: 'Physical' }, { value: 'ebook', label: 'Ebook' }, { value: 'audio', label: 'Audio' }];

// A list of names to add (a genre or a trope), typed or picked from what exists.
function NameList({ label, names, suggestions, onChange }: { label: string; names: string[]; suggestions: string[]; onChange(n: string[]): void }) {
  const [text, setText] = useState('');
  const id = `bulk-${label.toLowerCase()}`;
  const add = () => { const t = text.trim(); if (t && !names.some((n) => n.toLowerCase() === t.toLowerCase())) onChange([...names, t]); setText(''); };
  return (
    <div className="stack"><span className="lbl2">{`${label} to add`}</span>
      <div className="bltools">
        <input className="field grow" list={id} placeholder="Leave blank to change nothing" aria-label={`${label} to add`} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <datalist id={id}>{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
        <button type="button" className="mini" disabled={!text.trim()} aria-label={`Add ${label.toLowerCase()}`} onClick={add}>Add</button>
      </div>
      {names.length > 0 && <div className="chips">{names.map((n) => <span key={n} className="chip">{n}<button type="button" className="x" aria-label={`Remove ${n}`} onClick={() => onChange(names.filter((x) => x !== n))}>&times;</button></span>)}</div>}
    </div>
  );
}

// Edit a few basic fields on every selected book. Every field starts blank, and blank means "leave it alone".
export default function BulkEditDialog({ ids, options, api, onClose, onDone }: { ids: string[]; options: BulkOptions; api: BulkApi; onClose(): void; onDone(result: BulkResult, lines: string[]): void }) {
  const { flags } = useFeatures();
  const [status, setStatus] = useState<Status | ''>('');
  const [format, setFormat] = useState<Format | ''>('');
  const [sourceId, setSourceId] = useState('');
  const [genres, setGenres] = useState<string[]>([]);
  const [tropes, setTropes] = useState<string[]>([]);
  const [own, setOwn] = useState<Copy[]>([]);
  const [placeholder, setPlaceholder] = useState<'' | 'yes' | 'no'>('');
  const [step, setStep] = useState<'form' | 'confirm' | 'working'>('form');
  const [lines, setLines] = useState<string[]>([]);
  const [progress, setProgress] = useState<[number, number]>([0, ids.length]);
  const [error, setError] = useState<string | null>(null);

  const changes: BulkChanges = {
    ...(status ? { status } : {}), ...(format ? { format } : {}),
    ...(sourceId ? { sourceId, sourceName: options.sources.find((s) => s.id === sourceId)?.name } : {}),
    ...(genres.length ? { genres } : {}), ...(tropes.length ? { tropes } : {}), ...(own.length ? { own } : {}),
    ...(placeholder ? { placeholderPermanent: placeholder === 'yes' } : {}),
  };
  const many = `${ids.length} ${ids.length === 1 ? 'book' : 'books'}`;

  async function review() {
    setError(null);
    try { setLines(await api.describe(ids, changes)); setStep('confirm'); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }
  async function go() {
    setStep('working'); setError(null);
    try { const r = await api.apply(ids, changes, (d, t) => setProgress([d, t])); onDone(r, lines); }
    catch (e) { setError(`It stopped part way: ${e instanceof Error ? e.message : String(e)}`); setStep('confirm'); }
  }

  return (
    <div className="overlay" onKeyDown={(e) => e.key === 'Escape' && step !== 'working' && onClose()}>
      <div className="dialog" role="dialog" aria-label="Edit selected books" aria-modal="true">
        {step === 'form' && (
          <>
            <h2 className="pagetitle small2">{`EDIT ${many.toUpperCase()}`}</h2>
            <p className="muted small" style={{ margin: 0 }}>Anything you leave blank stays as it is on each book.</p>
            <div className="bulkgrid">
              <label className="stack"><span className="lbl2">Status</span>
                <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as Status | '')}><option value="">Leave as is</option>{STATUSES.map((s) => <option key={s} value={s}>{STATUS_NAME[s]}</option>)}</select></label>
              <label className="stack"><span className="lbl2">Format</span>
                <select aria-label="Format" value={format} onChange={(e) => setFormat(e.target.value as Format | '')}><option value="">Leave as is</option><option value="physical">Physical</option><option value="audio">Audio</option><option value="ebook">Ebook</option></select></label>
              <label className="stack"><span className="lbl2">Source</span>
                <select aria-label="Source" value={sourceId} onChange={(e) => setSourceId(e.target.value)}><option value="">Leave as is</option>{options.sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
              <label className="stack"><span className="lbl2">Placeholder cover</span>
                <select aria-label="Placeholder cover" value={placeholder} onChange={(e) => setPlaceholder(e.target.value as '' | 'yes' | 'no')}><option value="">Leave as is</option><option value="yes">Is permanent</option><option value="no">Is not permanent</option></select></label>
            </div>
            <NameList label="Genre" names={genres} suggestions={options.genres} onChange={setGenres} />
            <NameList label="Trope" names={tropes} suggestions={options.tropes} onChange={setTropes} />
            {flags.owned && (
              <div className="stack"><span className="lbl2">Mark as owned</span>
                <div className="seg listseg" role="group" aria-label="Mark as owned">
                  {COPIES.map((c) => <button type="button" key={c.value} aria-pressed={own.includes(c.value)} className={own.includes(c.value) ? 'on' : ''} onClick={() => setOwn(own.includes(c.value) ? own.filter((x) => x !== c.value) : [...own, c.value])}>{c.label}</button>)}
                </div>
              </div>
            )}
            {error && <div className="bcard warn" role="alert">{error}</div>}
            <div className="actions dialogbtns">
              <button type="button" className="btn on" disabled={!hasChanges(changes)} onClick={() => void review()}>Save</button>
              <button type="button" className="btn" onClick={onClose}>Cancel</button>
            </div>
          </>
        )}
        {step !== 'form' && (
          <>
            <h2 className="pagetitle small2">MAKE THESE CHANGES?</h2>
            <p style={{ margin: 0 }}>{`This will change ${many}:`}</p>
            <ul className="bulklines">{lines.map((l) => <li key={l}>{l}</li>)}</ul>
            {step === 'working' && <p className="muted" role="status">{`Working... ${progress[0]} of ${progress[1]}`}</p>}
            {error && <div className="bcard warn" role="alert">{error}</div>}
            <div className="actions dialogbtns">
              <button type="button" className="btn on" disabled={step === 'working'} onClick={() => void go()}>Yes, make the changes</button>
              <button type="button" className="btn" disabled={step === 'working'} onClick={() => setStep('form')}>Back</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

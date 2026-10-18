import { useEffect, useState } from 'react';
import type { Item } from '../repo/bookLog';
import MergeDialog, { type MergeApi } from './MergeDialog';

export interface RemoveApi {
  // Says what deleting will do, e.g. "Its 4 books stay in your journal."
  describe(): Promise<string>;
  run(): Promise<void>;
}

// The "..." button at the top right of a page: merge another entry into this one, or delete this one.
export default function EntityMenu({ noun, self, others, merge, remove }: { noun: string; self: Item; others: Item[]; merge: MergeApi; remove: RemoveApi }) {
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<'merge' | 'delete' | null>(null);
  const Noun = noun.charAt(0).toUpperCase() + noun.slice(1);
  return (
    <div className="charmenu">
      <button type="button" className="mini menubtn" aria-label={`${Noun} menu`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>&#8943;</button>
      {open && (
        <div className="menupop" role="menu">
          <button type="button" role="menuitem" onClick={() => { setOpen(false); setDialog('merge'); }}>{`Merge ${noun === 'series' ? 'series' : `${noun}s`}...`}</button>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); setDialog('delete'); }}>{`Delete this ${noun}...`}</button>
        </div>
      )}
      {dialog === 'merge' && <MergeDialog noun={noun} self={self} others={others} api={merge} onClose={() => setDialog(null)} />}
      {dialog === 'delete' && <DeleteDialog noun={noun} self={self} remove={remove} onClose={() => setDialog(null)} />}
    </div>
  );
}

function DeleteDialog({ noun, self, remove, onClose }: { noun: string; self: Item; remove: RemoveApi; onClose(): void }) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { remove.describe().then(setText, () => setText('')); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const go = async () => {
    setBusy(true);
    try { await remove.run(); onClose(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); setBusy(false); }
  };
  return (
    <div className="overlay" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="dialog" role="dialog" aria-label={`Delete this ${noun}`}>
        <h2 className="pagetitle small2">Delete {self.name}?</h2>
        <span className="notice">{`"${self.name}" will be removed. ${text ?? ''} If this is a duplicate, merge it instead so nothing is lost.`}</span>
        {error && <div className="bcard warn" role="alert">{error}</div>}
        <div className="entryform dialogbtns">
          <button type="button" className="btn on" disabled={busy || text === null} onClick={go}>Delete</button>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import type { Item } from '../../repo/bookLog';
import MergeDialog, { type MergeApi } from '../MergeDialog';

export interface MenuActions extends MergeApi {
  remove(id: string): Promise<void>;
}

// The "..." button at the top right of a character's page: merge another entry into this one, or delete this character.
export default function CharacterMenu({ self, characters, act }: { self: Item; characters: Item[]; act: MenuActions }) {
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<'merge' | 'delete' | null>(null);
  return (
    <div className="charmenu">
      <button type="button" className="mini menubtn" aria-label="Character menu" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>&#8943;</button>
      {open && (
        <div className="menupop" role="menu">
          <button type="button" role="menuitem" onClick={() => { setOpen(false); setDialog('merge'); }}>Merge characters...</button>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); setDialog('delete'); }}>Delete this character...</button>
        </div>
      )}
      {dialog === 'merge' && <MergeDialog noun="character" self={self} others={characters} api={act} onClose={() => setDialog(null)} />}
      {dialog === 'delete' && <DeleteDialog self={self} act={act} onClose={() => setDialog(null)} />}
    </div>
  );
}

function DeleteDialog({ self, act, onClose }: { self: Item; act: MenuActions; onClose(): void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { await act.remove(self.id); onClose(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); setBusy(false); }
  };
  return (
    <div className="overlay" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="dialog" role="dialog" aria-label="Delete this character">
        <h2 className="pagetitle small2">Delete {self.name}?</h2>
        <span className="notice">"{self.name}" will be removed from every book and relationship. Books are not affected. If this is a duplicate, merge it instead so nothing is lost.</span>
        {error && <div className="bcard warn" role="alert">{error}</div>}
        <div className="entryform dialogbtns">
          <button type="button" className="btn on" disabled={busy} onClick={go}>Delete</button>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

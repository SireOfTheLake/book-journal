import { useEffect, useState } from 'react';
import type { Item } from '../../repo/bookLog';
import { Combo } from '../bookLog/parts';

export interface MenuActions {
  preview(id: string): Promise<{ books: number; relationships: number }>;
  merge(keepId: string, dupId: string): Promise<void>;
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
      {dialog === 'merge' && <MergeDialog self={self} characters={characters} act={act} onClose={() => setDialog(null)} />}
      {dialog === 'delete' && <DeleteDialog self={self} act={act} onClose={() => setDialog(null)} />}
    </div>
  );
}

function MergeDialog({ self, characters, act, onClose }: { self: Item; characters: Item[]; act: MenuActions; onClose(): void }) {
  const [other, setOther] = useState<string | null>(null);
  const [keepSelf, setKeepSelf] = useState(true);
  const [info, setInfo] = useState<{ books: number; relationships: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const otherName = characters.find((c) => c.id === other)?.name ?? '';
  const keepName = keepSelf ? self.name : otherName, dupName = keepSelf ? otherName : self.name;
  useEffect(() => { setInfo(null); if (other) act.preview(keepSelf ? other : self.id).then(setInfo).catch(() => undefined); }, [other, keepSelf]); // eslint-disable-line react-hooks/exhaustive-deps
  const go = async () => {
    if (!other) return;
    setBusy(true);
    try { await (keepSelf ? act.merge(self.id, other) : act.merge(other, self.id)); onClose(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); setBusy(false); }
  };
  return (
    <div className="overlay" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="dialog" role="dialog" aria-label="Merge characters">
        <h2 className="pagetitle small2">Merge characters</h2>
        <span className="muted">Two entries for the same person become one. Their books, relationships, tags, pictures and names all move to the one you keep.</span>
        <div className="pickrow">
          <span className="lbl2">Merge with</span>
          {other ? <span><b>{otherName}</b> <button type="button" className="btn quiet" aria-label="Change the other character" onClick={() => setOther(null)}>Change</button></span>
            : <Combo autoFocus label="Search the other character" placeholder="Search for a character" options={characters.filter((c) => c.id !== self.id).map((c) => ({ key: c.id, label: c.name }))} onPick={setOther} />}
        </div>
        {other && (
          <div className="pickrow" role="radiogroup" aria-label="Which one to keep">
            <span className="lbl2">Keep this name</span>
            <label className="inline"><input type="radio" name="keep" checked={keepSelf} onChange={() => setKeepSelf(true)} /><span>{self.name} (this page)</span></label>
            <label className="inline"><input type="radio" name="keep" checked={!keepSelf} onChange={() => setKeepSelf(false)} /><span>{otherName}</span></label>
          </div>
        )}
        {other && <span className="notice">"{dupName}" will be folded into "{keepName}"{info ? ` (${info.books} book${info.books === 1 ? '' : 's'}, ${info.relationships} relationship${info.relationships === 1 ? '' : 's'} move over)` : ''}, and kept as an alternate name. "{dupName}" is then removed.</span>}
        {error && <div className="bcard warn" role="alert">{error}</div>}
        <div className="entryform dialogbtns">
          <button type="button" className="btn on" disabled={!other || busy} onClick={go}>Merge</button>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
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

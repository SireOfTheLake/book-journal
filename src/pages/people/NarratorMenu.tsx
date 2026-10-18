import { useState } from 'react';
import type { Item } from '../../repo/bookLog';
import MergeDialog, { type MergeApi } from '../MergeDialog';

// The "..." button at the top right of a narrator's page: merge another narrator into this one.
export default function NarratorMenu({ self, narrators, api }: { self: Item; narrators: Item[]; api: MergeApi }) {
  const [open, setOpen] = useState(false);
  const [merging, setMerging] = useState(false);
  return (
    <div className="charmenu">
      <button type="button" className="mini menubtn" aria-label="Narrator menu" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>&#8943;</button>
      {open && <div className="menupop" role="menu"><button type="button" role="menuitem" onClick={() => { setOpen(false); setMerging(true); }}>Merge narrators...</button></div>}
      {merging && <MergeDialog noun="narrator" self={self} others={narrators} api={api} onClose={() => setMerging(false)} />}
    </div>
  );
}

import { useState } from 'react';

interface Item { id: string; name: string }

// A small "Manage list" panel: rename any entry, or take it off the list (after a second click).
export default function ManageList({ items, noun, onRename, onRemove, consequence }: { items: Item[]; noun: string; onRename(id: string, name: string): void; onRemove(id: string): void; consequence?: string }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const commit = (i: Item) => { const v = (draft[i.id] ?? i.name).trim(); setDraft(({ [i.id]: _gone, ...rest }) => rest); if (v && v !== i.name) onRename(i.id, v); };
  return (
    <>
      <button type="button" className="quiet" aria-expanded={open} onClick={() => { setOpen(!open); setConfirm(null); }}>{open ? 'Done' : 'Manage list'}</button>
      {open && (
        <ul className="tplist" aria-label={`${noun}s`}>
          {items.map((i) => (
            <li key={i.id}>
              <input className="field small" aria-label={`Rename ${i.name}`} value={draft[i.id] ?? i.name} onChange={(e) => setDraft({ ...draft, [i.id]: e.target.value })}
                onBlur={() => commit(i)} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setDraft(({ [i.id]: _gone, ...rest }) => rest); } }} />
              {confirm === i.id
                ? <><button type="button" className="mini danger" onClick={() => { onRemove(i.id); setConfirm(null); }}>Remove {i.name}</button><button type="button" className="quiet" onClick={() => setConfirm(null)}>Keep</button></>
                : <button type="button" className="xbtn" aria-label={`Remove ${i.name} from the list`} onClick={() => setConfirm(i.id)}>&times;</button>}
            </li>
          ))}
          {consequence && <li className="muted small">{consequence}</li>}
        </ul>
      )}
    </>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDb } from '../../db/DbContext';
import { LISTS, addEntry, deleteEntry, listEntries, renameEntry, type ListKind, type ListRow } from '../../repo/lists';

// Settings > Lists: every pick-list in the journal (genres, tropes, sources...) with add, rename and delete.
export default function ListsCard() {
  const db = useDb();
  const [kind, setKind] = useState<ListKind>('genre');
  const [rows, setRows] = useState<ListRow[] | null>(null);
  const [query, setQuery] = useState('');
  const [newName, setNewName] = useState('');
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const info = LISTS.find((l) => l.kind === kind)!;

  const load = useCallback(() => listEntries(db, kind).then(setRows, (e) => setError(String(e))), [db, kind]);
  useEffect(() => { setRows(null); setQuery(''); setDraft({}); setConfirm(null); setError(null); load(); }, [load]);

  const attempt = async (fn: () => Promise<unknown>) => {
    setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    await load();
  };
  const add = () => attempt(async () => { await addEntry(db, kind, newName); setNewName(''); });
  const commit = (r: ListRow) => {
    const v = (draft[r.id] ?? r.name).trim();
    setDraft(({ [r.id]: _gone, ...rest }) => rest);
    if (v !== r.name) attempt(() => renameEntry(db, kind, r.id, v));
  };
  const q = query.trim().toLowerCase();
  const shown = (rows ?? []).filter((r) => !q || r.name.toLowerCase().includes(q));

  return (
    <div className="bcard">
      <span className="lbl2">Lists you choose from</span>
      <p className="muted small">The choices that appear in drop-downs and tag pickers. Add new ones, rename them, or take them off. Removing one only clears it from where it was chosen; your books and notes stay.</p>
      <div className="seg listseg" role="group" aria-label="List">
        {LISTS.map((l) => <button type="button" key={l.kind} className={kind === l.kind ? 'on' : ''} aria-pressed={kind === l.kind} onClick={() => setKind(l.kind)}>{l.label}</button>)}
      </div>
      <p className="muted small">{info.hint} Locations are managed on the <Link className="l" to="/locations">Locations page</Link>.</p>
      <div className="bltools">
        <input className="field search2" placeholder={`Add a ${info.singular}`} aria-label={`New ${info.singular}`} value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button type="button" className="btn on" disabled={!newName.trim()} onClick={add}>Add</button>
        <span className="grow" />
        <input className="field search2" placeholder="Find" aria-label={`Find a ${info.singular}`} value={query} onChange={(e) => setQuery(e.target.value)} />
        <span className="muted">{rows ? `${shown.length} of ${rows.length}` : ''}</span>
      </div>
      {error && <div className="fielderr" role="alert">{error}</div>}
      <ul className="tplist listrows" aria-label={info.label}>
        {shown.map((r) => (
          <li key={r.id}>
            <input className="field small" aria-label={`Rename ${r.name}`} value={draft[r.id] ?? r.name} onChange={(e) => setDraft({ ...draft, [r.id]: e.target.value })}
              onBlur={() => commit(r)} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setDraft(({ [r.id]: _gone, ...rest }) => rest); }} />
            <span className="muted small listuses">{r.uses === 0 ? 'not used' : `used ${r.uses} ${r.uses === 1 ? 'time' : 'times'}`}</span>
            {confirm === r.id
              ? <><button type="button" className="mini danger" onClick={() => { setConfirm(null); attempt(() => deleteEntry(db, kind, r.id)); }}>{`Delete ${r.name}`}</button><button type="button" className="quiet" onClick={() => setConfirm(null)}>Keep</button></>
              : <button type="button" className="xbtn" aria-label={`Delete ${r.name}`} onClick={() => setConfirm(r.id)}>&times;</button>}
          </li>
        ))}
        {rows && shown.length === 0 && <li className="muted">{rows.length ? 'Nothing matches.' : 'Nothing here yet.'}</li>}
      </ul>
    </div>
  );
}

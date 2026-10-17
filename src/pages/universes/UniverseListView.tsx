import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { UniverseRow } from '../../repo/universes';

export default function UniverseListView({ rows, onCreate }: { rows: UniverseRow[]; onCreate(name: string): void | Promise<void> }) {
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const q = query.trim().toLowerCase();
  const shown = rows.filter((r) => !q || r.name.toLowerCase().includes(q));
  const add = async () => { if (name.trim()) { await onCreate(name); setName(''); } };
  return (
    <div className="ledger">
      <div className="bltools">
        <input className="field search2" placeholder="Find a universe" aria-label="Find a universe" value={query} onChange={(e) => setQuery(e.target.value)} />
        <span className="grow" />
        <span className="muted">{shown.length} of {rows.length}</span>
      </div>
      <div className="addrow card-ish">
        <input className="field grow" placeholder="+ New universe: type a name and press Enter" aria-label="New universe" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button type="button" className="mini" onClick={add}>Add</button>
      </div>
      <div className="ltable">
        <div className="prow phead"><span>Universe</span><span>Series</span><span>Books</span><span>Read</span><span>Authors</span></div>
        {shown.map((r) => (
          <div className="prow" key={r.id}>
            <span><Link className="l ttl" to={`/universes/${r.id}`}>{r.name}</Link></span>
            <span>{r.series}</span><span>{r.books}</span><span className="muted">{`${r.read} of ${r.books}`}</span><span className="muted">{r.authors}</span>
          </div>
        ))}
        {shown.length === 0 && <div className="prow"><span className="muted">{rows.length ? 'No universes match.' : 'No universes yet. Add one above, or set one on a series or book.'}</span></div>}
      </div>
    </div>
  );
}

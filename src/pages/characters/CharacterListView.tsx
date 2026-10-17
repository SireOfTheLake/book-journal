import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { CharacterListRow } from '../../repo/characters';

const mainBooks = (r: CharacterListRow): { id: string; title: string }[] => { try { return r.main_titles ? (JSON.parse(r.main_titles) as { id: string; title: string }[]) : []; } catch { return []; } };

export default function CharacterListView({ rows, onCreate }: { rows: CharacterListRow[]; onCreate(name: string): void | Promise<void> }) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'all' | 'nobook'>('all');
  const [name, setName] = useState('');
  const q = query.trim().toLowerCase();
  const shown = rows.filter((r) => (kind === 'all' || r.main_books + r.side_books === 0)
    && (!q || [r.name, r.tags, r.partners, r.occupations, r.place].some((x) => x?.toLowerCase().includes(q))));
  const add = async () => { if (name.trim()) { await onCreate(name); setName(''); } };
  const unassigned = rows.filter((r) => r.main_books + r.side_books === 0).length;
  return (
    <div className="ledger">
      <div className="bltools">
        <input className="field search2" placeholder="Find a character" aria-label="Find a character" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select aria-label="Show" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          <option value="all">All characters</option><option value="nobook">Not in a book yet ({unassigned})</option>
        </select>
        <span className="grow" />
        <span className="muted">{shown.length} of {rows.length}</span>
      </div>
      <div className="addrow card-ish">
        <input className="field grow" placeholder="+ New character: type a name and press Enter" aria-label="New character" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button type="button" className="mini" onClick={add}>Add</button>
      </div>
      <div className="ltable">
        <div className="crow chead"><span>Name</span><span>Main character in</span><span>Partner</span><span>Occupation</span><span>Place</span></div>
        {shown.map((r) => (
          <div className="crow" key={r.id}>
            <span><Link className="l ttl" to={`/characters/${r.id}`}>{r.name}</Link>{r.tags?.split(', ').map((t) => <span key={t} className="schip tinychip">{t}</span>)}</span>
            <span className="mainbooks">{mainBooks(r).length ? mainBooks(r).map((b) => <Link key={b.id} className="mainpill" to={`/book/${b.id}`} title={b.title}>{b.title}</Link>) : <span className="muted">{r.side_books ? `Side character in ${r.side_books}` : 'Not in a book yet'}</span>}</span>
            <span>{r.partners ?? <span className="muted">—</span>}</span>
            <span>{r.occupations ?? <span className="muted">—</span>}</span>
            <span>{r.place ?? <span className="muted">—</span>}</span>
          </div>
        ))}
        {shown.length === 0 && <div className="crow"><span className="muted">{rows.length ? 'No characters match.' : 'No characters yet. Import them from Notion or add one above.'}</span></div>}
      </div>
    </div>
  );
}

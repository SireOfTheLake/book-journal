import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDb } from '../../db/DbContext';
import { fold } from '../../domain/search';
import { useLoad } from '../kit';
import { listPeople } from '../queries';

export default function People() {
  const db = useDb();
  const [q, setQ] = useState('');
  const people = useLoad(() => listPeople(db), [db]);
  const shown = useMemo(() => { const t = fold(q.trim()); return (people.data ?? []).filter((p) => !t || fold(p.name).includes(t)).slice(0, 200); }, [people.data, q]);
  return (
    <>
      <div className="ph-top"><h1>PEOPLE</h1></div>
      <div className="ph-search"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a character" aria-label="Find a character" /></div>
      <ul className="ph-list" style={{ marginTop: 8 }}>
        {shown.map((p) => (
          <li key={p.id}><Link to={`/character/${p.id}`} className="ph-item"><div className="grow"><div className="t">{p.name}</div><div className="s">{p.sub}</div></div><span className="ph-go" aria-hidden="true">&#8250;</span></Link></li>
        ))}
      </ul>
      {people.data && !shown.length && <p className="ph-muted ph-small">No characters found.</p>}
    </>
  );
}

import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDb } from '../../db/DbContext';
import { loadSearchIndex } from '../../repo/search';
import { searchAll } from '../../domain/search';
import { useLoad } from '../kit';

// Books, characters and series. Other kinds (authors, narrators, genres) are found through the books and characters they belong to.
const SHOWN = new Set(['book', 'character', 'series', 'author']);

export default function Search() {
  const db = useDb();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const index = useLoad(() => loadSearchIndex(db), [db]);
  const groups = useMemo(() => (index.data ? searchAll(index.data, q, 12).filter((g) => SHOWN.has(g.kind)) : []), [index.data, q]);
  return (
    <>
      <div className="ph-top">
        <button type="button" className="ph-back" aria-label="Back" onClick={() => nav(-1)}>&#8249;</button>
        <div className="ph-search" style={{ flex: 1 }}>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search books, authors, characters" aria-label="Search" />
        </div>
      </div>
      {!q.trim() && <p className="ph-muted ph-small">Type a title, an author or a character&rsquo;s name.</p>}
      {q.trim() && !groups.length && <p className="ph-muted ph-small">No matches.</p>}
      {groups.map((g) => (
        <section key={g.kind}>
          <h2 className="ph-h">{g.title}</h2>
          <ul className="ph-list">
            {g.items.map((i) => {
              const to = i.kind === 'book' ? `/book/${i.id}` : i.kind === 'character' ? `/character/${i.id}` : null;
              const inner = <><div className="grow"><div className="t">{i.label}</div>{i.sub && <div className="s">{i.sub}</div>}</div>{to && <span className="ph-go" aria-hidden="true">&#8250;</span>}</>;
              return <li key={i.kind + i.id}>{to ? <Link to={to} className="ph-item">{inner}</Link> : <div className="ph-item" aria-disabled="true" style={{ opacity: 0.7 }}>{inner}</div>}</li>;
            })}
          </ul>
        </section>
      ))}
    </>
  );
}

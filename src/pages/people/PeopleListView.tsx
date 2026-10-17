import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDuration } from '../../domain/format';
import type { PersonKind, PersonListRow } from '../../repo/people';
import { StarRow } from '../bookLog/parts';

export default function PeopleListView({ kind, rows }: { kind: PersonKind; rows: PersonListRow[] }) {
  const [query, setQuery] = useState('');
  const [favorites, setFavorites] = useState(false);
  const q = query.trim().toLowerCase();
  const shown = rows.filter((r) => (!favorites || r.is_favorite === 1) && (!q || r.name.toLowerCase().includes(q)));
  const author = kind === 'author';
  const word = author ? 'author' : 'narrator';
  return (
    <div className="ledger">
      <div className="bltools">
        <input className="field search2" placeholder={`Find a ${word}`} aria-label={`Find a ${word}`} value={query} onChange={(e) => setQuery(e.target.value)} />
        <button type="button" className={`mini ${favorites ? 'activebtn' : ''}`} aria-pressed={favorites} onClick={() => setFavorites(!favorites)}>Favorites</button>
        <span className="grow" />
        <span className="muted">{shown.length} of {rows.length}</span>
      </div>
      <div className="ltable">
        <div className="prow phead"><span>Name</span><span>{author ? 'Books' : 'Listens'}</span><span>Read</span><span>{author ? 'Average rating' : 'Ratings'}</span><span>{author ? 'Series' : 'Hours'}</span></div>
        {shown.map((r) => (
          <div className="prow" key={r.id}>
            <span><Link className="l ttl" to={`/${word}s/${r.id}`}>{r.name}</Link>{r.is_favorite === 1 && <span className="schip tinychip">Favorite</span>}</span>
            <span>{r.books}</span><span className="muted">{r.read}</span>
            <span>{r.avg_stars === null ? <span className="muted">—</span> : author ? <span className="inline"><StarRow value={Math.round(r.avg_stars * 4) / 4} /><span className="muted">{(Math.round(r.avg_stars * 100) / 100).toString()}</span></span> : <span>{Math.round(r.avg_stars * 100)}% positive</span>}</span>
            <span className="muted">{author ? r.extra : (r.extra ? formatDuration(r.extra) : '—')}</span>
          </div>
        ))}
        {shown.length === 0 && <div className="prow"><span className="muted">{rows.length ? `No ${word}s match.` : `No ${word}s yet. They appear when you import or add books.`}</span></div>}
      </div>
    </div>
  );
}

import { Link } from 'react-router-dom';
import { useDb } from '../../db/DbContext';
import { useSync } from '../../sync/SyncContext';
import { Cover, SyncDot, useLoad } from '../kit';
import { readingNow, recentlyEdited, upNextBooks } from '../queries';

export function syncWord(state: string, last: Date | null) {
  if (state === 'syncing') return 'Syncing';
  if (state === 'problem') return 'Problem';
  if (state === 'signed_out' || state === 'off') return 'Not signed in';
  return last ? 'Synced' : 'Synced';
}

export default function Home() {
  const db = useDb();
  const sync = useSync();
  const reading = useLoad(() => readingNow(db), [db]);
  const next = useLoad(() => upNextBooks(db), [db]);
  const recent = useLoad(() => recentlyEdited(db), [db]);
  return (
    <>
      <div className="ph-top">
        <h1>BOOK JOURNAL</h1>
        <Link to="/sync" className="ph-pill"><SyncDot />{syncWord(sync.state, sync.lastSyncedAt)}</Link>
      </div>
      <Link to="/search" className="ph-search" aria-label="Search books, authors, characters">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
        <span>Search books, authors, characters</span>
      </Link>

      <h2 className="ph-h">Reading now</h2>
      {reading.data?.length === 0 && <p className="ph-muted ph-small">Nothing in progress. Pick a book from Up next, or search for one.</p>}
      {reading.data?.map((b) => (
        <Link key={b.read_id} to={`/book/${b.id}/${b.read_id}`} className="ph-reading">
          <Cover imageId={b.cover_image_id} title={b.title} w={56} h={84} />
          <div className="info">
            <div style={{ fontWeight: 700, fontSize: 16 }}>{b.title}</div>
            <div className="ph-muted ph-small">{b.authors}</div>
            {b.progress !== null && <div className="ph-bar"><i style={{ width: `${Math.round(b.progress * 100)}%` }} /></div>}
            <div className="ph-muted" style={{ fontSize: 12 }}>{b.where}{b.progress !== null ? ` · ${Math.round(b.progress * 100)}%` : ''}</div>
          </div>
        </Link>
      ))}

      <details className="ph-details" style={{ marginTop: 12 }} open>
        <summary><span className="arrow" aria-hidden="true">&#9662;</span>Up next<span className="count">{next.data?.length ?? 0}</span></summary>
        <ul className="ph-list">
          {next.data?.map((b) => (
            <li key={b.id}><Link to={`/book/${b.id}`} className="ph-item">
              <Cover imageId={b.cover_image_id} title={b.title} w={32} h={48} />
              <div className="grow"><div className="t">{b.title}</div><div className="s">{b.authors}</div></div>
            </Link></li>
          ))}
        </ul>
      </details>

      <h2 className="ph-h">Recently edited</h2>
      <ul className="ph-list">
        {recent.data?.map((b) => (
          <li key={b.id}><Link to={`/book/${b.id}`} className="ph-item">
            <Cover imageId={b.cover_image_id} title={b.title} w={32} h={48} />
            <div className="grow"><div className="t">{b.title}</div><div className="s">{b.authors}</div></div>
            {b.label && <span className="ph-badge">{b.label}</span>}
          </Link></li>
        ))}
      </ul>
    </>
  );
}

import { useCallback, useEffect, useState } from 'react';
import type { BookQuery, CoverCandidate, SearchResult } from '../lookup/covers';
import { realCoverDeps, type CoverDeps } from '../lookup/deps';

export const CONFIDENCE_LABEL = { high: 'Strong match', medium: 'Possible match', low: 'Weak match' } as const;
export const SOURCE_LABEL = { openlibrary: 'Open Library', google: 'Google Books' } as const;

// Find a cover for one book: shows what the sources have, best match first. Click one to use it.
export default function CoverFinder({ initial, deps = realCoverDeps, onUse, onClose }:
  { initial: BookQuery; deps?: CoverDeps; onUse: (c: CoverCandidate) => Promise<void>; onClose: () => void }) {
  const [title, setTitle] = useState(initial.title);
  const [author, setAuthor] = useState(initial.authors.join(', '));
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [using, setUsing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (t: string, a: string) => {
    setLoading(true); setError(null);
    try { setResult(await deps.search({ title: t, authors: a.split(',').map((x) => x.trim()).filter(Boolean) })); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); setResult(null); }
    finally { setLoading(false); }
  }, [deps]);
  useEffect(() => { void search(initial.title, initial.authors.join(', ')); }, [search, initial.title, initial.authors]);

  const use = async (c: CoverCandidate) => {
    setUsing(c.id); setError(null);
    try { await onUse(c); onClose(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); setUsing(null); }
  };

  return (
    <div className="overlay" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="dialog wide" role="dialog" aria-modal="true" aria-label="Find cover">
        <h2 className="pagetitle small2">FIND COVER</h2>
        <div className="addrel">
          <input className="field" aria-label="Title to search for" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search(title, author)} />
          <input className="field" aria-label="Author to search for" placeholder="Author" value={author} onChange={(e) => setAuthor(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search(title, author)} />
          <button type="button" className="btn" disabled={loading} onClick={() => search(title, author)}>Search again</button>
        </div>
        {loading && <p className="muted">Searching Open Library and Google Books...</p>}
        {error && <div className="muted" role="alert">{error}</div>}
        {result?.errors.map((m) => <div key={m} className="muted small" role="alert">{m}</div>)}
        {result && !loading && result.candidates.length === 0 && <p className="muted">No covers found. Try a shorter title or a different author, or add a picture from a file or a link.</p>}
        <div className="candgrid">
          {result?.candidates.map((c) => (
            <div key={c.id} className={`cand ${c.confidence}`}>
              <img src={c.thumbUrl} alt={`Cover of ${c.title}`} loading="lazy" />
              <b className="candtitle">{c.title}</b>
              <span className="muted small">{c.authors.slice(0, 2).join(', ') || 'Unknown author'}{c.year ? ` · ${c.year}` : ''}</span>
              <span className="muted small">{SOURCE_LABEL[c.source]} · {CONFIDENCE_LABEL[c.confidence]}</span>
              <button type="button" className="mini" disabled={using !== null} onClick={() => use(c)}>{using === c.id ? 'Saving...' : 'Use this cover'}</button>
            </div>
          ))}
        </div>
        <div className="actions"><span className="grow" /><button type="button" className="btn" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}

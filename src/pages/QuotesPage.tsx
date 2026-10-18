import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDb } from '../db/DbContext';
import { useFeatures } from '../features/FeaturesContext';
import { deleteQuote, listAllQuotes, setQuoteFavorite, updateQuote, type QuoteWithBook } from '../repo/quotes';
import { QuoteItem, type QuoteActions } from './bookLog/QuotesCard';

// Every quote from every book, newest first. Search, or show only the favorites.
export default function QuotesPage() {
  const db = useDb();
  const { flags } = useFeatures();
  const [rows, setRows] = useState<QuoteWithBook[] | null>(null);
  const [query, setQuery] = useState('');
  const [favOnly, setFavOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => setRows(await listAllQuotes(db)), [db]);
  useEffect(() => { reload().catch((e) => setError(String(e))); }, [reload]);
  const act = useMemo<QuoteActions>(() => {
    const run = async (fn: () => Promise<unknown>) => { try { await fn(); await reload(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } };
    return { add: async () => undefined, update: async (id, i) => { await updateQuote(db, id, i); await reload(); }, favorite: (id, f) => void run(() => setQuoteFavorite(db, id, f)), remove: (id) => void run(() => deleteQuote(db, id)) };
  }, [db, reload]);
  const q = query.trim().toLowerCase();
  const shown = (rows ?? []).filter((r) => (!favOnly || r.is_favorite) && (!q || `${r.text} ${r.note ?? ''} ${r.title} ${r.authors ?? ''}`.toLowerCase().includes(q)));
  if (!flags.quotes) return <section><h1 className="pagetitle">QUOTES</h1><p className="muted">Quotes are switched off. Turn them on in Settings, under Features.</p></section>;
  return (
    <section>
      <h1 className="pagetitle">QUOTES <span className="muted small">Passages worth keeping</span></h1>
      {error && <div className="bcard warn" role="alert">{error} <button type="button" className="mini" onClick={() => setError(null)}>Dismiss</button></div>}
      <div className="bltools">
        <input className="field search2" placeholder="Search quotes, titles or authors" aria-label="Search quotes" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button type="button" className="btn" aria-pressed={favOnly} onClick={() => setFavOnly(!favOnly)}>{favOnly ? 'Showing favorites' : 'Favorites only'}</button>
      </div>
      <div className="bcard">
        {rows === null ? <p className="muted">Loading...</p> : shown.length === 0 ? <p className="muted">{rows.length === 0 ? 'No quotes yet. Add them from a book’s page.' : 'No quotes match.'}</p> : (
          <ul className="quotelist">{shown.map((r) => <QuoteItem key={r.id} q={r} act={act} title={{ text: `${r.title}${r.authors ? ` — ${r.authors}` : ''}`, to: `/book/${r.book_id}` }} />)}</ul>
        )}
      </div>
    </section>
  );
}

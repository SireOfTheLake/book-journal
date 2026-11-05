import { useEffect, useState } from 'react';
import { useDb } from '../../db/DbContext';
import { listAllQuotes, type QuoteWithBook } from '../../repo/quotes';
import { listSeriesLedger, type LedgerRow } from '../../repo/series';
import { quotePlace } from '../bookLog/QuotesCard';
import LedgerView from '../series/LedgerView';

/** One page of the series ledger: the series assigned to this page, then the key. */
export function LedgerPrint({ ids, part, parts }: { ids: string[]; part: number; parts: number }) {
  const db = useDb();
  const [rows, setRows] = useState<LedgerRow[] | null>(null);
  useEffect(() => { let live = true; listSeriesLedger(db).then((r) => live && setRows(r), () => undefined); return () => { live = false; }; }, [db]);
  if (!rows) return <p className="muted">Loading...</p>;
  const all = rows.map((r) => r.id);
  const mine = ids.map((id) => rows.find((r) => r.id === id)).filter((r): r is LedgerRow => !!r);
  return (
    <section className="pledger">
      <h1 className="pagetitle">SERIES LEDGER <span className="muted small">{parts > 1 ? `Page ${part + 1} of ${parts}` : 'Every series at a glance'}</span></h1>
      <LedgerView rows={mine} onCreate={() => undefined} colorOffset={ids.length ? Math.max(0, all.indexOf(ids[0])) : 0} />
    </section>
  );
}

/** One page of favorite passages, grouped under the book they came from. */
export function QuotesPrint({ ids, part, parts }: { ids: string[]; part: number; parts: number }) {
  const db = useDb();
  const [rows, setRows] = useState<QuoteWithBook[] | null>(null);
  useEffect(() => { let live = true; listAllQuotes(db).then((r) => live && setRows(r), () => undefined); return () => { live = false; }; }, [db]);
  if (!rows) return <p className="muted">Loading...</p>;
  const mine = ids.map((id) => rows.find((r) => r.id === id)).filter((r): r is QuoteWithBook => !!r);
  return (
    <section className="pquotes">
      <h1 className="pagetitle">QUOTES <span className="muted small">{parts > 1 ? `Page ${part + 1} of ${parts}` : 'Passages worth keeping'}</span></h1>
      {mine.map((q, i) => (
        <div key={q.id} className="pq">
          {(i === 0 || mine[i - 1].book_id !== q.book_id) && <h2 className="pq-book">{q.title}{q.authors ? <span className="muted"> {'—'} {q.authors}</span> : null}</h2>}
          <blockquote className="pq-text">{q.text}</blockquote>
          <div className="pq-meta small">
            {q.character_name && <span className="pq-who">{'—'} {q.character_name}</span>}
            {quotePlace(q) && <span className="muted">{quotePlace(q)}</span>}
            {q.is_favorite ? <span className="pq-fav">{'★'} favorite</span> : null}
            {q.note && <span className="muted">{q.note}</span>}
          </div>
        </div>
      ))}
    </section>
  );
}

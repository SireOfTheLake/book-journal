import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDb } from '../db/DbContext';
import { saveBulk, searchBulk, type BulkBook, type BulkRow, type SaveOutcome } from '../lookup/bulk';
import { realCoverDeps, type CoverDeps } from '../lookup/deps';
import { setBookCover } from '../repo/bookLog';
import { listBooksForCovers } from '../repo/covers';
import CoverFinder, { CONFIDENCE_LABEL, SOURCE_LABEL } from '../ui/CoverFinder';

type Stage = 'idle' | 'searching' | 'review' | 'saving' | 'done';
type Filter = 'all' | 'attention' | 'none';

// Bulk fill: look up covers for many books, review what was found, then save the ones you tick.
export default function CoversImport({ deps = realCoverDeps, delayMs = 250 }: { deps?: CoverDeps; delayMs?: number }) {
  const db = useDb();
  const [books, setBooks] = useState<BulkBook[] | null>(null);
  const [withCover, setWithCover] = useState(false);
  const [stage, setStage] = useState<Stage>('idle');
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number; current: string }>({ done: 0, total: 0, current: '' });
  const [filter, setFilter] = useState<Filter>('all');
  const [outcome, setOutcome] = useState<SaveOutcome | null>(null);
  const [finding, setFinding] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const load = useCallback(async () => setBooks(await listBooksForCovers(db, { includeWithCover: withCover })), [db, withCover]);
  useEffect(() => { load().catch((e) => setError(String(e))); }, [load]);

  async function start() {
    if (!books?.length) return;
    setError(null); setStage('searching'); abort.current = new AbortController();
    try {
      const found = await searchBulk(books, { search: deps.search, delayMs, signal: abort.current.signal, onProgress: (done, total, b) => setProgress({ done, total, current: b?.title ?? '' }) });
      setRows(found); setFilter('all'); setStage('review');
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setStage('idle'); }
  }

  const update = (i: number, patch: Partial<BulkRow>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const counts = useMemo(() => ({
    ticked: rows.filter((r) => r.include && r.chosen >= 0).length,
    strong: rows.filter((r) => r.candidates[0]?.confidence === 'high').length,
    possible: rows.filter((r) => r.status === 'found' && r.candidates[0]?.confidence !== 'high').length,
    none: rows.filter((r) => r.status === 'none').length,
    failed: rows.filter((r) => r.status === 'failed').length,
  }), [rows]);
  const shown = rows.map((r, i) => ({ r, i })).filter(({ r }) => filter === 'all' || (filter === 'none' ? r.status !== 'found' : r.status === 'found' && !r.include));

  async function save() {
    setStage('saving'); setProgress({ done: 0, total: counts.ticked, current: '' });
    const out = await saveBulk(rows, { download: deps.download, save: (id, img) => setBookCover(db, id, img), onProgress: (done, total) => setProgress({ done, total, current: '' }) });
    setOutcome(out); setStage('done');
  }

  if (error && stage === 'idle') return <div className="bcard warn" role="alert">{error}</div>;
  if (!books) return <p className="muted">Loading...</p>;

  return (
    <div className="importbox">
      {stage === 'idle' && (
        <div className="bcard">
          <span className="lbl2">Fill in covers</span>
          <p>{books.length === 0 ? (withCover ? 'You have no books yet.' : 'Every book already has a cover.') : <>This will look up covers for <b>{books.length}</b> {books.length === 1 ? 'book' : 'books'}{withCover ? '' : ' that have none'} on Open Library and Google Books. Nothing is saved until you have looked over the results and chosen which to keep.</>}</p>
          <label className="inline"><input type="checkbox" checked={withCover} onChange={(e) => setWithCover(e.target.checked)} /><span className="muted">Include books that already have a cover</span></label>
          <div className="actions"><button type="button" className="btn on" disabled={books.length === 0} onClick={start}>Find covers</button></div>
          <span className="muted small">It looks up one book at a time, so a long list takes a few minutes. You can cancel and review what it has found so far.</span>
        </div>
      )}

      {stage === 'searching' && (
        <div className="bcard" role="status">
          <span className="lbl2">Looking up covers</span>
          <progress value={progress.done} max={progress.total || 1} aria-label="Search progress" />
          <span>{`${progress.done} of ${progress.total}`}{progress.current ? ` · ${progress.current}` : ''}</span>
          <div className="actions"><button type="button" className="btn" onClick={() => abort.current?.abort()}>Stop and review what was found</button></div>
        </div>
      )}

      {stage === 'review' && (
        <>
          <div className="bcard">
            <div className="statrow4">
              <div className="stat"><span className="lbl2">Strong matches</span><span className="big">{counts.strong}</span></div>
              <div className="stat"><span className="lbl2">Possible</span><span className="big">{counts.possible}</span></div>
              <div className="stat"><span className="lbl2">Not found</span><span className="big">{counts.none}</span></div>
              <div className="stat"><span className="lbl2">Could not search</span><span className="big">{counts.failed}</span></div>
            </div>
            <span className="muted small">Strong matches are ticked for you. Check anything else yourself, click a different picture to swap it, or search again for one book.</span>
            <div className="bltools">
              <select aria-label="Show" value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
                <option value="all">All {rows.length} books</option><option value="attention">Found, but not ticked</option><option value="none">Not found or failed</option>
              </select>
              <button type="button" className="mini" onClick={() => setRows((rs) => rs.map((r) => ({ ...r, include: r.chosen >= 0 && r.candidates[r.chosen].confidence === 'high' })))}>Tick strong matches only</button>
              <button type="button" className="mini" onClick={() => setRows((rs) => rs.map((r) => ({ ...r, include: r.chosen >= 0 })))}>Tick everything found</button>
              <button type="button" className="mini" onClick={() => setRows((rs) => rs.map((r) => ({ ...r, include: false })))}>Tick nothing</button>
              <span className="grow" />
              <button type="button" className="btn" onClick={() => { setStage('idle'); void load(); }}>Start over</button>
              <button type="button" className="btn on" disabled={counts.ticked === 0} onClick={save}>{`Save ${counts.ticked} ${counts.ticked === 1 ? 'cover' : 'covers'}`}</button>
            </div>
          </div>
          <div className="ltable">
            {shown.map(({ r, i }) => {
              const c = r.chosen >= 0 ? r.candidates[r.chosen] : null;
              return (
                <div className="covrow" key={r.book.id}>
                  <input type="checkbox" aria-label={`Save the cover for ${r.book.title}`} checked={r.include} disabled={!c} onChange={(e) => update(i, { include: e.target.checked })} />
                  <div className="covbook"><b>{r.book.title}</b><span className="muted small">{r.book.authors.join(', ') || 'No author'}</span></div>
                  {c ? (
                    <>
                      <img className="covthumb" src={c.thumbUrl} alt={`Proposed cover for ${r.book.title}`} loading="lazy" />
                      <div className="covinfo"><b className="candtitle">{c.title}</b><span className="muted small">{c.authors.slice(0, 2).join(', ')}{c.year ? ` · ${c.year}` : ''}</span><span className={`conf ${c.confidence}`}>{CONFIDENCE_LABEL[c.confidence]}</span><span className="muted small">{SOURCE_LABEL[c.source]}</span></div>
                      <div className="covalts">{r.candidates.map((a, k) => k === r.chosen ? null : <button type="button" key={a.id} className="altbtn" title={`${a.title} (${SOURCE_LABEL[a.source]})`} aria-label={`Use ${a.title} instead`} onClick={() => update(i, { chosen: k, include: true })}><img src={a.thumbUrl} alt="" loading="lazy" /></button>)}</div>
                    </>
                  ) : <div className="covnone muted">{r.status === 'failed' ? `Could not search: ${r.errors[0] ?? 'unknown error'}` : 'No cover found'}</div>}
                  <button type="button" className="mini" onClick={() => setFinding(i)}>Search again</button>
                </div>
              );
            })}
            {shown.length === 0 && <div className="covrow"><span className="muted">Nothing to show with this filter.</span></div>}
          </div>
        </>
      )}

      {stage === 'saving' && (
        <div className="bcard" role="status"><span className="lbl2">Saving covers</span><progress value={progress.done} max={progress.total || 1} aria-label="Save progress" /><span>{`${progress.done} of ${progress.total}`}</span></div>
      )}

      {stage === 'done' && outcome && (
        <div className="bcard">
          <span className="lbl2">Done</span>
          <p><b>{outcome.saved}</b> {outcome.saved === 1 ? 'cover was' : 'covers were'} saved.{outcome.failed.length > 0 && <> <b>{outcome.failed.length}</b> could not be downloaded:</>}</p>
          {outcome.failed.map((f) => <div key={f.title} className="muted small">{f.title}: {f.reason}</div>)}
          <div className="actions"><button type="button" className="btn on" onClick={() => { setStage('idle'); setOutcome(null); void load(); }}>Back</button><Link className="btn" to="/journal/book-list">Go to the Book List</Link></div>
        </div>
      )}

      {finding !== null && rows[finding] && (
        <CoverFinder initial={{ title: rows[finding].book.title, authors: rows[finding].book.authors }} deps={deps} onClose={() => setFinding(null)}
          onUse={async (c) => { const i = finding; const existing = rows[i].candidates.findIndex((x) => x.id === c.id); update(i, existing >= 0 ? { chosen: existing, include: true, status: 'found' } : { candidates: [c, ...rows[i].candidates], chosen: 0, include: true, status: 'found' }); }} />
      )}
    </div>
  );
}

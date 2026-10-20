import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { makeBackup } from '../backup/backup';
import { useBackupEnv } from '../backup/context';
import { isTauri } from '../db/tauriDb';
import { useDb } from '../db/DbContext';
import { undoImport } from '../import/apply';
import { applyBookCsv, parseBookCsv, reviewBookCsv, templateCsv, type BookCsvResult, type BookCsvReview, type Decision, type EntityReview, type Existing, type ParsedCsv } from '../import/bookCsv';

type Decisions = Record<string, Decision | undefined>;
type Shelf = '' | 'tbr' | 'up_next';

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="stat"><span className="lbl2">{label}</span><span className="big">{value}</span></div>;
}

// One author or series from the file, once, however many books use it.
function EntityList({ noun, items, decisions, set, options }: { noun: 'author' | 'series'; items: EntityReview[]; decisions: Decisions; set: (key: string, d: Decision | undefined) => void; options: Existing[] }) {
  const listId = `csv-existing-${noun}`;
  const undecided = items.filter((i) => !decisions[i.key]);
  if (!items.length) return null;
  return (
    <div className="card">
      <span className="lbl2">{noun === 'author' ? 'Authors' : 'Series'}</span>
      <datalist id={listId}>{options.map((o) => <option key={o.id} value={o.name} />)}</datalist>
      {undecided.length > 1 && (
        <div className="actions"><button type="button" className="btn" onClick={() => undecided.forEach((i) => set(i.key, { kind: 'new' }))}>{`Create all ${undecided.length} new ${noun === 'author' ? 'authors' : 'series'}`}</button></div>
      )}
      {items.map((i) => {
        const d = decisions[i.key];
        return (
          <div className="csvent" key={i.key}>
            <span className="grow"><b>{i.typed}</b> <span className="muted small">{`${i.count} ${i.count === 1 ? 'book' : 'books'}`}</span></span>
            {d?.kind === 'existing' && (
              <>
                <span className="muted" aria-label={`${i.typed} status`}>{`Existing ${noun}${d.name !== i.typed ? `: ${d.name}` : ''}`}{noun === 'series' && i.by?.length ? ` (by ${i.by.join(', ')})` : ''}</span>
                <button type="button" className="mini" onClick={() => set(i.key, { kind: 'new' })}>{`Make it a new ${noun} instead`}</button>
              </>
            )}
            {d?.kind === 'new' && (
              <>
                <span className="newtag" aria-label={`${i.typed} status`}>{`New ${noun}: will be created`}</span>
                <button type="button" className="mini" onClick={() => set(i.key, i.match ? { kind: 'existing', id: i.match.id, name: i.match.name } : undefined)}>Undo</button>
              </>
            )}
            {!d && (
              <>
                <span className="newtag" aria-label={`${i.typed} status`}>{`New ${noun}: not in your journal yet`}</span>
                <button type="button" className="btn on" onClick={() => set(i.key, { kind: 'new' })}>{`Create new ${noun}`}</button>
                <input list={listId} placeholder="or pick an existing one" aria-label={`Use an existing ${noun} for ${i.typed}`}
                  onChange={(e) => { const m = options.find((o) => o.name === e.target.value); if (m) set(i.key, { kind: 'existing', id: m.id, name: m.name }); }} />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

async function saveTemplate(getEnv: ReturnType<typeof useBackupEnv>) {
  const text = templateCsv();
  if (isTauri()) {
    const env = await getEnv();
    const target = await env.pickSavePath('book-list-template.csv', 'CSV', 'csv');
    if (target) await env.writeText(target, text);
    return;
  }
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url; a.download = 'book-list-template.csv'; a.click();
  URL.revokeObjectURL(url);
}

export default function BookCsvImport() {
  const db = useDb();
  const getBackupEnv = useBackupEnv();
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [review, setReview] = useState<BookCsvReview | null>(null);
  const [authorDec, setAuthorDec] = useState<Decisions>({});
  const [seriesDec, setSeriesDec] = useState<Decisions>({});
  const [off, setOff] = useState<Record<number, boolean>>({}); // rows the person ticked off (or that start off, like duplicates)
  const [shelf, setShelf] = useState<Shelf>('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [result, setResult] = useState<BookCsvResult | null>(null);
  const [undone, setUndone] = useState(false);

  async function choose(file: File | undefined) {
    setError(null); setResult(null); setUndone(false); setReview(null); setParsed(null);
    if (!file) return;
    try {
      const p = parseBookCsv(await file.text());
      if (p.missingTitleColumn) throw new Error('That file has no Title column. Start from the example file (Download example CSV) and keep its first row.');
      if (!p.books.length) throw new Error('No books were found in that file.');
      const r = await reviewBookCsv(db, p.books);
      setFileName(file.name); setParsed(p); setReview(r);
      setAuthorDec(Object.fromEntries(r.authors.filter((a) => a.match).map((a) => [a.key, { kind: 'existing', id: a.match!.id, name: a.match!.name } as Decision])));
      setSeriesDec(Object.fromEntries(r.series.filter((s) => s.match).map((s) => [s.key, { kind: 'existing', id: s.match!.id, name: s.match!.name } as Decision])));
      setOff(Object.fromEntries(r.rows.filter((x) => x.duplicateOf || !x.title).map((x) => [x.index, true])));
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  const included = useMemo(() => (review?.rows ?? []).filter((r) => r.title && !off[r.index]), [review, off]);
  const usedAuthors = useMemo(() => new Set(included.flatMap((r) => r.authorKeys)), [included]);
  const usedSeries = useMemo(() => new Set(included.flatMap((r) => (r.seriesKey ? [r.seriesKey] : []))), [included]);
  const authorItems = useMemo(() => (review?.authors ?? []).filter((a) => usedAuthors.has(a.key)).map((a) => ({ ...a, count: included.filter((r) => r.authorKeys.includes(a.key)).length })), [review, usedAuthors, included]);
  const seriesItems = useMemo(() => (review?.series ?? []).filter((s) => usedSeries.has(s.key)).map((s) => ({ ...s, count: included.filter((r) => r.seriesKey === s.key).length })), [review, usedSeries, included]);
  const waiting = authorItems.filter((a) => !authorDec[a.key]).length + seriesItems.filter((s) => !seriesDec[s.key]).length;

  const badge = (dec: Decision | undefined, noun: string) => (dec?.kind === 'existing' ? <span className="muted small">{`existing ${noun}`}</span> : dec?.kind === 'new' ? <span className="newtag small">{`new ${noun}`}</span> : <span className="newtag small">{`new ${noun}?`}</span>);

  async function run() {
    if (!review) return;
    setError(null); setProgress([0, included.length]);
    try { await makeBackup(db, await getBackupEnv(), 'before-import'); }
    catch (e) { setError(`A backup could not be made first, so nothing was imported. (${e instanceof Error ? e.message : String(e)})`); setProgress(null); return; }
    try {
      setResult(await applyBookCsv(db, {
        rows: included, authors: authorDec, series: seriesDec, shelf: shelf || null,
        authorNames: Object.fromEntries(review.authors.map((a) => [a.key, a.typed])), seriesNames: Object.fromEntries(review.series.map((s) => [s.key, s.typed])),
        onProgress: (d, t) => setProgress([d, t]),
      }));
    } catch (e) { setError(`The import stopped part way: ${e instanceof Error ? e.message : String(e)}. You can undo it from this page and try again.`); }
    setProgress(null);
  }

  return (
    <div className="import">
      <div className="card">
        <span className="lbl2">1. Get the example file, fill it in, and choose it</span>
        <p className="muted">The columns are <b>Title, Author, Series, Position, Page Number</b> and <b>Copies I Own</b> (Physical, Audio or Ebook; put more than one with a semicolon, like <i>Physical; Audio</i>). Only Title is required. Two authors go in one cell with a semicolon. Nothing is saved until you press Import.</p>
        <div className="actions">
          <button type="button" className="btn" onClick={() => saveTemplate(getBackupEnv).then(() => setSaved('Example file saved.'), (e) => setError(String(e)))}>Download example CSV</button>
          {saved && <span className="muted" role="status">{saved}</span>}
        </div>
        <input type="file" accept=".csv,text/csv" aria-label="Book list CSV" onChange={(e) => choose(e.target.files?.[0])} />
        {fileName && review && <span className="muted">Read {fileName}</span>}
      </div>
      {error && <div className="card warn" role="alert">{error}</div>}

      {review && parsed && !result && (
        <>
          <div className="card">
            <span className="lbl2">2. Review</span>
            <div className="stats">
              <Stat label="Books in file" value={review.rows.length} /><Stat label="Will be added" value={included.length} />
              <Stat label="Already there" value={review.rows.filter((r) => r.duplicateOf).length} /><Stat label="Names to decide" value={waiting} />
            </div>
            {parsed.ignoredColumns.length > 0 && <p className="muted small">{`Columns not used: ${parsed.ignoredColumns.join(', ')}.`}</p>}
          </div>

          <EntityList noun="author" items={authorItems} decisions={authorDec} options={review.authorOptions} set={(k, d) => setAuthorDec((x) => ({ ...x, [k]: d }))} />
          <EntityList noun="series" items={seriesItems} decisions={seriesDec} options={review.seriesOptions} set={(k, d) => setSeriesDec((x) => ({ ...x, [k]: d }))} />

          <div className="card">
            <span className="lbl2">Books</span>
            <table className="table csvrows">
              <thead><tr><th>Add</th><th>Row</th><th>Title</th><th>Author</th><th>Series</th><th>Pages</th><th>Copies</th><th>Notes</th></tr></thead>
              <tbody>{review.rows.map((r) => (
                <tr key={r.index} className={!r.title || off[r.index] ? 'off' : ''}>
                  <td><input type="checkbox" aria-label={`Add row ${r.index}`} disabled={!r.title} checked={!!r.title && !off[r.index]} onChange={() => setOff((o) => ({ ...o, [r.index]: !o[r.index] }))} /></td>
                  <td className="muted">{r.index}</td>
                  <td className="l">{r.title || <span className="newtag">No title</span>}</td>
                  <td className="l">{r.authors.length ? r.authors.map((a, n) => <div key={a}>{a} {badge(authorDec[r.authorKeys[n]], 'author')}</div>) : '—'}</td>
                  <td className="l">{r.series ? <div>{r.series}{r.position !== null ? ` #${r.position}` : ''} {badge(seriesDec[r.seriesKey!], 'series')}</div> : '—'}</td>
                  <td>{r.pages ?? '—'}</td>
                  <td>{[r.copies.physical && 'Physical', r.copies.audio && 'Audio', r.copies.ebook && 'Ebook'].filter(Boolean).join(', ') || '—'}</td>
                  <td className="small">{r.duplicateOf && <div className="newtag">{r.duplicateOf}</div>}{r.warnings.map((w) => <div key={w} className="muted">{w}</div>)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>

          <div className="card">
            <label className="stack"><span className="lbl2">Put these books on</span>
              <select aria-label="Put these books on" value={shelf} onChange={(e) => setShelf(e.target.value as Shelf)}>
                <option value="">Just the library (not started)</option><option value="tbr">The TBR shelf</option><option value="up_next">The Up Next shelf</option>
              </select>
            </label>
          </div>

          <div className="actions">
            <button type="button" className="btn on" disabled={progress !== null || included.length === 0 || waiting > 0} onClick={run}>
              {progress ? `Importing ${progress[0]} of ${progress[1]}...` : `Import ${included.length} ${included.length === 1 ? 'book' : 'books'}`}
            </button>
            {waiting > 0 && <span className="muted">{`${waiting} ${waiting === 1 ? 'name still needs' : 'names still need'} an answer above.`}</span>}
          </div>
        </>
      )}

      {result && (
        <div className="card">
          <span className="lbl2">{undone ? 'Import undone' : 'Imported'}</span>
          {undone ? <p>Everything from that import has been removed.</p> : (
            <>
              <div className="stats">
                <Stat label="Books added" value={result.booksCreated} /><Stat label="New authors" value={result.authorsCreated} /><Stat label="New series" value={result.seriesCreated} />
              </div>
              <div className="actions">
                <Link className="btn on" to="/library">See the Library</Link>
                <button type="button" className="btn" onClick={async () => { await undoImport(db, result.batchId); setUndone(true); }}>Undo this import</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

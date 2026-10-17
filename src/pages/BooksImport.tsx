import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { makeBackup } from '../backup/backup';
import { useBackupEnv } from '../backup/context';
import { useDb } from '../db/DbContext';
import { applyNotionPlan, undoImport, type ImportResult } from '../import/apply';
import { planNotionBooks, type ImportPlan, type TagDestination } from '../import/notion';

const DEST: { value: TagDestination; label: string }[] = [
  { value: 'genre', label: 'Genre' },
  { value: 'theme', label: 'Theme' },
  { value: 'trope', label: 'Trope' },
  { value: 'universe', label: 'Universe' },
  { value: 'ignore', label: 'Skip this tag' },
];

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="stat"><span className="lbl2">{label}</span><span className="big">{value}</span></div>;
}

export default function BooksImport() {
  const db = useDb();
  const getBackupEnv = useBackupEnv();
  const [fileName, setFileName] = useState<string | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [dest, setDest] = useState<Record<string, TagDestination>>({});
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [undone, setUndone] = useState(false);

  const stats = useMemo(() => {
    if (!plan) return null;
    const uniq = (xs: string[]) => new Set(xs.map((x) => x.toLowerCase())).size;
    const chars = new Set(plan.rows.flatMap((r) => [...r.main, ...r.side]).map((c) => c.notionId ?? c.rawName));
    return {
      books: plan.rows.length,
      finished: plan.rows.filter((r) => r.finishDate).length,
      upNext: plan.rows.filter((r) => r.shelf === 'up_next').length,
      tbr: plan.rows.filter((r) => r.shelf === 'tbr').length,
      authors: uniq(plan.rows.flatMap((r) => r.authors)),
      narrators: uniq(plan.rows.flatMap((r) => r.narrators)),
      series: uniq(plan.rows.flatMap((r) => (r.series ? [r.series] : []))),
      characters: chars.size,
    };
  }, [plan]);

  async function choose(file: File | undefined) {
    setError(null); setResult(null); setUndone(false); setPlan(null);
    if (!file) return;
    try {
      const p = planNotionBooks(await file.text());
      if (p.rows.length === 0) throw new Error('No books were found in that file. Is it the Notion books export (CSV)?');
      setFileName(file.name);
      setPlan(p);
      setDest(Object.fromEntries(p.tags.map((t) => [t.tag.toLowerCase(), t.suggested])));
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  async function run() {
    if (!plan) return;
    setError(null); setProgress([0, plan.rows.length]);
    // A safety copy of everything, taken first, so an import can always be rolled back by restoring it.
    try { await makeBackup(db, await getBackupEnv(), 'before-import'); }
    catch (e) { setError(`A backup could not be made first, so nothing was imported. (${e instanceof Error ? e.message : String(e)})`); setProgress(null); return; }
    try {
      setResult(await applyNotionPlan(db, plan, { tagDestinations: dest, onProgress: (d, t) => setProgress([d, t]) }));
    } catch (e) { setError(`The import stopped part way: ${e instanceof Error ? e.message : String(e)}. You can undo it from this page and try again.`); }
    setProgress(null);
  }

  async function undo() {
    if (!result) return;
    await undoImport(db, result.batchId);
    setUndone(true);
  }

  return (
    <div className="import">
      <div className="card">
        <span className="lbl2">1. Choose the books file</span>
        <p className="muted">In Notion, export your books database as Markdown &amp; CSV, then pick the <b>.csv</b> file here. Nothing is saved until you press Import.</p>
        <input type="file" accept=".csv" aria-label="Notion books CSV" onChange={(e) => choose(e.target.files?.[0])} />
        {fileName && plan && <span className="muted">Read {fileName}</span>}
      </div>
      {error && <div className="card warn" role="alert">{error}</div>}

      {plan && stats && !result && (
        <>
          <div className="card">
            <span className="lbl2">2. Review</span>
            <div className="stats">
              <Stat label="Books" value={stats.books} /><Stat label="Finished" value={stats.finished} />
              <Stat label="Up Next" value={stats.upNext} /><Stat label="TBR" value={stats.tbr} />
              <Stat label="Authors" value={stats.authors} /><Stat label="Narrators" value={stats.narrators} />
              <Stat label="Series" value={stats.series} /><Stat label="Characters" value={stats.characters} />
            </div>
          </div>
          {plan.warnings.length > 0 && (
            <div className="card warn">
              <span className="lbl2">Worth a look</span>
              {plan.warnings.map((w, i) => <div key={i}>{w.title ? <b>{w.title}: </b> : null}{w.message}</div>)}
            </div>
          )}
          {plan.tags.length > 0 && (
            <div className="card">
              <span className="lbl2">Tags to sort</span>
              <p className="muted">Each Notion tag becomes a genre, theme, trope, or universe. These are suggestions; change any of them. The &quot;tbr&quot; tag is already treated as the TBR shelf.</p>
              {plan.tags.map((t) => (
                <div className="tagrow" key={t.tag}>
                  <span className="chip">{t.tag}</span><span className="muted">{t.count} {t.count === 1 ? 'book' : 'books'}</span>
                  <span className="spacer" />
                  <select aria-label={`Destination for ${t.tag}`} value={dest[t.tag.toLowerCase()]} onChange={(e) => setDest({ ...dest, [t.tag.toLowerCase()]: e.target.value as TagDestination })}>
                    {DEST.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}
          <div className="card">
            <span className="lbl2">First rows</span>
            <table className="table">
              <thead><tr><th>Title</th><th>Authors</th><th>Finished</th><th>Format</th><th>Series</th></tr></thead>
              <tbody>{plan.rows.slice(0, 8).map((r) => (
                <tr key={r.index}><td className="l">{r.title}</td><td>{r.authors.join(', ') || '—'}</td>
                  <td className="muted">{r.finishDate ?? (r.shelf === 'tbr' ? 'TBR' : 'Up Next')}</td><td>{r.format ?? '—'}</td><td>{r.series ?? '—'}</td></tr>
              ))}</tbody>
            </table>
          </div>
          <div className="actions">
            <button type="button" className="btn on" disabled={progress !== null} onClick={run}>
              {progress ? `Importing ${progress[0]} of ${progress[1]}...` : `Import ${stats.books} books`}
            </button>
            <span className="muted">Importing the same file twice adds nothing new.</span>
          </div>
        </>
      )}

      {result && (
        <div className="card">
          <span className="lbl2">{undone ? 'Import undone' : 'Imported'}</span>
          {undone ? <p>Everything from that import has been removed.</p> : (
            <>
              <div className="stats">
                <Stat label="Books added" value={result.booksCreated} /><Stat label="Already there" value={result.booksReused} />
                <Stat label="Reads" value={result.readsCreated} /><Stat label="Authors" value={result.authorsCreated} />
                <Stat label="Narrators" value={result.narratorsCreated} /><Stat label="Series" value={result.seriesCreated} />
                <Stat label="Characters" value={result.charactersCreated} /><Stat label="Genres, themes, tropes" value={result.listItemsCreated} />
              </div>
              <div className="actions">
                <Link className="btn on" to="/journal/book-list">See the Book List</Link>
                <button type="button" className="btn" onClick={undo}>Undo this import</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

import { useMemo, useState } from 'react';
import { makeBackup } from '../backup/backup';
import { useBackupEnv } from '../backup/context';
import { useDb } from '../db/DbContext';
import { applyPdfJournal, parseTranscription, planPdfJournal, type NotesChoice, type PdfPlan, type PdfResult } from '../import/pdfJournal';
import { undoImport } from '../import/writer';

const KIND = { 'new-book': 'New book', 'new-read': 'New read of a book you have', match: 'Matches a read you have' } as const;

export default function JournalImport() {
  const db = useDb();
  const getBackupEnv = useBackupEnv();
  const [fileName, setFileName] = useState<string | null>(null);
  const [plan, setPlan] = useState<PdfPlan | null>(null);
  const [skip, setSkip] = useState<Set<number>>(new Set());
  const [notes, setNotes] = useState<Map<number, NotesChoice>>(new Map());
  const [finished, setFinished] = useState<Map<number, string | null>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [result, setResult] = useState<PdfResult | null>(null);
  const [undone, setUndone] = useState(false);

  const stats = useMemo(() => {
    if (!plan) return null;
    const on = plan.entries.filter((p) => !skip.has(p.index));
    return {
      pages: on.length, created: on.filter((p) => p.kind === 'new-book').length, matched: on.filter((p) => p.kind !== 'new-book').length,
      withNotes: on.filter((p) => p.entry.notes).length, problems: on.filter((p) => p.problems.length).length,
    };
  }, [plan, skip]);

  async function choose(file: File | undefined) {
    setError(null); setResult(null); setUndone(false); setPlan(null);
    if (!file) return;
    try {
      const t = parseTranscription(await file.text());
      if (!t.entries.length) throw new Error('No journal pages were found in that file.');
      const p = await planPdfJournal(db, t);
      setFileName(file.name); setPlan(p); setSkip(new Set()); setNotes(new Map()); setFinished(new Map());
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  async function run() {
    if (!plan) return;
    setError(null); setProgress([0, plan.entries.length]);
    try { await makeBackup(db, await getBackupEnv(), 'before-import'); }
    catch (e) { setError(`A backup could not be made first, so nothing was imported. (${e instanceof Error ? e.message : String(e)})`); setProgress(null); return; }
    try { setResult(await applyPdfJournal(db, plan, { skip, notes, finished }, (d, t) => setProgress([d, t]))); }
    catch (e) { setError(`The import stopped part way: ${e instanceof Error ? e.message : String(e)}. You can undo it from this page and try again.`); }
    setProgress(null);
  }

  const toggle = (i: number) => setSkip((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; });

  return (
    <div className="import">
      <div className="card">
        <span className="lbl2">1. Choose the transcription file</span>
        <p className="muted">Handwriting cannot be read inside the app, so your journal pages are transcribed into a <b>.json</b> file first. Pick that file here. Nothing is saved until you press Import, and covers are not imported.</p>
        <input type="file" accept=".json,application/json" aria-label="Journal transcription" onChange={(e) => choose(e.target.files?.[0])} />
        {fileName && plan && <span className="muted">Read {fileName}</span>}
      </div>
      {error && <div className="card warn" role="alert">{error}</div>}

      {plan && stats && !result && (
        <>
          <div className="card">
            <span className="lbl2">2. Review</span>
            <div className="stats">
              <div className="stat"><span className="lbl2">Pages</span><span className="big">{stats.pages}</span></div>
              <div className="stat"><span className="lbl2">New books</span><span className="big">{stats.created}</span></div>
              <div className="stat"><span className="lbl2">Books you have</span><span className="big">{stats.matched}</span></div>
              <div className="stat"><span className="lbl2">With notes</span><span className="big">{stats.withNotes}</span></div>
              <div className="stat"><span className="lbl2">To look at</span><span className="big">{stats.problems}</span></div>
            </div>
            <p className="muted small">A book you already have keeps everything it has: the journal only fills in what is empty, and adds the notes. Where your read already has different notes, choose what happens to them.</p>
            {plan.warnings.map((w, i) => <div className="muted" key={i}>{w}</div>)}
          </div>
          <div className="card">
            <div className="ltable">
              {plan.entries.map((p) => {
                const off = skip.has(p.index);
                const dateBad = !!(p.entry.started && (finished.has(p.index) ? finished.get(p.index) : p.entry.finished) && (finished.has(p.index) ? finished.get(p.index)! : p.entry.finished!) < p.entry.started);
                return (
                  <div className={`jrow${off ? ' off' : ''}`} key={p.index}>
                    <label className="inline"><input type="checkbox" aria-label={`Import ${p.entry.title}`} checked={!off} onChange={() => toggle(p.index)} /></label>
                    <div className="jmain">
                      <b>{p.entry.title}</b> <span className="muted">{p.entry.authors.join(', ')} · page {p.entry.page}{p.entry.series ? ` · ${p.entry.series.name}${p.entry.series.position !== null ? ` #${p.entry.series.position}` : ''}` : ''}</span>
                      <div className="muted small">{KIND[p.kind]}{p.dateDiffers ? ` (your finish date is ${p.dateDiffers}, which stays)` : ''}{p.entry.finished ? ` · finished ${finished.has(p.index) ? finished.get(p.index) ?? 'no date' : p.entry.finished}` : ''}</div>
                      {p.problems.map((x, i) => <div className="jwarn" key={i}>{x}</div>)}
                    </div>
                    <div className="jside">
                      {(dateBad || (p.entry.started && p.entry.finished && p.entry.finished < p.entry.started)) && (
                        <input type="date" className="field" aria-label={`Finish date for ${p.entry.title}`} value={finished.get(p.index) ?? ''} onChange={(e) => setFinished(new Map(finished).set(p.index, e.target.value || null))} />
                      )}
                      {p.notes === 'append' && (
                        <select aria-label={`Notes for ${p.entry.title}`} value={notes.get(p.index) ?? 'append'} onChange={(e) => setNotes(new Map(notes).set(p.index, e.target.value as NotesChoice))}>
                          <option value="append">Add after my notes</option><option value="replace">Replace my notes</option><option value="keep">Keep my notes</option>
                        </select>
                      )}
                      {p.notes === 'set' && p.entry.notes && <span className="muted small">Notes will be added</span>}
                      {p.notes === 'same' && <span className="muted small">Notes already there</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="actions">
            <button type="button" className="btn on" disabled={progress !== null || stats.pages === 0} onClick={run}>
              {progress ? `Importing ${progress[0]} of ${progress[1]}...` : `Import ${stats.pages} ${stats.pages === 1 ? 'page' : 'pages'}`}
            </button>
            <span className="muted">Importing the same file twice adds nothing new.</span>
          </div>
        </>
      )}

      {result && (
        <div className="card">
          <span className="lbl2">{undone ? 'Undone' : 'Imported'}</span>
          {undone ? <p>Everything from this import was removed, and anything it filled in was put back.</p> : (
            <>
              <p>{result.booksCreated} new {result.booksCreated === 1 ? 'book' : 'books'}, {result.readsCreated} new {result.readsCreated === 1 ? 'read' : 'reads'}, {result.readsUpdated} existing {result.readsUpdated === 1 ? 'read' : 'reads'} filled in. Notes: {result.notesAdded} added, {result.notesAppended} added after yours, {result.notesReplaced} replaced.{result.charactersCreated ? ` ${result.charactersCreated} new characters were made.` : ''}</p>
              <div className="actions"><button type="button" className="btn" onClick={async () => { await undoImport(db, result.batchId); setUndone(true); }}>Undo this import</button></div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

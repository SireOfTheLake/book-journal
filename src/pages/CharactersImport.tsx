import { useMemo, useState } from 'react';
import { makeBackup } from '../backup/backup';
import { useBackupEnv } from '../backup/context';
import { useDb } from '../db/DbContext';
import { applyNotionCharacters, type CharacterImportResult } from '../import/applyCharacters';
import { planNotionCharacters, type CharacterPlan } from '../import/notionCharacters';
import { undoImport } from '../import/writer';

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="stat"><span className="lbl2">{label}</span><span className="big">{value}</span></div>;
}

export default function CharactersImport() {
  const db = useDb();
  const getBackupEnv = useBackupEnv();
  const [fileName, setFileName] = useState<string | null>(null);
  const [plan, setPlan] = useState<CharacterPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [result, setResult] = useState<CharacterImportResult | null>(null);
  const [undone, setUndone] = useState(false);

  const stats = useMemo(() => {
    if (!plan) return null;
    const refs = plan.rows.flatMap((r) => [...r.partners, ...r.previousPartners, ...r.family, ...r.friends]);
    return {
      characters: plan.rows.length,
      linked: new Set(refs.filter((x) => x.linked).map((x) => x.notionId ?? x.name)).size,
      relationships: refs.length,
      nicknames: plan.rows.reduce((n, r) => n + r.nicknames.length + r.previousNames.length, 0),
      places: plan.places.length,
      occupations: new Set(plan.rows.flatMap((r) => r.occupations.map((o) => o.toLowerCase()))).size,
    };
  }, [plan]);

  async function choose(file: File | undefined) {
    setError(null); setResult(null); setUndone(false); setPlan(null);
    if (!file) return;
    try {
      const p = planNotionCharacters(await file.text());
      if (p.rows.length === 0) throw new Error('No characters were found in that file. Is it the Notion characters export (CSV)?');
      setFileName(file.name); setPlan(p);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  async function run() {
    if (!plan) return;
    setError(null); setProgress([0, plan.rows.length]);
    try { await makeBackup(db, await getBackupEnv(), 'before-import'); }
    catch (e) { setError(`A backup could not be made first, so nothing was imported. (${e instanceof Error ? e.message : String(e)})`); setProgress(null); return; }
    try { setResult(await applyNotionCharacters(db, plan, (d, t) => setProgress([d, t]))); }
    catch (e) { setError(`The import stopped part way: ${e instanceof Error ? e.message : String(e)}. You can undo it from this page and try again.`); }
    setProgress(null);
  }

  return (
    <div className="import">
      <div className="card">
        <span className="lbl2">1. Choose the characters file</span>
        <p className="muted">Export your characters database from Notion as Markdown &amp; CSV and pick the <b>.csv</b> file. You can import it before or after the books; characters are matched either way.</p>
        <input type="file" accept=".csv" aria-label="Notion characters CSV" onChange={(e) => choose(e.target.files?.[0])} />
        {fileName && plan && <span className="muted">Read {fileName}</span>}
      </div>
      {error && <div className="card warn" role="alert">{error}</div>}
      {plan && stats && !result && (
        <>
          <div className="card">
            <span className="lbl2">2. Review</span>
            <div className="stats">
              <Stat label="Characters in the file" value={stats.characters} /><Stat label="Linked pages" value={stats.linked} />
              <Stat label="Relationships" value={stats.relationships} /><Stat label="Alternative names" value={stats.nicknames} />
              <Stat label="Places" value={stats.places} /><Stat label="Occupations" value={stats.occupations} />
            </div>
            <p className="muted">People with a Notion page become characters. People who are only named (a mother, an ex) stay as a plain name and label on the character who mentions them, and are never merged by name. A note in parentheses, such as (TAME), becomes a tag so you can see which book to assign.</p>
          </div>
          {plan.warnings.length > 0 && (
            <div className="card warn"><span className="lbl2">Worth a look</span>{plan.warnings.map((w, i) => <div key={i}>{w.message}</div>)}</div>
          )}
          <div className="card">
            <span className="lbl2">First characters</span>
            <table className="table">
              <thead><tr><th>Name</th><th>Partner</th><th>Occupation</th><th>Place</th></tr></thead>
              <tbody>{plan.rows.slice(0, 8).map((r) => (
                <tr key={r.index}><td className="l">{r.name}{r.origin ? ` (${r.origin})` : ''}</td><td>{r.partners.map((p) => p.name).join(', ') || '—'}</td>
                  <td>{r.occupations.join(', ') || '—'}</td><td>{r.place ?? '—'}</td></tr>
              ))}</tbody>
            </table>
          </div>
          <div className="actions">
            <button type="button" className="btn on" disabled={progress !== null} onClick={run}>
              {progress ? `Importing ${progress[0]} of ${progress[1]}...` : `Import ${stats.characters} characters`}
            </button>
            <span className="muted">Importing the same file twice adds nothing new.</span>
          </div>
        </>
      )}
      {result && (
        <div className="card">
          <span className="lbl2">{undone ? 'Import undone' : 'Imported'}</span>
          {undone ? <p>Everything from that import has been removed, and filled-in details were put back.</p> : (
            <>
              <div className="stats">
                <Stat label="Characters added" value={result.charactersCreated} /><Stat label="People listed (no page)" value={result.peopleAdded} />
                <Stat label="Relationships" value={result.relationships} /><Stat label="Alternative names" value={result.altNames} />
                <Stat label="Places" value={result.placesCreated} /><Stat label="Book links added" value={result.bookLinksAdded} />
              </div>
              <div className="actions"><button type="button" className="btn" onClick={async () => { await undoImport(db, result.batchId); setUndone(true); }}>Undo this import</button></div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

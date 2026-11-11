import { createMap } from '../repo/usmap';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDb } from '../db/DbContext';
import { deleteChallenge, createGrid, createSticker, createPyramid, setChallengeDescription, listChallenges, type ChallengeSummary } from '../repo/challenges';
import { createWordBuilder } from '../repo/words';
import { useJournalYear } from '../ui/Shell';
import { createBank, createBingo, deleteBank, listBanks, type BankSummary } from '../repo/bingo';
import { exportChallenges } from '../repo/challengeExport';
import { useBackupEnv } from '../backup/context';
import { isTauri } from '../db/tauriDb';
import ChallengesView, { type CreateInput, type NewBingoForm } from './ChallengesView';

// Saves the challenges of the selected journal year with their subcategories, prompts, books and stickers as one JSON file.
function ExportCard({ year }: { year: number }) {
  const db = useDb();
  const getEnv = useBackupEnv();
  const [pictures, setPictures] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const save = async () => {
    setMsg(null);
    try {
      const text = JSON.stringify(await exportChallenges(db, { pictures, year }), null, 1);
      const name = `challenges-export-${year}.json`;
      if (isTauri()) {
        const env = await getEnv();
        const target = await env.pickSavePath(name, 'JSON', 'json');
        if (!target) return;
        await env.writeText(target, text);
      } else {
        const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
      }
      setMsg('Saved.');
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  };
  return (
    <section className="bcard" aria-label="Export challenges">
      <h2 className="gname-sm">Export challenge data</h2>
      <span className="muted small">Saves the challenges of journal {year} with their type, subcategories, prompts, the books on them and the stickers, as one file you can share for analysis.</span>
      <label className="check"><input type="checkbox" checked={pictures} onChange={(e) => setPictures(e.target.checked)} /> Include the sticker pictures (a bigger file)</label>
      <div className="actions"><button type="button" className="mini" onClick={() => void save()}>Export challenges</button>{msg && <span className="muted small" role="status">{msg}</span>}</div>
    </section>
  );
}

export default function ChallengesPage() {
  const db = useDb();
  const nav = useNavigate();
  const year = useJournalYear();
  const [list, setList] = useState<ChallengeSummary[] | null>(null);
  const [banks, setBanks] = useState<BankSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => { setList(await listChallenges(db, year)); setBanks(await listBanks(db, year)); }, [db, year]);
  useEffect(() => { setList(null); reload().catch((e) => setError(String(e))); }, [reload]);
  return (
    <section>
      <h1 className="pagetitle">CHALLENGES <span className="muted small">Journal {year}</span></h1>
      {error && <div className="bcard warn" role="alert">{error} <button type="button" className="mini" onClick={() => setError(null)}>Dismiss</button></div>}
      {list ? <ChallengesView year={year} list={list} banks={banks} onDelete={async (id) => { try { await deleteChallenge(db, id); await reload(); } catch (e) { setError(String(e)); } }}
        onNewBank={async (name, prompts) => { await createBank(db, name, prompts); await reload(); }}
        onCreate={async (input: CreateInput, description?: string) => {
          let id: string;
          if ('preferUnused' in input) {
            const f = input as NewBingoForm;
            const bankId = f.bankId ?? await createBank(db, f.name, f.newBankPrompts);
            try { id = await createBingo(db, { year: f.year, name: f.name, bankId, preferUnused: f.preferUnused, freeText: f.freeText, goal: f.goal }); } catch (e) { if (!f.bankId) await deleteBank(db, bankId); throw e; }
          } else if ('usMap' in input) id = await createMap(db, input);
          else if ('word' in input) id = await createWordBuilder(db, input);
          else if ('pyramid' in input) id = await createPyramid(db, input);
          else id = 'stickers' in input ? await createSticker(db, input) : await createGrid(db, input);
          if (description) await setChallengeDescription(db, id, description);
          nav(`/journal/challenges/${id}`);
        }} /> : <p className="muted">Loading...</p>}
      <ExportCard year={year} />
    </section>
  );
}

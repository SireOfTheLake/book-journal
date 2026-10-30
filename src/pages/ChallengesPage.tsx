import { createMap } from '../repo/usmap';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDb } from '../db/DbContext';
import { deleteChallenge, createGrid, createSticker, setChallengeDescription, listChallenges, type ChallengeSummary } from '../repo/challenges';
import { createWordBuilder } from '../repo/words';
import { useJournalYear } from '../ui/Shell';
import { createBank, createBingo, deleteBank, listBanks, type BankSummary } from '../repo/bingo';
import ChallengesView, { type CreateInput, type NewBingoForm } from './ChallengesView';

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
          else id = 'stickers' in input ? await createSticker(db, input) : await createGrid(db, input);
          if (description) await setChallengeDescription(db, id, description);
          nav(`/journal/challenges/${id}`);
        }} /> : <p className="muted">Loading...</p>}
    </section>
  );
}

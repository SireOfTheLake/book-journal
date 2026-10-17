import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useDb } from '../db/DbContext';
import * as repo from '../repo/bingo';
import { fileToSquare } from '../ui/imageFile';
import BankView, { type BankActions } from './BankView';

export default function BankPage() {
  const db = useDb();
  const nav = useNavigate();
  const { id = '' } = useParams();
  const [bank, setBank] = useState<repo.Bank | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => setBank(await repo.getBank(db, id)), [db, id]);
  useEffect(() => { reload().catch((e) => setError(String(e))); }, [reload]);
  const act = useMemo<BankActions>(() => {
    const run = async (fn: () => Promise<unknown>) => { try { await fn(); await reload(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } };
    return {
      rename: (n) => run(() => repo.renameBank(db, id, n)), add: (t) => run(() => repo.addBankPrompts(db, id, t)),
      renamePrompt: (p, t) => run(() => repo.renameBankPrompt(db, p, t)),
      setImage: (p, f) => run(async () => repo.setBankPromptImage(db, p, f ? await fileToSquare(f) : null)),
      removePrompt: (p) => run(() => repo.deleteBankPrompt(db, p)),
      removeBank: () => { repo.deleteBank(db, id).then(() => nav('/journal/challenges'), (e) => setError(String(e))); },
    };
  }, [db, id, nav, reload]);
  return (
    <section>
      <p className="small"><Link className="l inline" to="/journal/challenges">&larr; All challenges</Link></p>
      <h1 className="pagetitle">BINGO PROMPT BANK</h1>
      {error && <div className="bcard warn" role="alert">{error} <button type="button" className="mini" onClick={() => setError(null)}>Dismiss</button></div>}
      {bank === undefined ? <p className="muted">Loading...</p> : bank === null ? <p className="muted">That bank no longer exists.</p> : <BankView bank={bank} act={act} />}
    </section>
  );
}

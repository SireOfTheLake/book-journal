import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDb } from '../db/DbContext';
import { addPrompt, discardDraft, listDrafts, loadRandomizer, removePrompt, startDraft, type DraftRow, type RandomizerData } from '../repo/randomizer';
import { addToUpNext } from '../repo/randomBook';
import { useJournalYear } from '../ui/Shell';
import RandomizerView, { type RandomizerActions } from './RandomizerView';

export default function RandomizerPage() {
  const db = useDb();
  const nav = useNavigate();
  const year = useJournalYear();
  const [data, setData] = useState<RandomizerData | null>(null);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => { setData(await loadRandomizer(db, year)); setDrafts(await listDrafts(db)); }, [db, year]);
  useEffect(() => { reload().catch((e) => setError(String(e))); }, [reload]);

  const act = useMemo<RandomizerActions>(() => ({
    addPrompt: async (kind, text) => { await addPrompt(db, kind, text); await reload(); },
    removePrompt: (id) => { removePrompt(db, id).then(reload, (e) => setError(String(e))); },
    start: async (pick) => { const { bookId, readId } = await startDraft(db, pick); nav(`/book/${bookId}/${readId}`); },
    upNext: async (ids) => { await addToUpNext(db, ids); await reload(); },
    discard: (bookId) => { discardDraft(db, bookId).then(reload, (e) => setError(e instanceof Error ? e.message : String(e))); },
  }), [db, nav, reload]);

  if (error) return <p className="muted" role="alert">{error}</p>;
  if (!data) return <p className="muted">Loading...</p>;
  return <RandomizerView data={data} drafts={drafts} year={year} act={act} />;
}

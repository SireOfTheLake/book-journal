import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useDb } from '../db/DbContext';
import { mergeBooks, planMerge, type MergePlan } from '../repo/bookMerge';
import BookMergeView from './BookMergeView';

export default function BookMergePage() {
  const db = useDb();
  const nav = useNavigate();
  const { bookId = '', otherId = '' } = useParams();
  const [plan, setPlan] = useState<MergePlan | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => planMerge(db, bookId, otherId).then(setPlan, (e) => { setPlan(null); setError(e instanceof Error ? e.message : String(e)); }), [db, bookId, otherId]);
  useEffect(() => { void load(); }, [load]);
  if (plan === undefined) return <p className="muted">Loading...</p>;
  if (plan === null) return <p className="muted">{error ?? 'Those books could not be found.'}</p>;
  return <BookMergeView plan={plan} error={error} onCancel={() => nav(`/book/${bookId}`)}
    onMerge={(picks, reads) => { mergeBooks(db, bookId, otherId, picks, reads).then(() => nav(`/book/${bookId}`, { replace: true }), (e) => setError(e instanceof Error ? e.message : String(e))); }} />;
}

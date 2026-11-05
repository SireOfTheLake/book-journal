import { useCallback, useEffect, useState } from 'react';
import { useDb } from '../db/DbContext';
import { getTracker, saveBounds, type Tracker } from '../repo/tracker';
import { useJournalYear } from '../ui/Shell';
import TrackerView, { type TrackerKind } from './TrackerView';

export default function TrackerPage({ kind: forced }: { kind?: TrackerKind }) {
  const db = useDb();
  const year = useJournalYear();
  const [kind, setKind] = useState<TrackerKind>(forced ?? 'pages');
  const [t, setT] = useState<Tracker | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => getTracker(db, year).then(setT, (e) => setError(String(e))), [db, year]);
  useEffect(() => { setT(null); void load(); }, [load]);
  return (
    <section>
      <h1 className="pagetitle">{forced === 'books' ? 'BOOKS FINISHED TRACKER' : forced === 'pages' ? 'READING TRACKER' : 'TRACKERS'} <span className="muted small">Journal {year}</span></h1>
      {!forced && (
        <div className="seg trk-tabs" role="tablist" aria-label="Tracker">
          <button type="button" role="tab" aria-selected={kind === 'pages'} className={kind === 'pages' ? 'on' : ''} onClick={() => setKind('pages')}>Pages read</button>
          <button type="button" role="tab" aria-selected={kind === 'books'} className={kind === 'books' ? 'on' : ''} onClick={() => setKind('books')}>Books finished</button>
        </div>
      )}
      {error && <div className="bcard warn" role="alert">{error}</div>}
      {t ? <TrackerView tracker={t} kind={kind} editable={!forced} onBounds={(b) => void saveBounds(db, b).then(load)} /> : <p className="muted">Loading...</p>}
    </section>
  );
}

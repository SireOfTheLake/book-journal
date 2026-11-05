import { useEffect, useState } from 'react';
import { useDb } from '../../db/DbContext';
import { accentAt } from '../../domain/challenges';
import { listChallenges, type ChallengeSummary } from '../../repo/challenges';
import { useJournalYear } from '../../ui/Shell';
import TrackerBar from '../challenges/TrackerBar';

const KIND: Record<string, string> = { grid: 'Grid', sticker: 'Sticker', bingo: 'Bingo' };

/** Progress on every challenge of the year, for the printed journal (the Challenges page itself has forms and buttons). */
export default function ChallengeTrackerSheet() {
  const db = useDb();
  const year = useJournalYear();
  const [list, setList] = useState<ChallengeSummary[] | null>(null);
  useEffect(() => { listChallenges(db, year).then(setList, () => setList([])); }, [db, year]);
  return (
    <section>
      <h1 className="pagetitle">CHALLENGE TRACKER <span className="muted small">Journal {year}</span></h1>
      {!list ? <p className="muted">Loading...</p> : list.length === 0 ? <p className="muted">No challenges this year.</p> : (
        <div className="chalgrid">
          {list.map((c) => (
            <div key={c.id} className="bcard chalcard" style={{ ['--gc' as string]: c.color ?? accentAt(0) }}>
              <span className="gname-sm">{c.name}</span>
              <span className="muted small">{c.usMap ? 'Map' : c.word ? 'Word builder' : KIND[c.kind]}{c.published ? '' : ' · Draft'}</span>
              <TrackerBar t={c} color={c.color ?? undefined} bonus={c.bonus} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

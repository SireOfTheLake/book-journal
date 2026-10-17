import { useState } from 'react';
import type { ShelfBook } from '../../repo/shelf';
import ReasonCard, { type PromptActions, type ReasonActions } from './ReasonCard';
import type { ChallengeChoice, ReadChallenge } from '../../repo/challenges';
import type { Reason } from '../../repo/reason';
import { Card, Seg } from './parts';

export interface DraftActions {
  chooseShelf(bookId: string): void;
  name(title: string, authors: string[]): void;
  discard(): void;
}
type Way = 'tbr' | 'new';

// The blank page the Prompt Randomizer makes: only the reason is filled in, and you choose the book.
export default function DraftBook({ reason, items, choices, challengeAct, reasonAct, shelf, act }: {
  reason: Reason; items: ReadChallenge[]; choices: ChallengeChoice[]; challengeAct: PromptActions; reasonAct: ReasonActions; shelf: ShelfBook[]; act: DraftActions;
}) {
  const [picked, setPicked] = useState<Way | null>(null);
  const way: Way = picked ?? (shelf.length ? 'tbr' : 'new'); // until you choose, TBR if you have one
  const [filter, setFilter] = useState('');
  const [title, setTitle] = useState('');
  const [authors, setAuthors] = useState('');
  const [confirming, setConfirming] = useState(false);
  const shown = shelf.filter((b) => `${b.title} ${b.authors ?? ''} ${b.series ?? ''}`.toLowerCase().includes(filter.trim().toLowerCase()));
  return (
    <div className="booklog draftbook">
      <div className="bl-head"><h1 className="pagetitle">NEXT BOOK</h1></div>
      <p className="muted">Your reason is set. Choose the book that fits it, or add a new one.</p>
      <div className="draftgrid">
        <ReasonCard reason={reason} items={items} choices={choices} challengeAct={challengeAct} act={reasonAct} />
        <Card label="Which book?" className="span2">
          <Seg label="Where the book comes from" value={way} onChange={(v) => setPicked(v ?? way)} options={[{ value: 'tbr', label: 'From my TBR' }, { value: 'new', label: 'A new book' }]} />
          {way === 'tbr' && (
            <>
              <input className="field" aria-label="Search my TBR" placeholder="Search my TBR and Up Next" value={filter} onChange={(e) => setFilter(e.target.value)} />
              {shelf.length === 0 && <span className="muted small">Your TBR and Up Next are empty.</span>}
              <ul className="plist draftshelf">
                {shown.map((b) => (
                  <li key={b.id}>
                    <span className="grow"><b>{b.title}</b> <span className="muted small">{b.authors ?? 'No author'}{b.series ? ` · ${b.series}${b.position !== null ? ` #${b.position}` : ''}` : ''}{b.shelf === 'up_next' ? ' · Up Next' : ''}</span></span>
                    <button type="button" className="mini on" aria-label={`Read ${b.title}`} onClick={() => act.chooseShelf(b.id)}>Read this</button>
                  </li>
                ))}
              </ul>
              {shelf.length > 0 && shown.length === 0 && <span className="muted small">Nothing on your shelves matches.</span>}
            </>
          )}
          {way === 'new' && (
            <>
              <input className="field big" aria-label="Title" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
              <input className="field" aria-label="Authors" placeholder="Authors, separated by commas" value={authors} onChange={(e) => setAuthors(e.target.value)} />
              <div className="actions"><span className="grow" /><button type="button" className="btn on" disabled={!title.trim()} onClick={() => act.name(title, authors.split(',').map((a) => a.trim()).filter(Boolean))}>Start this book</button></div>
            </>
          )}
        </Card>
      </div>
      <div className="actions">
        {confirming ? (
          <>
            <span className="muted">Throw this page away?</span>
            <button type="button" className="btn" onClick={() => setConfirming(false)}>Keep it</button>
            <button type="button" className="btn on" onClick={act.discard}>Discard</button>
          </>
        ) : <button type="button" className="btn" onClick={() => setConfirming(true)}>Discard this page</button>}
      </div>
    </div>
  );
}

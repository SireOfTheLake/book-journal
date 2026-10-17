import { useState } from 'react';
import { Link } from 'react-router-dom';
import { chipStyle } from '../../domain/colors';
import { formatDuration } from '../../domain/format';
import type { Counted, NarratorDetail } from '../../repo/people';
import { Card, Combo, Thumbs } from '../bookLog/parts';
import VoiceChips from '../VoiceChips';
import PersonSide, { type PersonActions } from './PersonSide';
import type { Item } from '../../repo/bookLog';

export interface NarratorActions extends PersonActions { addUsualAccent(name: string): void; removeUsualAccent(id: string): void; addBook(bookId: string): void; removeBook(bookId: string): void; voiceAdd(readNarratorId: string, characterId: string): void; voiceRemove(readNarratorId: string, characterId: string): void }
const STYLE: Record<string, string> = { solo: 'Solo', dual: 'Dual', duet: 'Duet', full_cast: 'Full cast', immersive: 'Immersive' };
const Stat = ({ label, children }: { label: string; children: React.ReactNode }) => <div className="bcard"><span className="lbl2">{label}</span>{children}</div>;
const Tags = ({ items, empty }: { items: Counted[]; empty: string }) => items.length ? <div className="chips">{items.map((t) => <span key={t.id} className="chip" style={chipStyle(t.color)}>{t.name} <span className="muted small">{t.n}</span></span>)}</div> : <span className="muted">{empty}</span>;

export default function NarratorView({ d, accents, books = [], act }: { d: NarratorDetail; accents: Item[]; books?: (Item & { authors: string | null })[]; act: NarratorActions }) {
  const c = d.core;
  const [accent, setAccent] = useState('');
  const [adding, setAdding] = useState(false);
  return (
    <div className="charpage">
      <div className="sphead">
        <h2 className="seriestitle plain">{c.name}</h2>
        <span className="grow" />
        <button type="button" className="btn" aria-pressed={c.is_favorite === 1} onClick={() => act.update({ is_favorite: c.is_favorite ? 0 : 1 })}>{c.is_favorite ? 'Favorite' : 'Mark as favorite'}</button>
      </div>
      <div className="bl-cols">
        <PersonSide photo={c.photo} name={c.name} aliases={d.aliases} aliasLabel="Aliases" links={c.links} notes={c.notes} act={act}>
          <Card label="Usual accents">
            <div className="chips">{d.usualAccents.map((a) => <span key={a.id} className="chip" style={{ borderColor: 'var(--line2)' }}>{a.name}<button type="button" className="x" aria-label={`Remove ${a.name}`} onClick={() => act.removeUsualAccent(a.id)}>&times;</button></span>)}</div>
            <input className="field small" list="accent-options" placeholder="+ Add an accent" aria-label="Add a usual accent" value={accent} onChange={(e) => setAccent(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && accent.trim()) { act.addUsualAccent(accent); setAccent(''); } }} />
            <datalist id="accent-options">{accents.map((a) => <option key={a.id} value={a.name} />)}</datalist>
            <span className="muted small">What you set yourself. "Common accents" is counted from your listens.</span>
          </Card>
        </PersonSide>
        <div className="stackcol wide">
          <div className="statrow">
            <Stat label="Listens"><span className="big">{d.listens.length}</span></Stat>
            <Stat label="Total hours">{d.totalSeconds ? <span className="big">{formatDuration(d.totalSeconds)}</span> : <span className="muted">Add audio lengths</span>}</Stat>
            <Stat label="Rating tally"><span className="tally"><span className="t-up">{`${d.tally.up} up`}</span><span className="t-neutral">{`${d.tally.neutral} okay`}</span><span className="t-down">{`${d.tally.down} down`}</span></span></Stat>
            <Stat label="Co-narrators">{d.coNarrators.length ? d.coNarrators.map((n) => <span key={n.id}><Link className="l inl" to={`/narrators/${n.id}`}>{n.name}</Link><span className="muted small">{n.n} {n.n === 1 ? 'listen' : 'listens'}</span></span>) : <span className="muted">None</span>}</Stat>
            <Stat label="Characters voiced">{d.voiced.length ? [...new Map(d.voiced.map((v) => [v.id, v])).values()].map((v) => <Link key={v.id} className="l inl" to={`/characters/${v.id}`}>{v.name}</Link>) : <span className="muted">None recorded</span>}</Stat>
          </div>
          <Card label="Listens">
            <div className="lrow2 bhead"><span>Title</span><span>Style</span><span>Finished</span><span>Voiced</span><span>Rating</span></div>
            {d.listens.map((l) => (
              <div className="lrow2" key={l.rn_id}>
                <Link className="l ttl" to={`/book/${l.book_id}/${l.read_id}`}>{l.title}</Link>
                <span className="muted">{l.narration_style ? STYLE[l.narration_style] : '—'}{l.accent && <span className="chip tiny" style={{ marginLeft: 6, borderColor: 'var(--line2)' }}>{l.accent}</span>}</span>
                <span className="muted">{l.finish_date ?? (l.status === 'reading' ? 'Listening' : '—')}</span>
                <VoiceChips narrator={c.name} chars={l.chars} options={l.options} onAdd={(cid) => act.voiceAdd(l.rn_id, cid)} onRemove={(cid) => act.voiceRemove(l.rn_id, cid)} />
                <span>{l.rating ? <Thumbs value={l.rating} onChange={() => undefined} /> : <span className="muted">—</span>}</span>
              </div>
            ))}
            {d.listens.length === 0 && <span className="muted">No audio listens yet.</span>}
          </Card>
          <div className="twocol">
            <Card label="Common accents"><Tags items={d.commonAccents} empty="Counted from the accent on each listen." /></Card>
            <Card label="Common genres and tropes"><Tags items={[...d.genres, ...d.tropes]} empty="Appear once the books have genres and tropes." /></Card>
            <Card label="Not listened yet" className="span2">
              {d.notListened.length ? d.notListened.map((b) => <div className="relline" key={b.id}><Link className="l grow" to={`/book/${b.id}`}>{b.title}</Link><button type="button" className="mini" aria-label={`Take ${b.title} off this list`} onClick={() => act.removeBook(b.id)}>&times;</button></div>) : <span className="muted">Books narrated by {c.name} that you have added but not listened to will list here. Handy for a Treat.</span>}
              {adding ? (
                <Combo autoFocus label="Search your books" placeholder="Search your books by title" onClose={() => setAdding(false)}
                  options={books.filter((b) => !d.notListened.some((x) => x.id === b.id) && !d.listens.some((l) => l.book_id === b.id)).map((b) => ({ key: b.id, label: b.name, sub: b.authors }))}
                  onPick={act.addBook} />
              ) : <button type="button" className="mini addchar" onClick={() => setAdding(true)}>{`+ Add a book narrated by ${c.name}`}</button>}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ageText, formatDuration, HEAT, parseDuration } from '../../domain/format';
import { storedToStars, starsToStored } from '../../domain/rating';
import { displayMakeup } from '../../domain/makeup';
import type { BookLog, DayEntry, Item, LogCharacter, Neighbors, Status, TagTable } from '../../repo/bookLog';
import type { SqlValue } from '../../db/adapter';
import CoverFinder from '../../ui/CoverFinder';
import type { CoverCandidate } from '../../lookup/covers';
import VoiceChips from '../VoiceChips';
import ManageList from './ManageList';
import TimePeriodCard from './TimePeriodCard';
import LocationEditor from './LocationEditor';
import type { PlaceInput } from '../../repo/places';
import BookMenu from './BookMenu';
import type { MergeCandidate } from '../../repo/bookMerge';
import ChallengesCard, { type ChallengeActions } from './ChallengesCard';
import ReasonCard, { type ReasonActions } from './ReasonCard';
import type { Reason } from '../../repo/reason';
import type { ChallengeChoice, ReadChallenge } from '../../repo/challenges';
import { Card, Combo, EditNotes, EditSelect, EditText, FilePicker, Icon, LinkImageForm, Seg, Stars, TagEditor, Thumbs, ZoomImage } from './parts';

export interface Lists { sources: Item[]; timePeriods: Item[]; accents: Item[]; places: Item[]; genres: Item[]; themes: Item[]; tropes: Item[]; series: Item[]; universes?: Item[]; characters: (Item & { tags?: string | null })[]; authors: Item[]; narrators: Item[] }
export interface Actions {
  setStatus(s: Status): void;
  updateBook(f: Record<string, SqlValue>): void;
  updateRead(f: Record<string, SqlValue>): void;
  addTag(t: TagTable | 'place', name: string): void;
  removeTag(t: TagTable | 'place', id: string): void;
  renameTag(t: TagTable | 'place', id: string, name: string): void;
  narratorRating(id: string, r: 'up' | 'neutral' | 'down' | null): void;
  narratorAccent(id: string, name: string | null): void;
  saveEntry(e: { date: string; page: number | null; percent: number | null; seconds: number | null; text: string }): void;
  deleteEntry(id: string): void;
  newRead(): void;
  deleteRead(): void;
  saveLocation(id: string | null, input: PlaceInput): Promise<void>;
  deleteBook?(): void;
  mergeCandidates?(): Promise<{ similar: MergeCandidate[]; all: MergeCandidate[] }>;
  startMerge?(otherId: string): void;
  createItem(table: 'source' | 'time_period', name: string): void;
  removeTimePeriod(id: string): void;
  renameItem(table: 'source' | 'time_period', id: string, name: string): void;
  removeSource(id: string): void;
  startReading(): void;
  voiceAdd(readNarratorId: string, characterId: string): void;
  voiceRemove(readNarratorId: string, characterId: string): void;
  setSeries(id: string | null): void;
  createSeries(name: string): void;
  setUniverse?(id: string | null): void;
  createUniverse?(name: string): void;
  addCharacter(characterId: string, role: 'main' | 'side'): void;
  createCharacter(name: string): void;
  removeCharacter(bookCharacterId: string): void;
  addAuthor(authorId: string): void;
  createAuthor(name: string): void;
  removeAuthor(authorId: string): void;
  addNarrator(narratorId: string): void;
  createNarrator(name: string): void;
  removeNarrator(readNarratorId: string): void;
  setCoverFile(file: File): void;
  setCoverUrl(url: string): Promise<void>;
  setCoverCandidate(c: CoverCandidate): Promise<void>;
  removeCover(): void;
}

const STATUSES: { value: Status; label: string }[] = [
  { value: 'tbr', label: 'TBR' }, { value: 'up_next', label: 'Up Next' }, { value: 'reading', label: 'In Progress' },
  { value: 'finished', label: 'Read' }, { value: 'on_hold', label: 'Paused' }, { value: 'dnf', label: 'DNF' },
];
const GENDER: Record<string, string> = { male: 'Male', female: 'Female', non_binary: 'Non-binary', other: 'Other' };
const COVER = ['#5a1f1a', '#2f4a5a', '#4a3f2a', '#4a2f45', '#2d4a3a', '#5a3a1f', '#3a3a52', '#52302f'];

function currentStatus(log: BookLog): Status | null {
  return log.book.shelf ?? log.read?.status ?? null;
}

// Two steps, so a read is not removed by a stray click.
function DeleteRead({ act }: { act: Actions }) {
  const [sure, setSure] = useState(false);
  if (!sure) return <button type="button" className="mini" onClick={() => setSure(true)}>Delete this read</button>;
  return (
    <div className="stack">
      <span className="muted small">This removes this read with its rating, notes, narrators and daily log. The book and its other reads stay.</span>
      <div className="movebtns">
        <button type="button" className="mini danger" onClick={() => { setSure(false); act.deleteRead(); }}>Delete it</button>
        <button type="button" className="mini" onClick={() => setSure(false)}>Keep it</button>
      </div>
    </div>
  );
}

function Cover({ log, act }: { log: BookLog; act: Actions }) {
  const [finding, setFinding] = useState(false);
  const h = [...log.book.title].reduce((n, c) => n + c.charCodeAt(0), 0);
  return (
    <>
      {log.cover ? (
        <div className="realcover"><ZoomImage src={log.cover} alt={`Cover of ${log.book.title}`} /></div>
      ) : (
        <div className="cover" style={{ background: COVER[h % COVER.length] }} aria-label="Generated cover">
          <span className="by">{(log.authors[0]?.name ?? '').toUpperCase()}</span>
          <span className="ttl">{log.book.title.toUpperCase()}</span>
          <span />
        </div>
      )}
      <div className="pictools">
        <button type="button" className="mini" onClick={() => setFinding(true)}>Find cover</button>
        <FilePicker label={log.cover ? 'Replace cover' : 'Add cover'} onFile={act.setCoverFile} />
        <LinkImageForm label="Cover from a link" onUrl={act.setCoverUrl} />
        {log.cover && <button type="button" className="mini" onClick={act.removeCover}>Remove</button>}
      </div>
      {finding && <CoverFinder initial={{ title: log.book.title, authors: log.authors.map((a) => a.name) }} onUse={act.setCoverCandidate} onClose={() => setFinding(false)} />}
    </>
  );
}

// The book's authors: click an x to remove one, or search to add one (or create a new author).
function Authors({ log, lists, act }: { log: BookLog; lists: Lists; act: Actions }) {
  const [adding, setAdding] = useState(false);
  return (
    <Card label="Authors">
      <div className="chips">
        {log.authors.map((a) => (
          <span key={a.id} className="chip" style={{ borderColor: 'var(--line2)' }}>
            <Link className="l" to={`/authors/${a.id}`}>{a.name}</Link>
            <button type="button" className="x" aria-label={`Remove ${a.name}`} onClick={() => act.removeAuthor(a.id)}>&times;</button>
          </span>
        ))}
      </div>
      {adding ? (
        <Combo autoFocus label="Search authors" placeholder="Search for an author" onClose={() => setAdding(false)}
          options={lists.authors.filter((x) => !log.authors.some((y) => y.id === x.id)).map((x) => ({ key: x.id, label: x.name }))}
          onPick={act.addAuthor} onCreate={act.createAuthor} createLabel={(t) => `+ Add "${t}" as a new author`} />
      ) : <button type="button" className="ed add" onClick={() => setAdding(true)}>Add author</button>}
    </Card>
  );
}

function Characters({ log, lists, act }: { log: BookLog; lists: Lists; act: Actions }) {
  const [adding, setAdding] = useState(false);
  const person = (c: LogCharacter) => <Link className="l" to={`/characters/${c.id}`}>{c.name}</Link>;
  const main = log.characters.filter((c) => c.role === 'main');
  const side = log.characters.filter((c) => c.role === 'side');
  return (
    <Card label="Characters in this book" className="span4">
      {log.makeup && (
        <div className="makeup">
          <span className={log.makeup.includes('?') ? 'big muted' : 'big accent'}>{displayMakeup(log.makeup)}</span>
          <span className="muted">{log.makeup.includes('?') ? "Set each main character's gender to fill this in." : "from the main characters' gender"}</span>
        </div>
      )}
      {main.map((c) => {
        const bits = [c.gender ? GENDER[c.gender] : null, ageText(c.age_min, c.age_max) || null, c.occupations].filter(Boolean).join(', ');
        return (
          <div className="mainrow" key={c.id}>
            <span className="big nm">{person(c)}</span>
            <span className="desc">Main{bits ? <span className="muted"> · {bits}</span> : null}</span>
            {c.partners && <span className="rel"><span className="muted">In a relationship with: </span>{c.partners}</span>}
            <button type="button" className="mini" aria-label={`Remove ${c.name} from this book`} onClick={() => act.removeCharacter(c.bc_id)}>&times;</button>
          </div>
        );
      })}
      {side.length > 0 && (
        <div className="sides"><span className="lbl2">Side characters</span>
          {side.map((c) => (
            <span key={c.id} className="sideitem">{person(c)}
              <button type="button" className="mini" aria-label={`Make ${c.name} a main character`} onClick={() => act.addCharacter(c.id, 'main')}>Make main</button>
              <button type="button" className="mini" aria-label={`Remove ${c.name} from this book`} onClick={() => act.removeCharacter(c.bc_id)}>&times;</button>
            </span>
          ))}
        </div>
      )}
      {log.characters.length === 0 && <span className="muted">No characters linked yet.</span>}
      {adding ? (
        <Combo autoFocus label="Search characters" placeholder="Search for a character" onClose={() => setAdding(false)}
          options={lists.characters.filter((c) => !log.characters.some((x) => x.id === c.id)).map((c) => ({ key: c.id, label: c.name, sub: c.tags }))}
          onPick={(id) => act.addCharacter(id, 'side')} onCreate={act.createCharacter} createLabel={(t) => `+ Add "${t}" as a new character`} />
      ) : <button type="button" className="mini addchar" onClick={() => setAdding(true)}>+ Add character</button>}
    </Card>
  );
}

// "+ Add narrator" opens a search; the last option creates a new narrator.
function AddNarrator({ log, lists, act }: { log: BookLog; lists: Lists; act: Actions }) {
  const [adding, setAdding] = useState(false);
  if (!adding) return <button type="button" className="mini addchar" onClick={() => setAdding(true)}>+ Add narrator</button>;
  return (
    <Combo autoFocus label="Search narrators" placeholder="Search for a narrator" onClose={() => setAdding(false)}
      options={lists.narrators.filter((x) => !log.narrators.some((y) => y.narrator_id === x.id)).map((x) => ({ key: x.id, label: x.name }))}
      onPick={act.addNarrator} onCreate={act.createNarrator} createLabel={(t) => `+ Add "${t}" as a new narrator`} />
  );
}

// A quiet line under the series: the book's own universe (for a standalone or one book of a shared series),
// or the series' universe shown as plain text. Nothing here asks for attention until you want it.
function UniverseLine({ log, lists, act }: { log: BookLog; lists: Lists; act: Actions }) {
  const [open, setOpen] = useState(false);
  if (!act.setUniverse) return null;
  const own = log.universe;
  if (own) {
    return (
      <div className="uniline">
        <span className="lbl2">Universe</span>
        <Link className="l" to={`/universes/${own.id}`}>{own.name}</Link>
        <button type="button" className="quiet" aria-label={`Take this book out of ${own.name}`} onClick={() => act.setUniverse?.(null)}>remove</button>
      </div>
    );
  }
  if (log.seriesUniverse) {
    return (
      <div className="uniline">
        <span className="lbl2">Universe</span>
        <Link className="l" to={`/universes/${log.seriesUniverse.id}`}>{log.seriesUniverse.name}</Link>
        <span className="muted small">through the series</span>
      </div>
    );
  }
  if (!open) return <div className="uniline"><button type="button" className="quiet" onClick={() => setOpen(true)}>+ universe</button></div>;
  return (
    <div className="uniline">
      <Combo autoFocus label="Search universes" placeholder="Search for a universe" onClose={() => setOpen(false)}
        options={(lists.universes ?? []).map((x) => ({ key: x.id, label: x.name }))} onPick={(id) => act.setUniverse?.(id)}
        onCreate={(t) => act.createUniverse?.(t)} createLabel={(t) => `+ Add "${t}" as a new universe`} />
    </div>
  );
}

// "Add to a series" opens a search; the last option creates a new series.
function AddSeries({ lists, act }: { lists: Lists; act: Actions }) {
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" className="ed add" onClick={() => setOpen(true)}>Add to a series</button>;
  return <Combo autoFocus label="Search series" placeholder="Search for a series" onClose={() => setOpen(false)} options={lists.series.map((x) => ({ key: x.id, label: x.name }))}
    onPick={(id) => act.setSeries(id)} onCreate={act.createSeries} createLabel={(t) => `+ Add "${t}" as a new series`} />;
}

function DayLog({ log, act }: { log: BookLog; act: Actions }) {
  const [date, setDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [page, setPage] = useState('');
  const [pct, setPct] = useState('');
  const [time, setTime] = useState('');
  const [note, setNote] = useState('');
  const num = (s: string) => (s.trim() && !Number.isNaN(Number(s)) ? Number(s) : null);
  const add = () => {
    if (!date) return;
    act.saveEntry({ date, page: num(page), percent: num(pct), seconds: parseDuration(time), text: note });
    setPage(''); setPct(''); setTime(''); setNote('');
  };
  return (
    <Card label="Day log" className="span4">
      {log.entries.map((e: DayEntry) => (
        <div className="entry" key={e.id}>
          <b>{e.entry_date}</b>
          <span>{[e.position_page !== null ? `page ${e.position_page}` : null, e.position_percent !== null ? `${e.position_percent}%` : null, e.position_seconds !== null ? formatDuration(e.position_seconds) : null].filter(Boolean).join(' · ') || 'Read today'}</span>
          <span className="muted grow">{e.text}</span>
          <button type="button" className="mini" onClick={() => act.deleteEntry(e.id)}>Remove</button>
        </div>
      ))}
      <div className="entryform">
        <input className="field" type="date" value={date} aria-label="Entry date" onChange={(e) => setDate(e.target.value)} />
        <input className="field num" placeholder="Page" aria-label="Page reached" value={page} onChange={(e) => setPage(e.target.value)} />
        <input className="field num" placeholder="%" aria-label="Percent reached" value={pct} onChange={(e) => setPct(e.target.value)} />
        <input className="field num" placeholder="h:mm" aria-label="Time reached" value={time} onChange={(e) => setTime(e.target.value)} />
        <input className="field grow" placeholder="Note" aria-label="Entry note" value={note} onChange={(e) => setNote(e.target.value)} />
        <button type="button" className="btn" onClick={add}>Add entry</button>
      </div>
      <span className="muted small">Each value is where you got to by the end of that day. A date alone is a valid entry.</span>
    </Card>
  );
}

const opts = (items: Item[]) => items.map((i) => ({ value: i.id, label: i.name }));

export interface ChallengeInfo { items: ReadChallenge[]; choices: ChallengeChoice[]; act: ChallengeActions; reason?: Reason; reasonAct?: ReasonActions }

export default function BookLogView({ log, lists, act, neighbors, challenges }: { log: BookLog; lists: Lists; act: Actions; neighbors?: Neighbors; challenges?: ChallengeInfo }) {
  const { book, read } = log;
  const inProgress = !!read && (read.status === 'reading' || read.status === 'on_hold') && !book.shelf;
  const heat = book.heat_level !== null ? HEAT[book.heat_level] : null;
  const accentName = (id: string | null) => lists.accents.find((a) => a.id === id)?.name ?? null;
  const tag = (label: string, table: TagTable, items: Item[], options: Item[]) => (
    <TagEditor label={label} items={items} options={options} onAdd={(n) => act.addTag(table, n)} onRemove={(id) => act.removeTag(table, id)} onRename={(id, n) => act.renameTag(table, id, n)} />
  );

  return (
    <div className="booklog">
      <div className="bl-head">
        <h1 className="pagetitle">BOOK LOG{read?.year_number ? <>: <span className="accent">{read.year_number}</span></> : ''}</h1>
        <div className="reads" role="group" aria-label="Reads of this book">
          {log.reads.map((r, i) => (
            <Link key={r.id} to={`/book/${book.id}/${r.id}`} className={r.id === read?.id ? 'rd on' : 'rd'}>Read {i + 1}{r.finish_date ? ` · ${r.finish_date}` : ''}</Link>
          ))}
          <button type="button" className="rd add" onClick={act.newRead}>+ Add another read</button>
        </div>
        <BookMenu title={book.title} act={act} />
      </div>

      {(neighbors?.prev || neighbors?.next) && (
        <nav className="neighbors" aria-label="Previous and next book">
          {neighbors.prev ? <Link className="nbtn" to={`/book/${neighbors.prev.book_id}/${neighbors.prev.read_id}`} title={neighbors.prev.title}><span className="arrow">&lsaquo;</span><span className="nt">{neighbors.prev.title}</span></Link> : <span />}
          {neighbors.next ? <Link className="nbtn next" to={`/book/${neighbors.next.book_id}/${neighbors.next.read_id}`} title={neighbors.next.title}><span className="nt">{neighbors.next.title}</span><span className="arrow">&rsaquo;</span></Link> : <span />}
        </nav>
      )}

      <div className="bl-cols">
        <div className="bl-left">
          <Cover log={log} act={act} />
          <Card label="Status">
            <EditSelect label="Status" className="statuspill" value={currentStatus(log)} options={STATUSES} onChange={(v) => v && act.setStatus(v as Status)} />
            {read && <DeleteRead key={read.id} act={act} />}
          </Card>
          <Card label="Rating">
            {read ? <Stars value={storedToStars(read.rating)} onChange={(v) => act.updateRead({ rating: starsToStored(v) })} /> : <span className="muted">Start the book to rate it.</span>}
          </Card>
          <Card label="Title"><EditText label="Title" className="bigtext" value={book.title} onCommit={(v) => v.trim() && act.updateBook({ title: v.trim() })} /></Card>
          <Authors log={log} lists={lists} act={act} />
          <button type="button" className="btn" aria-pressed={book.is_favorite === 1} onClick={() => act.updateBook({ is_favorite: book.is_favorite ? 0 : 1 })}>{book.is_favorite ? 'Favorite' : 'Mark as favorite'}</button>
          {!inProgress && <button type="button" className="btn" onClick={act.startReading}>Start reading</button>}
          {!inProgress && book.shelf !== 'up_next' && <button type="button" className="btn" onClick={() => act.setStatus('up_next')}>Move to Up Next</button>}
        </div>

        <div className="bl-grid">
          <Card label="Series">
            {log.series ? (
              <>
                <span className="serieshead">
                  {log.seriesNav.prev ? <Link className="serarrow" to={`/book/${log.seriesNav.prev.id}`} aria-label={`Previous book: ${log.seriesNav.prev.title}`} title={log.seriesNav.prev.title}>&#8249;</Link> : <span className="serarrow gone" aria-hidden="true" />}
                  <Link className="big l grow" to={`/series/${log.series.id}`}>{log.series.title}</Link>
                  {log.seriesNav.next ? <Link className="serarrow" to={`/book/${log.seriesNav.next.id}`} aria-label={`Next book: ${log.seriesNav.next.title}`} title={log.seriesNav.next.title}>&#8250;</Link> : <span className="serarrow gone" aria-hidden="true" />}
                </span>
                <span className="seriespos">
                  {book.series_position === null || Number.isInteger(book.series_position)
                    ? <>Book <EditText label="Series position" addLabel="?" type="number" step="0.5" className="bignum" value={book.series_position} onCommit={(v) => act.updateBook({ series_position: v === '' ? null : Number(v) })} /> of <b className="bignum">{log.series.main_total}</b></>
                    : <>Novella <EditText label="Series position" addLabel="?" type="number" step="0.5" className="bignum" value={book.series_position} onCommit={(v) => act.updateBook({ series_position: v === '' ? null : Number(v) })} /><span className="muted small"> (extra to the {log.series.main_total} numbered books)</span></>}
                </span>
                <button type="button" className="mini" onClick={() => act.setSeries(null)}>Remove from series</button>
              </>
            ) : <AddSeries lists={lists} act={act} />}
            <UniverseLine log={log} lists={lists} act={act} />
          </Card>
          {read ? (
            <Card label="Dates">
              <div className="stack"><span className="muted">Started</span><EditText label="Start date" type="date" max={read.finish_date} initial={read.finish_date} value={read.start_date} onCommit={(v) => act.updateRead({ start_date: v || null })} /></div>
              <div className="stack"><span className="muted">Finished</span><EditText label="Finish date" type="date" min={read.start_date} value={read.finish_date} onCommit={(v) => act.updateRead({ finish_date: v || null })} />
                {read.status === 'reading' && !read.finish_date && <button type="button" className="mini" onClick={() => act.setStatus('finished')}>Finish reading</button>}</div>
            </Card>
          ) : <Card label="Dates"><span className="muted">Dates appear once the book is started.</span></Card>}
          <Card label="Point of view">
            <Seg label="POV" value={book.pov} onChange={(v) => act.updateBook({ pov: v })} options={[{ value: 'single', label: 'Single' }, { value: 'dual', label: 'Dual' }, { value: 'multi', label: 'Multi' }]} />
            <span className="lbl2">Perspective</span>
            <Seg label="Perspective" value={book.perspective} onChange={(v) => act.updateBook({ perspective: v })} options={[{ value: '1st', label: '1st' }, { value: '2nd', label: '2nd' }, { value: '3rd', label: '3rd' }]} />
          </Card>
          {tag('Genres', 'genre', log.genres, lists.genres)}

          <Card label="Length">
            <div className="stack"><span className="muted">Pages</span><EditText label="Pages" addLabel="Add pages" type="number" value={book.page_count} onCommit={(v) => act.updateBook({ page_count: v === '' ? null : Number(v) })} /></div>
            {read && <div className="stack"><span className="muted">Audio length</span><EditText label="Audio length" addLabel="Add audio length" value={formatDuration(read.audio_length_seconds) || null} validate={(v) => (v.trim() && parseDuration(v) === null ? 'Type it as 1:23 or 1h 23m.' : null)} onCommit={(v) => act.updateRead({ audio_length_seconds: v.trim() ? parseDuration(v) : null })} placeholder="1:23" /></div>}
          </Card>
          <Card label="Heat level">
            <Seg className="heatseg" label="Heat level" value={book.heat_level} onChange={(v) => act.updateBook({ heat_level: v })} options={HEAT.map((h) => ({ value: h.level, label: String(h.level) }))} />
            <span className="muted small">{heat ? <><b>{heat.level} · {heat.name}</b>{heat.text ? `: ${heat.text}` : ''}</> : 'Not set.'}</span>
          </Card>
          {tag('Tropes', 'trope', log.tropes, lists.tropes)}
          {tag('Themes', 'theme', log.themes, lists.themes)}

          {read ? (
            <>
              <Card label="Format">
                <Seg label="Format" value={read.format} onChange={(v) => act.updateRead({ format: v })}
                  options={[{ value: 'physical', label: <><Icon name="physical" />Physical</> }, { value: 'audio', label: <><Icon name="audio" />Audio</> }, { value: 'ebook', label: <><Icon name="ebook" />Ebook</> }]} />
              </Card>
              <Card label="Source"><EditSelect label="Source" value={read.source_id} options={opts(lists.sources)} onChange={(id) => act.updateRead({ source_id: id })} onCreate={(n) => act.createItem('source', n)} />
                <ManageList items={lists.sources} noun="Source" onRename={(id, n) => act.renameItem('source', id, n)} onRemove={act.removeSource} consequence="Removing a source clears it from the reads that used it." /></Card>
            </>
          ) : <><div /><div /></>}
          <div className="stackcol">
            <LocationEditor places={log.places} options={lists.places} onPick={(n) => act.addTag('place', n)} onRemove={(id) => act.removeTag('place', id)} onSave={act.saveLocation} />
            <TimePeriodCard periodId={book.time_period_id} detail={book.time_period_detail} options={lists.timePeriods} onPick={(id) => act.updateBook({ time_period_id: id, time_period_detail: null })}
              onDetail={(v) => act.updateBook({ time_period_detail: v })} onCreate={(n) => act.createItem('time_period', n)} onRemove={act.removeTimePeriod} onRename={(id, n) => act.renameItem('time_period', id, n)} />
          </div>
          <Card label="Originally published">
            <EditText label="Originally published" addLabel="Add publication date" type="date" value={book.original_publication_date} onCommit={(v) => act.updateBook({ original_publication_date: v || null })} />
          </Card>

          {read && (
            <>
              {challenges && <ReasonCard reason={challenges.reason ?? { kind: null, sub: null, prompt: null }} items={challenges.items} choices={challenges.choices} challengeAct={challenges.act} act={challenges.reasonAct ?? { set: () => undefined, setPrompt: () => undefined }} />}
              <Card label="Narration" className="span3">
                <Seg label="Narration style" value={read.narration_style} onChange={(v) => act.updateRead({ narration_style: v })}
                  options={[{ value: 'solo', label: 'Solo' }, { value: 'dual', label: 'Dual' }, { value: 'duet', label: 'Duet' }, { value: 'full_cast', label: 'Full cast' }, { value: 'immersive', label: 'Immersive' }]} />
                {log.narrators.length === 0 && <span className="muted">No narrators on this read.</span>}
                {log.narrators.map((n) => (
                  <div className="narr" key={n.id}>
                    <Link className="big l narrname" to={`/narrators/${n.narrator_id}`}>{n.name}</Link>
                    <div className="narrvoice">
                    <VoiceChips max={3} narrator={n.name} chars={n.chars ?? []} options={log.characters.filter((c) => !(n.chars ?? []).some((x) => x.id === c.id)).map((c) => ({ id: c.id, name: c.name }))}
                      onAdd={(cid) => act.voiceAdd(n.id, cid)} onRemove={(cid) => act.voiceRemove(n.id, cid)} />
                    </div>
                    <div className="narrside">
                      <div className="narrtop">
                    <EditSelect label="Accent" value={n.accent_id} options={opts(lists.accents)} onChange={(id) => act.narratorAccent(n.id, accentName(id))} onCreate={(name) => act.narratorAccent(n.id, name)} />
                    <Thumbs value={n.rating} onChange={(r) => act.narratorRating(n.id, r)} />
                    <button type="button" className="mini" aria-label={`Remove ${n.name} from this read`} onClick={() => act.removeNarrator(n.id)}>&times;</button>
                      </div>
                    </div>
                  </div>
                ))}
                <AddNarrator log={log} lists={lists} act={act} />
              </Card>
              {challenges && <ChallengesCard items={challenges.items} choices={challenges.choices} act={challenges.act} />}
              <Card label="Notes" className="span3">
                <EditNotes label="Notes" addLabel="Add notes" value={read.notes} onCommit={(v) => act.updateRead({ notes: v.trim() || null })} />
              </Card>
            </>
          )}
          <Characters log={log} lists={lists} act={act} />
          {read ? <DayLog log={log} act={act} /> : (
            <Card className="span4"><span className="muted">{book.shelf ? <>This book is on your {book.shelf === 'up_next' ? 'Up Next' : 'TBR'} shelf.</> : 'This book has no reads yet.'} Choose <b>In Progress</b> in the Status box to start it.</span></Card>
          )}
        </div>
      </div>
    </div>
  );
}

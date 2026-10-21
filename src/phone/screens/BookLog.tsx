import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useDb } from '../../db/DbContext';
import { useFeatures } from '../../features/FeaturesContext';
import * as repo from '../../repo/bookLog';
import type { Item, Status, TagTable } from '../../repo/bookLog';
import { addCharacterToBook, createCharacter, listCharacterNames, removeCharacterFromBook } from '../../repo/characters';
import { HEAT, formatDuration, parseDuration } from '../../domain/format';
import { starFills, starsToStored, storedToStars } from '../../domain/rating';
import { fileToDataUrl } from '../../ui/imageFile';
import { setPhoneCover } from '../phoneCover';
import { addPlaceToBook, addLocationToBook, savePlace } from '../../repo/places';
import { createSeries, listSeriesOptions, setBookSeries } from '../../repo/series';
import { PlaceSet } from '../places';
import { Card, ChipSet, ConfirmRemove, Cover, PickerSheet, Seg, Sheet, SyncDot, TextField, useLoad } from '../kit';

const GENDER: Record<string, string> = { male: 'Male', female: 'Female', non_binary: 'Non-binary', other: 'Other' };
const STATUSES: { value: Status; label: string }[] = [
  { value: 'tbr', label: 'TBR' }, { value: 'up_next', label: 'Up Next' }, { value: 'reading', label: 'Reading' },
  { value: 'finished', label: 'Read' }, { value: 'on_hold', label: 'Paused' }, { value: 'dnf', label: 'DNF' },
];

function Stars({ value, onChange }: { value: number | null; onChange(v: number | null): void }) {
  const fills = starFills(value);
  const set = (v: number) => onChange(value === v ? null : v);
  return (
    <>
      <div className="ph-stars" role="group" aria-label="Rating">
        {fills.map((f, i) => (
          <button key={i} type="button" aria-label={`${i + 1} stars`} onClick={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            set(e.clientX - r.left < r.width / 2 ? i + 0.5 : i + 1);
          }}>
            <svg width="34" height="34" viewBox="0 0 24 24" aria-hidden="true">
              <defs><linearGradient id={`sf${i}`}><stop offset={`${f * 100}%`} stopColor="#d6a35e" /><stop offset={`${f * 100}%`} stopColor="transparent" /></linearGradient></defs>
              <path d="M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 17l-5.4 2.8 1.1-6.1L3.2 9.4l6.1-.8z" fill={`url(#sf${i})`} stroke="#d6a35e" strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
          </button>
        ))}
        <span className="val">{value === null ? 'Not rated' : `${value} of 5`}</span>
      </div>
      <div className="ph-seg" style={{ marginTop: 6 }}>
        <button type="button" disabled={value === null || value <= 0} onClick={() => onChange(Math.max(0, (value ?? 0) - 0.25))}>&minus; &frac14;</button>
        <button type="button" disabled={value !== null && value >= 5} onClick={() => onChange(Math.min(5, (value ?? 0) + 0.25))}>+ &frac14;</button>
        <button type="button" disabled={value === null} onClick={() => onChange(null)}>Clear</button>
      </div>
    </>
  );
}

function EditHead({ log, run, onClose }: { log: repo.BookLog; run(fn: () => Promise<unknown>): Promise<void>; onClose(): void }) {
  const db = useDb();
  const authors = useLoad(() => repo.listAuthorOptions(db), [db]);
  const [adding, setAdding] = useState(false);
  const b = log.book;
  return (
    <Sheet title="Title and pages" onClose={onClose}>
      <TextField label="Title" value={b.title} onCommit={(v) => v.trim() && void run(() => repo.updateBook(db, b.id, { title: v.trim() }))} />
      <TextField label="Pages" type="number" inputMode="numeric" value={b.page_count} onCommit={(v) => void run(() => repo.updateBook(db, b.id, { page_count: v === '' ? null : Number(v) }))} />
      <TextField label="Originally published" type="date" value={b.original_publication_date} onCommit={(v) => void run(() => repo.updateBook(db, b.id, { original_publication_date: v || null }))} />
      <div>
        <span className="ph-label">Authors</span>
        <div className="ph-chips">
          {log.authors.map((a) => <span key={a.id} className="ph-chip" style={{ background: '#d6a35e' }}>{a.name}<button type="button" className="x" aria-label={`Remove ${a.name}`} onClick={() => void run(() => repo.removeBookAuthor(db, b.id, a.id))}>&times;</button></span>)}
          <button type="button" className="ph-chip add" onClick={() => setAdding(true)}>+ Add author</button>
        </div>
      </div>
      {adding && <PickerSheet title="Add author" placeholder="Search authors" options={authors.data ?? []} taken={log.authors.map((a) => a.id)}
        onPick={(o) => void run(() => repo.addBookAuthor(db, b.id, { id: o.id }))} onCreate={(n) => void run(() => repo.addBookAuthor(db, b.id, { name: n }))} createLabel="Add new author" onClose={() => setAdding(false)} />}
    </Sheet>
  );
}

export default function BookLog() {
  const db = useDb();
  const nav = useNavigate();
  const { flags } = useFeatures();
  const { bookId = '', readId } = useParams();
  const [error, setError] = useState<string | null>(null);
  const [editHead, setEditHead] = useState(false);
  const coverInput = useRef<HTMLInputElement>(null);
  const [pickChar, setPickChar] = useState(false);
  const [pickNarrator, setPickNarrator] = useState(false);
  const [pickSource, setPickSource] = useState(false);
  const [pickSeries, setPickSeries] = useState(false);
  const [entry, setEntry] = useState({ date: new Date().toLocaleDateString('en-CA'), page: '', pct: '', time: '', note: '' });

  const loaded = useLoad(async () => {
    const [log, sources, genres, themes, tropes, moods, paces, warnings, chars, narrators, neighbors, seriesOpts, places] = await Promise.all([
      repo.getBookLog(db, bookId, readId), repo.listItems(db, 'source'),
      repo.listTagOptions(db, 'genre'), repo.listTagOptions(db, 'theme'), repo.listTagOptions(db, 'trope'), repo.listTagOptions(db, 'mood'), repo.listTagOptions(db, 'pace'), repo.listTagOptions(db, 'content_warning'),
      listCharacterNames(db), repo.listNarratorOptions(db), repo.getNeighbors(db, readId ?? null), listSeriesOptions(db), repo.listItems(db, 'place'),
    ]);
    return { log, sources, genres, themes, tropes, moods, paces, warnings, chars, narrators, neighbors, seriesOpts, places };
  }, [db, bookId, readId]);

  const run = async (fn: () => Promise<unknown>) => {
    try { await fn(); await loaded.reload(); setError(null); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const d = loaded.data;
  if (loaded.error) return <div className="ph-err" role="alert">{loaded.error}</div>;
  if (!d) return <p className="ph-muted">Loading...</p>;
  if (!d.log) return <><div className="ph-top"><button type="button" className="ph-back" onClick={() => nav('/')}>&#8249;</button></div><p className="ph-muted">That book is not here (it may have been removed on another device).</p></>;
  const { log } = d;
  const { book, read } = log;
  const rid = read?.id ?? null;
  const planned = !!read && !!book.shelf && read.status === 'on_hold' && !read.start_date && !read.finish_date;
  const status: Status | null = book.shelf ?? read?.status ?? null;
  const seriesLine = log.series ? `${log.series.title}${book.series_position !== null ? ` #${book.series_position}${log.series.main_total ? ` of ${log.series.main_total}` : ''}` : ''}` : null;
  const toItem = (x: Item) => ({ id: x.id, name: x.name });
  const tag = (label: string, table: TagTable, color: string, items: Item[], options: Item[]) => (
    <ChipSet label={label} color={color} items={items.map(toItem)} options={options.map(toItem)} addLabel={`Add ${label.toLowerCase().replace(/s$/, '')}`}
      onAdd={(o) => void run(() => repo.addTag(db, bookId, table, o.name))} onCreate={(n) => void run(() => repo.addTag(db, bookId, table, n))} onRemove={(o) => void run(() => repo.removeTag(db, bookId, table, o.id))} />
  );
  const addEntry = () => run(async () => {
    if (!rid) return;
    await repo.saveDayEntry(db, rid, { date: entry.date, page: entry.page ? Number(entry.page) : null, percent: entry.pct ? Number(entry.pct) : null, seconds: entry.time ? parseDuration(entry.time) : null, text: entry.note.trim() || null });
    setEntry({ ...entry, page: '', pct: '', time: '', note: '' });
  });

  return (
    <>
      <div className="ph-top">
        <button type="button" className="ph-back" aria-label="Back" onClick={() => nav(-1)}>&#8249;</button>
        <span style={{ flex: 1 }} />
        <span className="ph-pill"><SyncDot />{read && !planned ? '' : ''}</span>
      </div>
      {error && <div className="ph-err" role="alert">{error}</div>}

      <div className="ph-bookhead">
        <Cover imageId={book.cover_image_id} title={book.title} w={112} h={168} />
        <div style={{ minWidth: 0 }}>
          <h1>{book.title}</h1>
          <div className="by">{log.authors.map((a) => a.name).join(', ') || 'No author'}</div>
          {seriesLine && <div className="meta">{seriesLine}</div>}
          <div className="meta">{[book.page_count ? `${book.page_count} pages` : null, book.original_publication_date ? `Published ${book.original_publication_date.slice(0, 4)}` : null].filter(Boolean).join(' · ')}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            <button type="button" className="ph-btn" style={{ fontSize: 13 }} onClick={() => setEditHead(true)}>Edit title and pages</button>
            <button type="button" className="ph-btn" style={{ fontSize: 13 }} onClick={() => coverInput.current?.click()}>{book.cover_image_id ? 'Change cover' : 'Add cover'}</button>
            <input ref={coverInput} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void run(async () => setPhoneCover(db, bookId, await fileToDataUrl(f, 700))); }} />
          </div>
        </div>
      </div>

      {log.reads.length > 1 && (
        <div className="ph-seg scroll" style={{ marginTop: 14 }} role="group" aria-label="Reads of this book">
          {log.reads.map((r, i) => <button key={r.id} type="button" className={r.id === rid ? 'on' : ''} onClick={() => nav(`/book/${bookId}/${r.id}`, { replace: true })}>Read {i + 1}</button>)}
        </div>
      )}

      <div className="ph-field"><span className="ph-label">Status</span>
        <Seg label="Status" className="grid3" value={status} options={STATUSES} onChange={(s) => s && void run(async () => { const id = await repo.setStatus(db, bookId, rid, s); if (id && id !== rid) nav(`/book/${bookId}/${id}`, { replace: true }); })} />
      </div>

      {read && !planned ? (
        <>
          <div className="ph-field"><span className="ph-label">Rating</span><Stars value={storedToStars(read.rating)} onChange={(v) => void run(() => repo.updateRead(db, read.id, { rating: starsToStored(v) }))} /></div>
          <div className="ph-row">
            <TextField label="Started" type="date" value={read.start_date} onCommit={(v) => void run(() => repo.updateRead(db, read.id, { start_date: v || null }))} />
            <TextField label="Finished" type="date" value={read.finish_date} onCommit={(v) => void run(() => repo.updateRead(db, read.id, { finish_date: v || null }))} />
          </div>
        </>
      ) : (
        <p className="ph-note">{planned ? 'Start the book to rate it and set dates.' : 'Choose a status to start a read.'}</p>
      )}
      {read && (
        <div className="ph-field"><span className="ph-label">Format</span>
          <Seg label="Format" allowClear value={read.format} options={[{ value: 'physical', label: 'Physical' }, { value: 'audio', label: 'Audio' }, { value: 'ebook', label: 'Ebook' }]} onChange={(v) => void run(() => repo.updateRead(db, read.id, { format: v }))} />
        </div>
      )}

      {tag('Genres', 'genre', 'var(--genre)', log.genres, d.genres)}
      {tag('Tropes', 'trope', 'var(--trope)', log.tropes, d.tropes)}
      {tag('Themes', 'theme', 'var(--theme)', log.themes, d.themes)}
      {flags.moodpace && tag('Mood', 'mood', 'var(--mood)', log.moods, d.moods)}
      {flags.moodpace && tag('Pace', 'pace', 'var(--pace)', log.paces, d.paces)}
      {flags.warnings && tag('Content warnings', 'content_warning', 'var(--cw)', log.warnings, d.warnings)}

      <Card label="Series">
        {log.series ? (
          <>
            <div className="ph-chips">
              <span className="ph-chip" style={{ background: 'var(--accent)' }}>{log.series.title}<button type="button" className="x" aria-label={`Take this book out of ${log.series.title}`} onClick={() => void run(() => setBookSeries(db, bookId, null))}>&times;</button></span>
              <button type="button" className="ph-chip add" onClick={() => setPickSeries(true)}>Change series</button>
            </div>
            <TextField label="Position in series" type="number" inputMode="decimal" placeholder="1, 2, 2.5 for a novella" value={book.series_position} onCommit={(v) => void run(() => repo.updateBook(db, bookId, { series_position: v.trim() === '' ? null : Number(v) }))} />
          </>
        ) : (
          <button type="button" className="ph-chip add" onClick={() => setPickSeries(true)}>+ Add to a series</button>
        )}
      </Card>

      <PlaceSet label="Setting" places={log.places} options={d.places}
        onPick={(id) => void run(() => addPlaceToBook(db, bookId, id))} onRemove={(id) => void run(() => repo.removeTag(db, bookId, 'place', id))}
        onSave={async (id, input) => { try { if (id) await savePlace(db, id, input); else await addLocationToBook(db, bookId, input); } finally { await loaded.reload(); } }} />

      <Card label="Heat level">
        <Seg label="Heat level" allowClear className="ph-heat" value={book.heat_level} options={HEAT.map((h) => ({ value: h.level, label: String(h.level) }))} onChange={(v) => void run(() => repo.updateBook(db, bookId, { heat_level: v }))} />
        {book.heat_level !== null && <p className="ph-note">{book.heat_level} &middot; {HEAT[book.heat_level]?.name}{HEAT[book.heat_level]?.text ? `: ${HEAT[book.heat_level].text}` : ''}</p>}
      </Card>

      <Card label="Characters">
        {(['main', 'side'] as const).map((role) => {
          const list = log.characters.filter((c) => c.role === role);
          if (!list.length) return null;
          return (
            <div key={role} className={`ph-cast ${role}`}>
              <div className="ph-cast-h">{role === 'main' ? 'Main characters' : 'Side characters'}</div>
              <ul className="ph-list">
                {list.map((c) => (
                  <li key={c.bc_id} className={`ph-item ph-char ${role}`}>
                    <Link to={`/character/${c.id}`} className="grow">
                      <div className={`t ${c.featured ? 'page' : ''}`}>{c.name}</div>
                      <div className="s">{[GENDER[c.gender ?? ''] ?? c.gender, c.age_min !== null ? c.age_min : null].filter((x) => x !== null && x !== undefined && x !== '').join(' · ')}</div>
                    </Link>
                    {role === 'side' && <button type="button" className="ph-btn" style={{ minHeight: 40, padding: '0 10px' }} onClick={() => void run(() => addCharacterToBook(db, c.id, bookId, 'main'))}>Make main</button>}
                    <ConfirmRemove label={`Remove ${c.name} from this book`} onConfirm={() => void run(() => removeCharacterFromBook(db, c.bc_id))} />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {log.characters.length === 0 && <p className="ph-muted ph-small" style={{ margin: 0 }}>No characters yet.</p>}
        <button type="button" className="ph-chip add" style={{ marginTop: 8 }} onClick={() => setPickChar(true)}>+ Add character</button>
      </Card>

      {read && (
        <Card label="Notes on this read">
          <TextField hideLabel multiline label="Notes" value={read.notes} onCommit={(v) => void run(() => repo.updateRead(db, read.id, { notes: v.trim() || null }))} />
        </Card>
      )}

      {read && !planned && (
        <Card label="Reading log">
          {log.entries.length > 0 && (
            <ul className="ph-list" style={{ marginBottom: 10 }}>
              {[...log.entries].reverse().map((e) => (
                <li key={e.id} className="ph-item" style={{ minHeight: 48 }}>
                  <div className="grow"><div className="t" style={{ fontSize: 14 }}>{e.entry_date}{e.position_page ? ` · page ${e.position_page}` : ''}{e.position_percent ? ` · ${e.position_percent}%` : ''}{e.position_seconds ? ` · ${formatDuration(e.position_seconds)}` : ''}</div>{e.text && <div className="s" style={{ whiteSpace: 'normal' }}>{e.text}</div>}</div>
                  <button type="button" className="ph-btn" style={{ minHeight: 40, padding: '0 10px' }} aria-label="Delete entry" onClick={() => void run(() => repo.deleteDayEntry(db, e.id))}>&times;</button>
                </li>
              ))}
            </ul>
          )}
          <div className="ph-row">
            <TextField label="Date" type="date" value={entry.date} onCommit={(v) => setEntry({ ...entry, date: v })} />
            <TextField label="Page" inputMode="numeric" value={entry.page} onCommit={(v) => setEntry({ ...entry, page: v })} />
          </div>
          <div className="ph-row">
            <TextField label="Percent" inputMode="decimal" value={entry.pct} onCommit={(v) => setEntry({ ...entry, pct: v })} />
            <TextField label="Time (h:mm)" value={entry.time} onCommit={(v) => setEntry({ ...entry, time: v })} />
          </div>
          <TextField label="Note" value={entry.note} onCommit={(v) => setEntry({ ...entry, note: v })} />
          <button type="button" className="ph-btn" style={{ marginTop: 12, width: '100%' }} onClick={() => void addEntry()}>Add entry</button>
        </Card>
      )}

      {read && (
        <>
          <Card label="Source">
            <button type="button" className="ph-input" style={{ textAlign: 'left' }} onClick={() => setPickSource(true)}>{d.sources.find((s) => s.id === read.source_id)?.name ?? 'Choose a source'}</button>
          </Card>
          {read.format === 'audio' && (
            <Card label="Audio">
              <TextField hideLabel label="Audio length" placeholder="e.g. 9:30" value={formatDuration(read.audio_length_seconds) || null} onCommit={(v) => void run(() => repo.updateRead(db, read.id, { audio_length_seconds: v.trim() ? parseDuration(v) : null }))} />
              <span className="ph-label" style={{ marginTop: 14 }}>Narration</span>
              <Seg label="Narration style" allowClear value={read.narration_style} options={[{ value: 'solo', label: 'Solo' }, { value: 'dual', label: 'Dual' }, { value: 'duet', label: 'Duet' }, { value: 'full_cast', label: 'Full cast' }, { value: 'immersive', label: 'Immersive' }]} onChange={(v) => void run(() => repo.updateRead(db, read.id, { narration_style: v }))} />
              <ul className="ph-list" style={{ marginTop: 8 }}>
                {log.narrators.map((n) => (
                  <li key={n.id} className="ph-item">
                    <div className="grow"><div className="t">{n.name}</div>{n.accent && <div className="s">{n.accent}</div>}</div>
                    <button type="button" className="ph-btn" style={{ minHeight: 40, padding: '0 10px' }} aria-label={`Remove ${n.name}`} onClick={() => void run(() => repo.removeNarratorFromRead(db, n.id))}>&times;</button>
                  </li>
                ))}
              </ul>
              <button type="button" className="ph-chip add" style={{ marginTop: 8 }} onClick={() => setPickNarrator(true)}>+ Add narrator</button>
            </Card>
          )}
        </>
      )}

      <Card label="Point of view">
        <Seg label="POV" allowClear value={book.pov} options={[{ value: 'single', label: 'Single' }, { value: 'dual', label: 'Dual' }, { value: 'multi', label: 'Multi' }]} onChange={(v) => void run(() => repo.updateBook(db, bookId, { pov: v }))} />
        <div style={{ height: 8 }} />
        <Seg label="Perspective" allowClear value={book.perspective} options={[{ value: '1st', label: '1st' }, { value: '2nd', label: '2nd' }, { value: '3rd', label: '3rd' }]} onChange={(v) => void run(() => repo.updateBook(db, bookId, { perspective: v }))} />
      </Card>

      {flags.owned && (
        <Card label="Copies I own">
          <div className="ph-seg">
            {([['own_physical', 'Physical'], ['own_ebook', 'Ebook'], ['own_audio', 'Audio']] as const).map(([k, l]) => (
              <button key={k} type="button" className={book[k] ? 'on' : ''} aria-pressed={!!book[k]} onClick={() => void run(() => repo.updateBook(db, bookId, { [k]: book[k] ? 0 : 1 }))}>{l}</button>
            ))}
          </div>
        </Card>
      )}
      {flags.recommender && book.shelf && <Card label="Recommended by"><TextField hideLabel label="Recommended by" value={book.recommended_by ?? null} onCommit={(v) => void run(() => repo.updateBook(db, bookId, { recommended_by: v.trim() || null }))} /></Card>}
      {flags.whystopped && read?.status === 'dnf' && (
        <Card label="Why I stopped">
          <TextField hideLabel label="Why I stopped" value={read.stopped_reason ?? null} onCommit={(v) => void run(() => repo.updateRead(db, read.id, { stopped_reason: v.trim() || null }))} />
          <TextField label="Where I stopped" value={read.stopped_where ?? null} onCommit={(v) => void run(() => repo.updateRead(db, read.id, { stopped_where: v.trim() || null }))} />
        </Card>
      )}
      <Card label="Favorite">
        <button type="button" className={`ph-btn ${book.is_favorite ? 'primary' : ''}`} style={{ width: '100%', minHeight: 48 }} aria-pressed={!!book.is_favorite} onClick={() => void run(() => repo.updateBook(db, bookId, { is_favorite: book.is_favorite ? 0 : 1 }))}>{book.is_favorite ? 'Favorite' : 'Mark as a favorite'}</button>
      </Card>

      {(d.neighbors.prev || d.neighbors.next) && (
        <div className="ph-row" style={{ marginTop: 16 }}>
          {d.neighbors.prev ? <Link className="ph-btn" style={{ display: 'flex', alignItems: 'center' }} to={`/book/${d.neighbors.prev.book_id}/${d.neighbors.prev.read_id}`}>&#8249; {d.neighbors.prev.title}</Link> : <span />}
          {d.neighbors.next ? <Link className="ph-btn" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }} to={`/book/${d.neighbors.next.book_id}/${d.neighbors.next.read_id}`}>{d.neighbors.next.title} &#8250;</Link> : <span />}
        </div>
      )}

      {editHead && <EditHead log={log} run={run} onClose={() => setEditHead(false)} />}
      {pickChar && <PickerSheet title="Add character" placeholder="Search characters" options={d.chars} taken={log.characters.map((c) => c.id)}
        onPick={(o) => void run(() => addCharacterToBook(db, o.id, bookId, 'side'))} onCreate={(n) => void run(async () => addCharacterToBook(db, await createCharacter(db, n), bookId, 'side'))} createLabel="Create new character" onClose={() => setPickChar(false)} />}
      {pickNarrator && rid && <PickerSheet title="Add narrator" placeholder="Search narrators" options={d.narrators} taken={log.narrators.map((n) => n.narrator_id)}
        onPick={(o) => void run(() => repo.addNarratorToRead(db, rid, o.id))} onCreate={(n) => void run(async () => repo.addNarratorToRead(db, rid, await repo.createNarrator(db, n)))} createLabel="Add new narrator" onClose={() => setPickNarrator(false)} />}
      {pickSeries && <PickerSheet title="Series" placeholder="Search series" options={d.seriesOpts} taken={log.series ? [log.series.id] : []}
        onPick={(o) => void run(() => setBookSeries(db, bookId, o.id, book.series_position))} onCreate={(n) => void run(async () => setBookSeries(db, bookId, await createSeries(db, n), book.series_position))} createLabel="Create new series" onClose={() => setPickSeries(false)} />}
      {pickSource && rid && <PickerSheet title="Source" placeholder="Search sources" options={d.sources.map(toItem)}
        onPick={(o) => void run(() => repo.updateRead(db, rid, { source_id: o.id }))} onCreate={(n) => void run(async () => repo.updateRead(db, rid, { source_id: await repo.createListItem(db, 'source', n) }))} createLabel="Create new source" onClose={() => setPickSource(false)} />}
    </>
  );
}

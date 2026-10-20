import { useEffect, useState } from 'react';
import { useDb } from '../../db/DbContext';
import { addItemToLibrary, linkItemToBook, searchLibraryBooks } from '../../repo/readingOrders';
import { listSeriesOptions } from '../../repo/series';
import { fileToDataUrl, urlToDataUrl, type ShrunkImage } from '../../ui/imageFile';
import { listAuthorOptions } from '../../repo/bookLog';
import { bestMatch } from '../../domain/nameMatch';
import FieldCombo from '../locations/FieldCombo';
import { FilePicker, LinkImageForm } from '../bookLog/parts';

export interface LibraryStart { itemId: string; title: string; author: string; series: string; position: number | null }

// Puts a book from a reading order into the library, with its author, series, place in the series and a cover.
export default function AddToLibraryDialog({ start, onDone, onClose }: { start: LibraryStart; onDone(): void; onClose(): void }) {
  const db = useDb();
  const [title, setTitle] = useState(start.title);
  const [author, setAuthor] = useState(start.author);
  const [series, setSeries] = useState(start.series);
  const [position, setPosition] = useState(start.position === null ? '' : String(start.position));
  const [cover, setCover] = useState<ShrunkImage | null>(null);
  const [seriesNames, setSeriesNames] = useState<string[]>([]);
  const [authorNames, setAuthorNames] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'link' | 'new'>('new');
  const [q, setQ] = useState(start.title);
  const [hits, setHits] = useState<{ id: string; title: string; authors: string | null }[]>([]);
  useEffect(() => { if (tab !== 'link') return; let live = true; searchLibraryBooks(db, q).then((h) => live && setHits(h), () => undefined); return () => { live = false; }; }, [db, q, tab]);
  const link = async (bookId: string) => {
    setError(null); setBusy(true);
    try { await linkItemToBook(db, start.itemId, bookId); onDone(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); setBusy(false); }
  };
  useEffect(() => {
    listSeriesOptions(db).then((s) => setSeriesNames(s.map((x) => x.name)), () => undefined);
    listAuthorOptions(db).then((a) => setAuthorNames(a.map((x) => x.name)), () => undefined);
  }, [db]);
  const authorList = author.split(',').map((a) => a.trim()).filter(Boolean);
  const save = async () => {
    setError(null);
    const pos = position.trim() === '' ? null : Number(position);
    if (pos !== null && (!Number.isFinite(pos) || pos <= 0)) { setError('The position must be a number such as 1 or 2.5, or left blank.'); return; }
    setBusy(true);
    try { await addItemToLibrary(db, start.itemId, { title, author, series, position: pos, cover }); onDone(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); setBusy(false); }
  };
  return (
    <div className="overlay" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Add to library">
        <h2 className="pagetitle small2">ADD TO LIBRARY</h2>
        <div className="seg" role="tablist" aria-label="How to add">
          <button type="button" role="tab" aria-selected={tab === 'new'} className={tab === 'new' ? 'on' : ''} onClick={() => setTab('new')}>Add a new book</button>
          <button type="button" role="tab" aria-selected={tab === 'link'} className={tab === 'link' ? 'on' : ''} onClick={() => setTab('link')}>Link to a book I have</button>
        </div>
        {tab === 'link' ? (
          <>
            <span className="muted small">Already added this book on its own? Pick it and this line will link to it.</span>
            <input className="field" autoFocus aria-label="Search your library" placeholder="Search by title" value={q} onChange={(e) => setQ(e.target.value)} />
            {hits.length === 0 ? <span className="muted">{q.trim() ? 'No books match.' : 'Type a title to search.'}</span> : (
              <ul className="plainlist">
                {hits.map((h) => <li key={h.id}><button type="button" className="mini" disabled={busy} onClick={() => void link(h.id)}>Link</button> {h.title}{h.authors ? <span className="muted small"> · {h.authors}</span> : null}</li>)}
              </ul>
            )}
            {error && <div className="muted" role="alert">{error}</div>}
            <div className="actions"><button type="button" className="btn" onClick={onClose}>Cancel</button></div>
          </>
        ) : (<>
        <label className="stack"><span className="lbl2">Title</span><input className="field big" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <div className="stack"><span className="lbl2">Author (separate with commas)</span>
          <FieldCombo label="Author" noun="author" multi loose value={author} onChange={setAuthor} options={authorNames} placeholder="Optional" />
          {authorList.length > 0 && <span className="small" aria-label="Author status">{authorList.map((a, n) => { const m = bestMatch(authorNames, a); return (
            <span key={a + n}>{n > 0 && '; '}{a} <span className={m ? 'muted' : 'newtag'}>({m ? (m === a ? 'existing author' : `existing author: ${m}`) : 'new author'})</span></span>); })}</span>}
        </div>
        <div className="stack"><span className="lbl2">Series</span>
          <FieldCombo label="Series" noun="series" loose value={series} onChange={setSeries} options={seriesNames} placeholder="Optional" />
          {series.trim() && (() => { const m = bestMatch(seriesNames, series); return <span className="small" aria-label="Series status"><span className={m ? 'muted' : 'newtag'}>{m ? (m === series.trim() ? 'Existing series' : `Existing series: ${m}`) : 'New series: it will be created'}</span></span>; })()}
        </div>
        <label className="stack"><span className="lbl2">Position in series</span>
          <input className="field num" type="number" min="0" step="0.5" value={position} placeholder="Optional" onChange={(e) => setPosition(e.target.value)} />
        </label>
        <div className="stack"><span className="lbl2">Cover</span>
          <div className="actions">
            {cover && <img className="ordercover" src={cover.dataUrl} alt="Chosen cover" />}
            <FilePicker label={cover ? 'Upload a different cover' : 'Upload a cover'} onFile={(f) => void fileToDataUrl(f).then(setCover, (e) => setError(e instanceof Error ? e.message : String(e)))} />
            <LinkImageForm label="Cover from a link" onUrl={async (u) => setCover(await urlToDataUrl(u, 900))} />
            {cover && <button type="button" className="mini" onClick={() => setCover(null)}>Remove</button>}
          </div>
        </div>
        <span className="muted small">The book is added to your TBR list.</span>
        {error && <div className="muted" role="alert">{error}</div>}
        <div className="actions"><button type="button" className="btn" onClick={onClose}>Cancel</button><span className="grow" />
          <button type="button" className="btn on" disabled={busy} onClick={() => void save()}>Add to library</button></div>
        </>)}
      </div>
    </div>
  );
}

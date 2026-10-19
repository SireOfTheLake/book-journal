import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useDb } from '../../db/DbContext';
import { addCustomItem, addLibraryItem, addSeriesToOrder, deleteOrder, getOrder, moveItem, removeItem, renameOrder, searchLibraryBooks, type OrderDetail, type OrderItem } from '../../repo/readingOrders';
import { listSeriesOptions } from '../../repo/series';
import { EditText } from '../bookLog/parts';
import AddToLibraryDialog, { type LibraryStart } from './AddToLibraryDialog';

// One reading order. Drag a line (or use the arrows) to change the order.
export default function ReadingOrderPage() {
  const { orderId = '' } = useParams();
  const db = useDb();
  const nav = useNavigate();
  const [order, setOrder] = useState<OrderDetail | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [adding, setAdding] = useState<LibraryStart | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const reload = useCallback(async () => setOrder(await getOrder(db, orderId)), [db, orderId]);
  useEffect(() => { reload().catch((e) => setError(String(e))); }, [reload]);
  const run = async (fn: () => Promise<unknown>) => { setError(null); try { await fn(); await reload(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } };

  if (order === undefined) return <section><p className="muted">Loading...</p></section>;
  if (order === null) return <section><h1 className="pagetitle">READING ORDER</h1><p className="muted">That reading order is gone. <Link className="l" to="/reading-orders">Back to reading orders</Link></p></section>;

  const move = (id: string, to: number) => void run(() => moveItem(db, order.id, id, to));
  const read = order.items.filter((i) => i.is_read).length;
  const drop = (target: OrderItem) => {
    const from = dragId;
    setDragId(null); setOverId(null);
    if (from && from !== target.id) move(from, order.items.findIndex((i) => i.id === target.id));
  };

  return (
    <section>
      <h1 className="pagetitle"><Link className="l" to="/reading-orders">READING ORDERS</Link> <span className="muted small">{read} of {order.items.length} read</span></h1>
      {error && <div className="bcard warn" role="alert">{error} <button type="button" className="mini" onClick={() => setError(null)}>Dismiss</button></div>}
      <div className="bcard">
        <span className="lbl2">Name</span>
        <EditText label="Reading order name" addLabel="Add name" value={order.name} onCommit={(v) => run(() => renameOrder(db, order.id, v))} />
        <div className="actions">
          {order.series_id && <Link className="mini" to={`/series/${order.series_id}`}>Open the series</Link>}
          {order.author_id && <Link className="mini" to={`/authors/${order.author_id}`}>Open the author</Link>}
          <span className="grow" />
          {confirmDelete
            ? <><span className="muted small">Delete this reading order? Your books are not touched.</span> <button type="button" className="mini" onClick={() => void run(async () => { await deleteOrder(db, order.id); nav('/reading-orders'); })}>Yes, delete</button> <button type="button" className="mini" onClick={() => setConfirmDelete(false)}>Keep it</button></>
            : <button type="button" className="mini" onClick={() => setConfirmDelete(true)}>Delete reading order</button>}
        </div>
      </div>

      <div className="bcard">
        {order.items.length === 0 ? <p className="muted">Nothing here yet. Add books below.</p> : (
          <ol className="orderlist" aria-label="Reading order">
            {order.items.map((it, idx) => (
              <li key={it.id} className={`orderrow${dragId === it.id ? ' dragging' : ''}${overId === it.id && dragId !== it.id ? ' over' : ''}${it.is_read ? ' isread' : ''}`}
                draggable onDragStart={(e) => { setDragId(it.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', it.id); }}
                onDragOver={(e) => { if (dragId) { e.preventDefault(); setOverId(it.id); } }} onDrop={(e) => { e.preventDefault(); drop(it); }}
                onDragEnd={() => { setDragId(null); setOverId(null); }}>
                <span className="draghandle" aria-hidden="true" title="Drag to reorder">&#8942;&#8942;</span>
                <span className="ordernum">{idx + 1}</span>
                {it.cover ? <img className="ordercover" src={it.cover} alt="" /> : <span className="ordercover blank" aria-hidden="true" />}
                <span className="ordermain">
                  {it.book_id ? <Link className="l big" to={`/book/${it.book_id}`}>{it.title}</Link> : <b className="big">{it.title}</b>}
                  <span className="muted small">{[it.authors, it.series_name ? `${it.series_name}${it.series_position !== null ? ` #${it.series_position}` : ''}` : null].filter(Boolean).join(' · ') || ' '}</span>
                  <NoteEdit note={it.note} onSave={(n) => run(async () => { const { updateItemNote } = await import('../../repo/readingOrders'); await updateItemNote(db, it.id, n); })} />
                </span>
                <span className={`orderstate ${it.is_read ? 'yes' : 'no'}`}>
                  {it.is_read ? 'Read' : it.book_id ? 'Not read' : 'Not in library'}
                </span>
                <span className="orderacts">
                  {!it.book_id && <button type="button" className="mini" onClick={() => setAdding({ itemId: it.id, title: it.title, author: it.authors ?? '', series: it.series_name ?? '', position: it.series_position })}>Add to library</button>}
                  <button type="button" className="mini" aria-label={`Move ${it.title} up`} disabled={idx === 0} onClick={() => move(it.id, idx - 1)}>&uarr;</button>
                  <button type="button" className="mini" aria-label={`Move ${it.title} down`} disabled={idx === order.items.length - 1} onClick={() => move(it.id, idx + 1)}>&darr;</button>
                  <button type="button" className="mini" aria-label={`Remove ${it.title} from this list`} onClick={() => void run(() => removeItem(db, order.id, it.id))}>&times;</button>
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <AddSeries onAdd={(seriesId) => run(() => addSeriesToOrder(db, order.id, seriesId))} />
      <AddFromLibrary onAdd={(bookId) => run(() => addLibraryItem(db, order.id, bookId))} />
      <AddOther onAdd={(i) => run(() => addCustomItem(db, order.id, i))} />
      {adding && <AddToLibraryDialog start={adding} onClose={() => setAdding(null)} onDone={() => { setAdding(null); void reload(); }} />}
    </section>
  );
}

function NoteEdit({ note, onSave }: { note: string | null; onSave(n: string): void }) {
  return <EditText label="Note" addLabel="Add note" className="ordernote" value={note} placeholder="A note, for example: story 3 of 5" onCommit={(v) => onSave(v)} />;
}

function AddFromLibrary({ onAdd }: { onAdd(bookId: string): void }) {
  const db = useDb();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<{ id: string; title: string; authors: string | null }[]>([]);
  useEffect(() => { let live = true; searchLibraryBooks(db, q).then((h) => live && setHits(h), () => undefined); return () => { live = false; }; }, [db, q]);
  return (
    <div className="bcard">
      <span className="lbl2">Add a book from your library</span>
      <input className="field" aria-label="Search your library" placeholder="Search by title" value={q} onChange={(e) => setQ(e.target.value)} />
      {hits.length > 0 && (
        <ul className="plainlist">
          {hits.map((h) => <li key={h.id}><button type="button" className="mini" onClick={() => { onAdd(h.id); setQ(''); }}>Add</button> {h.title}{h.authors ? <span className="muted small"> · {h.authors}</span> : null}</li>)}
        </ul>
      )}
    </div>
  );
}

function AddOther({ onAdd }: { onAdd(i: { title: string; author: string; series: string; seriesPosition: number | null; note: string }): void }) {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [series, setSeries] = useState('');
  const [pos, setPos] = useState('');
  const [note, setNote] = useState('');
  const submit = () => {
    if (!title.trim()) return;
    onAdd({ title, author, series, seriesPosition: pos.trim() === '' || !Number.isFinite(Number(pos)) ? null : Number(pos), note });
    setTitle(''); setAuthor(''); setSeries(''); setPos(''); setNote('');
  };
  return (
    <div className="bcard">
      <span className="lbl2">Add a book that is not in your library</span>
      <span className="muted small">For planning, or for a story that is part of a collection. You can add it to your library later.</span>
      <div className="orderother">
        <input className="field" aria-label="Title" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        <input className="field" aria-label="Author" placeholder="Author" value={author} onChange={(e) => setAuthor(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        <input className="field" aria-label="Series" placeholder="Series" value={series} onChange={(e) => setSeries(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        <input className="field num" type="number" aria-label="Position in series" placeholder="#" step="0.5" value={pos} onChange={(e) => setPos(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        <input className="field" aria-label="Note" placeholder="Note, for example: story in a collection" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        <button type="button" className="btn on" onClick={submit}>Add</button>
      </div>
    </div>
  );
}

function AddSeries({ onAdd }: { onAdd(seriesId: string): void }) {
  const db = useDb();
  const [options, setOptions] = useState<{ id: string; name: string }[]>([]);
  const [pick, setPick] = useState('');
  useEffect(() => { listSeriesOptions(db).then(setOptions, () => undefined); }, [db]);
  return (
    <div className="bcard">
      <span className="lbl2">Add a whole series</span>
      <span className="muted small">Adds every book in the series, in series order, to the end of the list. Books already here are skipped.</span>
      <div className="ordernew">
        <select className="field" aria-label="Series to add" value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">Choose a series</option>
          {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <button type="button" className="btn on" disabled={!pick} onClick={() => { onAdd(pick); setPick(''); }}>Add series</button>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDb } from '../../db/DbContext';
import { listAuthorOptions } from '../../repo/bookLog';
import { createOrder, listOrders, type OrderSummary } from '../../repo/readingOrders';
import { listSeriesOptions } from '../../repo/series';

type Basis = 'none' | 'series' | 'author';

// Your reading orders: lists of books in the order you mean to read them.
export default function ReadingOrdersPage() {
  const db = useDb();
  const nav = useNavigate();
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [series, setSeries] = useState<{ id: string; name: string }[]>([]);
  const [authors, setAuthors] = useState<{ id: string; name: string }[]>([]);
  const [name, setName] = useState('');
  const [basis, setBasis] = useState<Basis>('none');
  const [pick, setPick] = useState('');
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => setOrders(await listOrders(db)), [db]);
  useEffect(() => {
    reload().catch((e) => setError(String(e)));
    listSeriesOptions(db).then(setSeries, () => undefined);
    listAuthorOptions(db).then(setAuthors, () => undefined);
  }, [db, reload]);
  const options = basis === 'series' ? series : basis === 'author' ? authors : [];
  const choose = (id: string) => {
    setPick(id);
    const o = options.find((x) => x.id === id);
    if (o && !name.trim()) setName(`${o.name} reading order`);
  };
  const create = async () => {
    setError(null);
    try {
      const id = await createOrder(db, name, { seriesId: basis === 'series' ? pick || null : null, authorId: basis === 'author' ? pick || null : null });
      nav(`/reading-orders/${id}`);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  return (
    <section>
      <h1 className="pagetitle">READING ORDERS <span className="muted small">Books lined up in the order you want to read them</span></h1>
      {error && <div className="bcard warn" role="alert">{error}</div>}
      <div className="bcard">
        <span className="lbl2">New reading order</span>
        <div className="ordernew">
          <input className="field" aria-label="Reading order name" placeholder="Name, for example Discworld in order" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void create()} />
          <select className="field" aria-label="Start from" value={basis} onChange={(e) => { setBasis(e.target.value as Basis); setPick(''); }}>
            <option value="none">Start empty</option>
            <option value="series">Start from a series</option>
            <option value="author">Start from an author</option>
          </select>
          {basis !== 'none' && (
            <select className="field" aria-label={basis === 'series' ? 'Series' : 'Author'} value={pick} onChange={(e) => choose(e.target.value)}>
              <option value="">{basis === 'series' ? 'Choose a series' : 'Choose an author'}</option>
              {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          )}
          <button type="button" className="btn on" onClick={() => void create()}>Create</button>
        </div>
        <span className="muted small">Starting from a series or author fills the list with the books you have; you can reorder it and add books you do not have.</span>
      </div>
      <div className="bcard">
        {orders === null ? <p className="muted">Loading...</p> : orders.length === 0 ? <p className="muted">No reading orders yet.</p> : (
          <table className="ordertable">
            <thead><tr><th>Reading order</th><th>Authors</th><th>Series</th><th>Read</th></tr></thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td><Link className="l big" to={`/reading-orders/${o.id}`}>{o.name}</Link></td>
                  <td>{o.authors.join(', ') || <span className="muted">-</span>}</td>
                  <td>{o.series.join(', ') || <span className="muted">-</span>}</td>
                  <td>{o.read} of {o.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

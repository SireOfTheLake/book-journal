import { useState } from 'react';
import { Link } from 'react-router-dom';
import { combineText } from '../domain/bookMerge';
import { storedToStars } from '../domain/rating';
import type { FieldKey, FieldPlan, MergePlan, MergeRead, Pick } from '../repo/bookMerge';

const Value = ({ f, v, cover }: { f: FieldPlan; v: string | null; cover: string | null }) => (
  <span className="mrg-val">{f.image ? (cover ? <img src={cover} alt="" /> : <span className="muted">No cover</span>) : v ?? <span className="muted">Nothing</span>}</span>
);

// The review of a merge: what each book has, what is filled in, and a decision for every field where both have something different.
const STATUS: Record<string, string> = { reading: 'In progress', finished: 'Finished', on_hold: 'Paused', dnf: 'Did not finish' };
const readLabel = (r: MergeRead) => `${STATUS[r.status] ?? r.status}${r.finish_date ? ` ${r.finish_date}` : r.start_date ? ` (started ${r.start_date})` : ''}`;
const readDetail = (r: MergeRead) => {
  const bits = [r.rating !== null ? `${storedToStars(r.rating)} stars` : null, r.format, r.days ? `${r.days} daily log entr${r.days === 1 ? 'y' : 'ies'}` : null, r.challenges.length ? `in ${r.challenges.join(', ')}` : null].filter(Boolean);
  return bits.length ? ` · ${bits.join(' · ')}` : '';
};

export default function BookMergeView({ plan, onMerge, onCancel, error }: { plan: MergePlan; onMerge(picks: Partial<Record<FieldKey, Pick>>, keepReads: string[]): void; onCancel(): void; error?: string | null }) {
  const [picks, setPicks] = useState<Partial<Record<FieldKey, Pick>>>({});
  const [keep, setKeep] = useState<Set<string>>(() => new Set(plan.reads.map((r) => r.id)));
  const toggle = (id: string) => setKeep((k) => { const n = new Set(k); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const conflicts = plan.fields.filter((f) => f.state === 'conflict');
  const filled = plan.fields.filter((f) => f.state === 'only_b');
  const kept = plan.fields.filter((f) => f.state === 'only_a' || f.state === 'same');
  const left = conflicts.filter((f) => !picks[f.key]).length;
  const cover = (f: FieldPlan, which: 'a' | 'b') => (f.image ? plan[which].cover : null);
  return (
    <div className="mrg">
      <p className="small"><Link className="l inline" to={`/book/${plan.a.id}`}>&larr; Back to {plan.a.title}</Link></p>
      <h1 className="pagetitle">MERGE BOOKS</h1>
      <span className="muted">The other book is merged into this one and then removed. You choose which reads to keep; nothing is lost without you choosing it.</span>
      {error && <div className="bcard warn" role="alert">{error}</div>}
      <section className="bcard mrg-sides" aria-label="The two books">
        <span />
        {([['a', 'This book (kept)'], ['b', 'The other book (merged in, then removed)']] as const).map(([k, h]) => (
          <div key={k} className="mrg-side"><span className="lbl2">{h}</span><b>{plan[k].title}</b>
            <span className="muted small">{plan[k].authors ?? 'No author'} · {plan[k].reads} read{plan[k].reads === 1 ? '' : 's'}</span>
            {plan[k].cover && <img src={plan[k].cover!} alt={`Cover of ${plan[k].title}`} />}</div>
        ))}
      </section>

      <section className="bcard" aria-label="Needs your decision">
        <h2 className="lbl2">{conflicts.length ? `Needs your decision (${conflicts.length})` : 'Nothing to decide'}</h2>
        {conflicts.length === 0 && <span className="muted small">The two books never disagree, so there is nothing to choose.</span>}
        <div className="mrg-rows">
          {conflicts.map((f) => {
            const p = picks[f.key];
            const both = f.text ? combineText(f.a, f.b) : null;
            const opt = (which: Pick, text: string, el: React.ReactNode) => (
              <label className={`mrg-opt${p === which ? ' on' : ''}`}>
                <input type="radio" name={`m-${f.key}`} checked={p === which} aria-label={`${f.label}: ${text}`} onChange={() => setPicks((x) => ({ ...x, [f.key]: which }))} />
                <span><span className="muted small">{text}</span><br />{el}</span>
              </label>
            );
            return (
              <div key={f.key} className="mrg-row" role="group" aria-label={f.label}>
                <span className="mrg-lbl">{f.label}</span>
                {opt('a', 'Use this book\'s', <Value f={f} v={f.a} cover={cover(f, 'a')} />)}
                {opt('b', 'Use the other book\'s', <Value f={f} v={f.b} cover={cover(f, 'b')} />)}
                {f.text && <div className="mrg-both">{opt('both', 'Combine both, one after the other', <span className="mrg-val">{both}</span>)}</div>}
              </div>
            );
          })}
        </div>
      </section>

      {filled.length > 0 && (
        <section className="bcard" aria-label="Filled in from the other book">
          <h2 className="lbl2">Filled in from the other book ({filled.length})</h2>
          <span className="muted small">This book had nothing in these fields, so they are filled in.</span>
          <div className="mrg-rows">{filled.map((f) => (
            <div key={f.key} className="mrg-row"><span className="mrg-lbl">{f.label}</span><span className="muted small">Blank</span><div className="mrg-opt mrg-chosen none"><Value f={f} v={f.b} cover={cover(f, 'b')} /></div></div>
          ))}</div>
        </section>
      )}

      <section className="bcard" aria-label="Reads to keep">
        <h2 className="lbl2">Reads to keep ({keep.size} of {plan.reads.length})</h2>
        <span className="muted small">Every read of both books is listed. The ones you keep end up on the merged book with their rating, notes, daily log and challenge picks; a read you untick is deleted. Keep one, several or all.</span>
        <ul className="mrg-reads">
          {plan.reads.map((r) => {
            const book = plan[r.side];
            return (
              <li key={r.id}><label className={`mrg-opt${keep.has(r.id) ? ' on' : ''}`}>
                <input type="checkbox" checked={keep.has(r.id)} aria-label={`Keep ${readLabel(r)} from ${book.title}`} onChange={() => toggle(r.id)} />
                <span><span className="muted small">{r.side === 'a' ? 'This book' : 'The other book'}: {book.title}</span><br />
                  <b>{readLabel(r)}</b>
                  <span className="muted small">{readDetail(r)}</span>
                  {r.notes && <><br /><span className="muted small mrg-notes">{r.notes.length > 140 ? `${r.notes.slice(0, 140)}...` : r.notes}</span></>}</span>
              </label></li>
            );
          })}
        </ul>
        {keep.size === 0 && plan.reads.length > 0 && <span className="muted small" role="note">No reads are kept, so the merged book will have no reading history.</span>}
      </section>

      <section className="bcard" aria-label="Combined automatically">
        <h2 className="lbl2">Moved over and combined</h2>
        <ul className="mrg-list">
          {plan.adds.map((a) => <li key={a.label}><b>{a.label}</b> added: {a.names.join(', ')}</li>)}
          {plan.favorite && <li>The other book is a favorite, so this one becomes a favorite.</li>}
          {plan.adds.length === 0 && <li className="muted">Both books have the same authors, tags, characters, places and release dates.</li>}
        </ul>
      </section>

      {kept.length > 0 && (
        <section className="bcard" aria-label="Kept as they are">
          <h2 className="lbl2">Kept as they are ({kept.length})</h2>
          <span className="muted small">{kept.map((f) => `${f.label}${f.state === 'same' ? ' (same)' : ''}`).join(' · ')}</span>
        </section>
      )}

      <div className="mrg-bar">
        <button type="button" className="btn" onClick={onCancel}>Cancel</button><span className="grow" />
        {left > 0 && <span className="muted small" role="status">{left} decision{left === 1 ? '' : 's'} left</span>}
        <button type="button" className="btn on" disabled={left > 0} onClick={() => onMerge(picks, plan.reads.filter((r) => keep.has(r.id)).map((r) => r.id))}>Merge the books</button>
      </div>
    </div>
  );
}

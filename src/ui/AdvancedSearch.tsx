import { useContext, useEffect, useMemo, useState } from 'react';
import { DbContext } from '../db/DbContext';
import {
  FIELDS, NUMBER_OPS, SORT_OPTIONS, TEXT_OPS, activeConditions, describeAdvanced, emptyAdvanced, isActive, isNumberField, narrowBy, newCondition, runAdvanced,
  type Advanced, type BookFacts, type Condition, type Field, type SortKey,
} from '../domain/advancedSearch';
import { listBookFacts } from '../repo/search';

let nextId = 1;

/** The facts advanced search needs, loaded once the panel is wanted. Null until they arrive (or when there is no database). */
export function useBookFacts(wanted: boolean): BookFacts[] | null {
  const db = useContext(DbContext);
  const [facts, setFacts] = useState<BookFacts[] | null>(null);
  useEffect(() => {
    if (!wanted || !db || facts) return;
    let live = true;
    listBookFacts(db).then((f) => { if (live) setFacts(f); }, () => { if (live) setFacts([]); });
    return () => { live = false; };
  }, [wanted, db, facts]);
  return facts;
}

/** Everything a page needs to add advanced search: its state, and a function that narrows the page's own list. */
export function useAdvanced(initial?: Advanced, startOpen = false) {
  const [open, setOpen] = useState(startOpen);
  const [adv, setAdv] = useState<Advanced>(initial ?? emptyAdvanced());
  const active = isActive(adv);
  const facts = useBookFacts(open || active);
  const ids = useMemo(() => (facts && active ? runAdvanced(facts, adv) : null), [facts, adv, active]);
  const waiting = active && !facts; // the facts have not arrived yet, so nothing can be narrowed
  const apply = <T extends { id: string }>(list: readonly T[]): T[] => narrowBy(list, ids, adv.sort !== 'none');
  return { open, setOpen, adv, setAdv, active, ids, waiting, apply, count: ids?.length ?? null };
}

/** The button that opens the panel, with a count of the conditions in use. */
export function AdvancedButton({ s, className = 'mini' }: { s: ReturnType<typeof useAdvanced>; className?: string }) {
  const n = activeConditions(s.adv).length;
  return <button type="button" className={`${className} ${s.active ? 'activebtn' : ''}`} aria-expanded={s.open} onClick={() => s.setOpen(!s.open)}>{n ? `Advanced search (${n})` : 'Advanced search'}</button>;
}

export default function AdvancedSearch({ s, shown, total }: { s: ReturnType<typeof useAdvanced>; shown: number; total: number }) {
  const { adv, setAdv } = s;
  const set = (id: number, patch: Partial<Condition>) => setAdv({ ...adv, conds: adv.conds.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const changeField = (c: Condition, field: Field) => set(c.id, isNumberField(field) === isNumberField(c.field) ? { field } : { field, op: newCondition(0, field).op, value: '' });
  const add = () => setAdv({ ...adv, conds: [...adv.conds, newCondition(nextId++)] });
  // A new panel starts with one row ready to fill in.
  useEffect(() => { if (!adv.conds.length) setAdv({ ...adv, conds: [newCondition(nextId++)] }); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  return (
    <section className="bcard advpanel" aria-label="Advanced search">
      <div className="bltools">
        <span className="lbl2">Advanced search</span>
        <span className="muted small">Show books where</span>
        <div className="seg" role="group" aria-label="Match">
          <button type="button" aria-pressed={adv.match === 'all'} className={adv.match === 'all' ? 'on' : ''} onClick={() => setAdv({ ...adv, match: 'all' })}>All of these</button>
          <button type="button" aria-pressed={adv.match === 'any'} className={adv.match === 'any' ? 'on' : ''} onClick={() => setAdv({ ...adv, match: 'any' })}>Any of these</button>
        </div>
        <span className="grow" />
        <button type="button" className="rowx" aria-label="Close advanced search" title="Close" onClick={() => s.setOpen(false)}>&times;</button>
      </div>
      <div className="advrows">
        {adv.conds.map((c, i) => (
          <div key={c.id} className="advrow">
            <select aria-label={`Condition ${i + 1} field`} value={c.field} onChange={(e) => changeField(c, e.target.value as Field)}>{FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}</select>
            <select aria-label={`Condition ${i + 1} operator`} value={c.op} onChange={(e) => set(c.id, { op: e.target.value as Condition['op'] })}>
              {(isNumberField(c.field) ? NUMBER_OPS : TEXT_OPS).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <input className="field grow" type={isNumberField(c.field) ? 'number' : 'text'} step={c.field === 'rating' ? '0.25' : undefined} aria-label={`Condition ${i + 1} value`} placeholder={isNumberField(c.field) ? 'Number' : 'Type a word or name'} value={c.value}
              onChange={(e) => set(c.id, { value: e.target.value })} />
            <button type="button" className="rowx" aria-label={`Remove condition ${i + 1}`} title="Remove" onClick={() => setAdv({ ...adv, conds: adv.conds.filter((x) => x.id !== c.id) })}>&times;</button>
          </div>
        ))}
        <button type="button" className="mini addchar" onClick={add}>+ Add a condition</button>
      </div>
      <div className="bltools">
        <label className="inline"><span className="muted small">Sort by</span>
          <select aria-label="Advanced sort" value={adv.sort} onChange={(e) => setAdv({ ...adv, sort: e.target.value as SortKey })}>{SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
        {adv.sort !== 'none' && (
          <div className="seg" role="group" aria-label="Sort direction">
            <button type="button" aria-pressed={!adv.desc} className={!adv.desc ? 'on' : ''} onClick={() => setAdv({ ...adv, desc: false })}>{adv.sort === 'pages' || adv.sort === 'rating' ? 'Low to high' : 'A to Z'}</button>
            <button type="button" aria-pressed={adv.desc} className={adv.desc ? 'on' : ''} onClick={() => setAdv({ ...adv, desc: true })}>{adv.sort === 'pages' || adv.sort === 'rating' ? 'High to low' : 'Z to A'}</button>
          </div>
        )}
        <span className="grow" />
        {s.active && <span className="muted small" role="status">{s.waiting ? 'Searching...' : `${shown} of ${total} match${activeConditions(adv).length ? `: ${describeAdvanced(adv)}` : ''}`}</span>}
        <button type="button" className="mini" onClick={() => setAdv({ ...emptyAdvanced(), conds: [newCondition(nextId++)] })}>Clear</button>
      </div>
    </section>
  );
}

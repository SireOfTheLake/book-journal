import { RECENT_DECADES } from '../../repo/bookLog';
import ManageList from './ManageList';
import { Card, EditSelect, EditText } from './parts';

interface Item { id: string; name: string }
const norm = (s: string | undefined) => (s ?? '').trim().toLowerCase();

// The book's time period. Historical can carry a specific era; Recent History carries a decade.
// "Manage" lists every period so any of them can be taken off the list.
export default function TimePeriodCard({ periodId, detail, options, onPick, onDetail, onCreate, onRemove, onRename }: {
  periodId: string | null; detail: string | null; options: Item[];
  onPick(id: string | null): void; onDetail(v: string | null): void; onCreate(name: string): void; onRemove(id: string): void; onRename(id: string, name: string): void;
}) {
  const name = norm(options.find((o) => o.id === periodId)?.name);
  return (
    <Card label="Time period">
      <EditSelect label="Time period" value={periodId} options={options.map((o) => ({ value: o.id, label: o.name }))} onChange={onPick} onCreate={onCreate} />
      {name === 'historical' && <EditText label="Historical era" addLabel="Add an era (optional)" value={detail} onCommit={(v) => onDetail(v.trim() || null)} />}
      {name === 'recent history' && (
        <select className="field" aria-label="Decade" value={detail ?? ''} onChange={(e) => onDetail(e.target.value || null)}>
          <option value="">Any decade</option>
          {[...new Set([...RECENT_DECADES, ...(detail ? [detail] : [])])].map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      )}
      <ManageList items={options} noun="Time period" onRename={onRename} onRemove={onRemove} consequence="Removing a period clears it from the books that use it." />
    </Card>
  );
}

import { EditText } from '../bookLog/parts';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const pretty = (d: string) => { const [y, m, day] = d.split('-').map(Number); return `${MONTHS[m - 1]} ${day}, ${y}`; };

// The dates a challenge shows on Home. Same date picker as the book log: the start cannot be after the end, the end cannot be before the start,
// and each picker opens on the other date so the range is quick to set.
export default function ActiveWindow({ from, until, onChange }: { from: string | null; until: string | null; onChange(from: string | null, until: string | null): void }) {
  return (
    <div className="bcard activewin" role="group" aria-label="Active on Home">
      <span className="lbl2">Active on Home</span>
      <span className="addrow">
        <EditText label="Active from" addLabel="Add start date" type="date" max={until} initial={until} value={from} display={from ? pretty(from) : undefined} onCommit={(v) => onChange(v || null, until)} />
        <span className="muted small">to</span>
        <EditText label="Active until" addLabel="Add end date" type="date" min={from} initial={from} value={until} display={until ? pretty(until) : undefined} onCommit={(v) => onChange(from, v || null)} />
        {(from || until) && <button type="button" className="mini" onClick={() => onChange(null, null)}>Clear dates</button>}
      </span>
      <span className="muted small">{from || until ? 'Shows on Home between these dates.' : 'No dates set, so it does not appear in the Home season list.'}</span>
    </div>
  );
}

// "Oct 1, 2027 to Dec 31, 2027", "From Oct 1, 2027", "Until Dec 31, 2027", or null when no dates are set.
export function windowText(from: string | null, until: string | null): string | null {
  if (from && until) return `${pretty(from)} to ${pretty(until)}`;
  if (from) return `From ${pretty(from)}`;
  if (until) return `Until ${pretty(until)}`;
  return null;
}

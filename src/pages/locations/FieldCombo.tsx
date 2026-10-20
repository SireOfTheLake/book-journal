import { useState } from 'react';
import { norm } from '../../domain/geo';
import { bestMatch, nameKey } from '../../domain/nameMatch';

// A text box that suggests what already exists as you type. Anything you type is accepted: pick a suggestion, or keep your own words as a new one.
export default function FieldCombo({ label, value, onChange, options, noun, placeholder = 'Optional', limit = 8, multi = false, loose = false }: { label: string; value: string; onChange(v: string): void; options: string[]; noun: string; placeholder?: string; limit?: number; multi?: boolean; loose?: boolean }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // With "multi", several names are separated by commas and the suggestions work on the last one.
  const cut = multi ? value.lastIndexOf(',') + 1 : 0;
  const head = value.slice(0, cut);
  const current = value.slice(cut).trim();
  const q = norm(current);
  const hit = (o: string) => norm(o).includes(q) || (loose && nameKey(current) !== '' && nameKey(o).includes(nameKey(current)));
  const shown = (q ? options.filter(hit) : options).slice(0, limit);
  const exact = loose ? bestMatch(options, current) !== null && nameKey(bestMatch(options, current)!) === nameKey(current) : options.some((o) => norm(o) === q);
  const rows: { text: string; isNew: boolean }[] = [...shown.map((text) => ({ text, isNew: false })), ...(current && !exact ? [{ text: current, isNew: true }] : [])];
  const pick = (r: { text: string }) => { onChange(multi && head ? `${head.trimEnd()} ${r.text}` : r.text); setOpen(false); setActive(0); };
  return (
    <div className="combo">
      <input className="field" role="combobox" aria-label={label} aria-expanded={open} autoComplete="off" value={value} placeholder={placeholder}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(e) => { onChange(e.target.value); setActive(0); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, rows.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === 'Enter' && open && rows[active]) { e.preventDefault(); pick(rows[active]); }
          else if (e.key === 'Escape') setOpen(false);
        }} />
      {open && rows.length > 0 && (
        <ul className="suggest" role="listbox" aria-label={`${label} suggestions`}>
          {rows.map((r, i) => (
            <li key={r.text + r.isNew} role="option" aria-selected={i === active} className={i === active ? 'on' : ''} onMouseDown={(e) => { e.preventDefault(); pick(r); }}>
              {r.isNew ? <>Add <b>{r.text}</b> as a new {noun}</> : r.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

import { useState } from 'react';
import { norm } from '../../domain/geo';

// A text box that suggests what already exists as you type. Anything you type is accepted: pick a suggestion, or keep your own words as a new one.
export default function FieldCombo({ label, value, onChange, options, noun, placeholder = 'Optional', limit = 8 }: { label: string; value: string; onChange(v: string): void; options: string[]; noun: string; placeholder?: string; limit?: number }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const q = norm(value);
  const shown = (q ? options.filter((o) => norm(o).includes(q)) : options).slice(0, limit);
  const exact = options.some((o) => norm(o) === q);
  const rows: { text: string; isNew: boolean }[] = [...shown.map((text) => ({ text, isNew: false })), ...(value.trim() && !exact ? [{ text: value.trim(), isNew: true }] : [])];
  const pick = (r: { text: string }) => { onChange(r.text); setOpen(false); setActive(0); };
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

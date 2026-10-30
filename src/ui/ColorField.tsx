import { useEffect, useRef, useState } from 'react';
import ColorPicker from './ColorPicker';

// A round button showing a color; it opens the color picker beside it.
export default function ColorField({ value, label, onPick }: { value: string; label: string; onPick(hex: string): void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', h); document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, [open]);
  return (
    <span className="colorfield" ref={ref}>
      <button type="button" className="colorbtn" aria-label={label} aria-expanded={open} onClick={() => setOpen(!open)}><i style={{ background: value }} />{value.toLowerCase()}</button>
      {open && <div className="colorpop"><ColorPicker value={value} label={label} onChange={onPick} /></div>}
    </span>
  );
}

import { useEffect, useRef, useState } from 'react';

// The challenge's description, a quiet line under the header. While editing it is a text box that grows with the text and saves when you leave it or press Escape.
export default function Blurb({ text, editing, onSave }: { text: string | null; editing: boolean; onSave?(text: string): void }) {
  const [v, setV] = useState(text ?? '');
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => setV(text ?? ''), [text]);
  useEffect(() => { const t = ref.current; if (t) { t.style.height = 'auto'; t.style.height = `${t.scrollHeight}px`; } }, [v, editing]);
  const save = () => { if (v.trim() !== (text ?? '').trim()) onSave?.(v); };
  if (editing && onSave) {
    return <textarea ref={ref} className="field chalblurb edit" rows={1} aria-label="Challenge description" placeholder="Add a description" value={v}
      onChange={(e) => setV(e.target.value)} onBlur={save} onKeyDown={(e) => { if (e.key === 'Escape') e.currentTarget.blur(); }} />;
  }
  return text ? <p className="chalblurb">{text}</p> : null;
}

import { useEffect, useRef, useState } from 'react';
import { useDb } from '../../db/DbContext';
import { listTagColors, setTagColor, type TagColorRow, type TagKind } from '../../repo/theme';

const KINDS: { value: TagKind; label: string }[] = [{ value: 'genre', label: 'Genres' }, { value: 'theme', label: 'Themes' }, { value: 'trope', label: 'Tropes' }];
const NONE = '#6a5a4a';

export default function TagColorsCard({ saveDelay = 400 }: { saveDelay?: number }) {
  const db = useDb();
  const [kind, setKind] = useState<TagKind>('genre');
  const [rows, setRows] = useState<TagColorRow[] | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => { setRows(null); listTagColors(db, kind).then(setRows).catch((e) => setError(String(e))); }, [db, kind]);
  useEffect(() => () => timers.current.forEach((t) => clearTimeout(t)), []);

  const change = (id: string, color: string) => {
    setRows((rs) => rs && rs.map((r) => (r.id === id ? { ...r, color } : r)));
    const old = timers.current.get(id);
    if (old) clearTimeout(old);
    timers.current.set(id, setTimeout(() => { timers.current.delete(id); setTagColor(db, kind, id, color).catch((e) => setError(String(e))); }, saveDelay));
  };
  const q = query.trim().toLowerCase();
  const shown = (rows ?? []).filter((r) => !q || r.name.toLowerCase().includes(q));
  return (
    <div className="bcard">
      <span className="lbl2">Tag colors</span>
      <p className="muted small">The color each genre, theme, and trope shows in. New tags get a random color; change any of them here.</p>
      <div className="bltools">
        <div className="seg" role="group" aria-label="Kind of tag">
          {KINDS.map((k) => <button type="button" key={k.value} className={kind === k.value ? 'on' : ''} aria-pressed={kind === k.value} onClick={() => setKind(k.value)}>{k.label}</button>)}
        </div>
        <input className="field search2" placeholder="Find a tag" aria-label="Find a tag" value={query} onChange={(e) => setQuery(e.target.value)} />
        <span className="grow" />
        <span className="muted">{rows ? `${shown.length} of ${rows.length}` : ''}</span>
      </div>
      {error && <div className="fielderr" role="alert">{error}</div>}
      <div className="tagcolors">
        {shown.map((r) => (
          <label key={r.id} className="tagcolor">
            <input type="color" aria-label={`Color for ${r.name}`} value={r.color ?? NONE} onChange={(e) => change(r.id, e.target.value)} />
            <span className="tcname">{r.name}</span>
            <span className="muted small">{r.books} {r.books === 1 ? 'book' : 'books'}</span>
          </label>
        ))}
        {rows && shown.length === 0 && <span className="muted">{rows.length ? 'No tags match.' : 'None yet. They appear when you add them to a book.'}</span>}
      </div>
    </div>
  );
}

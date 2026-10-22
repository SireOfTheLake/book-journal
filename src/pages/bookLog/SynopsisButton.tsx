import { useState } from 'react';

// "Read synopsis" (or "Add synopsis" when there is none) opens the saved blurb, which can be edited or deleted.
export default function SynopsisButton({ title, value, onSave }: { title: string; value: string | null; onSave(text: string | null): void }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [sure, setSure] = useState(false);

  const show = () => { setText(value ?? ''); setEditing(!value); setSure(false); setOpen(true); };
  const close = () => { setOpen(false); setEditing(false); setSure(false); };
  const save = () => { onSave(text.trim() || null); if (text.trim()) setEditing(false); else close(); };

  return (
    <>
      <button type="button" className="btn synopsisbtn" onClick={show}>{value ? 'Read synopsis' : 'Add synopsis'}</button>
      {open && (
        <div className="overlay" onKeyDown={(e) => e.key === 'Escape' && close()}>
          <div className="dialog wide" role="dialog" aria-modal="true" aria-label={`Synopsis of ${title}`}>
            <h2 className="pagetitle small2">SYNOPSIS <span className="muted small">{title}</span></h2>
            {editing ? (
              <>
                <textarea className="field" rows={10} autoFocus aria-label="Synopsis" value={text} onChange={(e) => setText(e.target.value)} />
                <div className="actions dialogbtns">
                  <button type="button" className="btn on" onClick={save}>Save</button>
                  <button type="button" className="btn" onClick={() => (value ? setEditing(false) : close())}>Cancel</button>
                </div>
              </>
            ) : (
              <>
                <p className="synopsistext">{value}</p>
                {sure ? (
                  <div className="actions dialogbtns">
                    <span className="muted">Delete this synopsis?</span>
                    <button type="button" className="btn danger" onClick={() => { onSave(null); close(); }}>Delete it</button>
                    <button type="button" className="btn" onClick={() => setSure(false)}>Keep it</button>
                  </div>
                ) : (
                  <div className="actions dialogbtns">
                    <button type="button" className="btn" onClick={() => { setText(value ?? ''); setEditing(true); }}>Edit</button>
                    <button type="button" className="btn" onClick={() => setSure(true)}>Delete</button>
                    <button type="button" className="btn on" onClick={close}>Close</button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

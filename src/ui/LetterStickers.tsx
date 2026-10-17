import { useRef, useState } from 'react';
import { ALPHABET, letterFromFileName } from '../domain/words';

// The 26 letter stickers: one box per letter to add or replace its picture, and a button that takes many pictures at once (a file named A.png goes to A).
export default function LetterStickers({ letters, onSet, onRemove, editable = true }: {
  letters: Record<string, string>; onSet(letter: string, file: File): void | Promise<void>; onRemove(letter: string): void; editable?: boolean;
}) {
  const bulk = useRef<HTMLInputElement>(null);
  const single = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const have = ALPHABET.filter((l) => letters[l]).length;
  const many = async (files: File[]) => {
    const skipped: string[] = [];
    for (const f of files) { const l = letterFromFileName(f.name); if (l) await onSet(l, f); else skipped.push(f.name); }
    setNote(skipped.length ? `${skipped.length} file${skipped.length === 1 ? '' : 's'} not used because the name is not a single letter (like A.png): ${skipped.join(', ')}` : null);
  };
  return (
    <div className="letterbox">
      <ul className="letters" aria-label="Letter stickers">
        {ALPHABET.map((l) => (
          <li key={l} className={letters[l] ? 'letter got' : 'letter'}>
            {editable ? (
              <button type="button" className="lbtn" aria-label={letters[l] ? `Replace the sticker for ${l}` : `Add the sticker for ${l}`} onClick={() => { setPending(l); single.current?.click(); }}>
                {letters[l] ? <img src={letters[l]} alt="" /> : <span aria-hidden="true">{l}</span>}
              </button>
            ) : <span className="lbtn">{letters[l] ? <img src={letters[l]} alt={`Sticker ${l}`} /> : <span aria-hidden="true">{l}</span>}</span>}
            {editable && letters[l] && <button type="button" className="xbtn" aria-label={`Remove the sticker for ${l}`} onClick={() => onRemove(l)}>&times;</button>}
          </li>
        ))}
      </ul>
      {editable && (
        <div className="addrow">
          <button type="button" className="mini" onClick={() => bulk.current?.click()}>+ Upload several</button>
          <span className="muted small">{`${have} of 26 letters have a sticker. Name each file for its letter (A.png, B.png...) to add many at once.`}</span>
          <input ref={bulk} type="file" accept="image/*" multiple hidden aria-label="Upload letter stickers" onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; if (f.length) void many(f); }} />
          <input ref={single} type="file" accept="image/*" hidden aria-label="Upload one letter sticker" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f && pending) void onSet(pending, f); }} />
        </div>
      )}
      {note && <span className="muted small" role="alert">{note}</span>}
    </div>
  );
}

import { useRef, useState } from 'react';
import { fileToDataUrl } from '../../ui/imageFile';
import type { StickerImage } from '../../repo/challenges';
import { promptFromFileName, splitPrompts } from '../../domain/challenges';

// group: the sub-category the sticker goes in (its id or name, depending on the screen); empty = the main prompts.
export interface Staged { key: number; image: StickerImage; prompt: string; group?: string }
export interface GroupChoice { value: string; label: string }
let counter = 0;

// Upload a batch of stickers, see each one, and give each a prompt. Prompts can also be pasted as a list and filled in sticker order.
export default function StickerStaging({ value, onChange, groups = [], defaultGroup = '' }: { value: Staged[]; onChange(next: Staged[]): void; groups?: GroupChoice[]; defaultGroup?: string }) {
  const file = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [list, setList] = useState('');
  const upload = async (files: File[]) => {
    setError(null);
    const added: Staged[] = [];
    for (const f of files) {
      try { added.push({ key: ++counter, image: await fileToDataUrl(f, 400), prompt: promptFromFileName(f.name), group: defaultGroup }); } catch { setError(`"${f.name}" could not be read as a picture.`); }
    }
    if (added.length) onChange([...value, ...added]);
  };
  const set = (key: number, prompt: string) => onChange(value.map((s) => (s.key === key ? { ...s, prompt } : s)));
  const setGroup = (key: number, group: string) => onChange(value.map((s) => (s.key === key ? { ...s, group } : s)));
  const fill = () => {
    const lines = splitPrompts(list);
    onChange(value.map((s, i) => (lines[i] !== undefined ? { ...s, prompt: lines[i] } : s)));
  };
  return (
    <div className="staging">
      <div className="addrow">
        <button type="button" className="mini" onClick={() => file.current?.click()}>+ Upload stickers</button>
        <input ref={file} type="file" accept="image/*" multiple hidden aria-label="Upload stickers" onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; if (f.length) void upload(f); }} />
        <span className="muted small">{value.length ? `${value.length} sticker${value.length === 1 ? '' : 's'}` : 'Choose as many pictures as you like. Each prompt starts as its file name (France.jpg becomes France); you can change it.'}</span>
      </div>
      {error && <div className="muted" role="alert">{error}</div>}
      {value.length > 0 && (
        <>
          <ul className="stagelist">
            {value.map((s, i) => (
              <li key={s.key} className="stageitem">
                <img className="stagethumb" src={s.image.dataUrl} alt={`Sticker ${i + 1}`} />
                <input className="field small" aria-label={`Prompt for sticker ${i + 1}`} placeholder="Prompt" value={s.prompt} onChange={(e) => set(s.key, e.target.value)} />
                {groups.length > 0 && (
                  <select className="field small" aria-label={`Sub-category for sticker ${i + 1}`} value={groups.some((g) => g.value === s.group) ? s.group : ''} onChange={(e) => setGroup(s.key, e.target.value)}>
                    <option value="">Main prompts</option>
                    {groups.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                  </select>
                )}
                <button type="button" className="mini" aria-label={`Remove sticker ${i + 1}`} onClick={() => onChange(value.filter((x) => x.key !== s.key))}>Remove</button>
              </li>
            ))}
          </ul>
          <details className="stagelistbox"><summary className="small">Fill the prompts from a list</summary>
            <textarea className="field" rows={5} aria-label="Prompt list" placeholder="One prompt per line, in the order of the stickers" value={list} onChange={(e) => setList(e.target.value)} />
            <button type="button" className="mini" onClick={fill}>Fill in order</button>
          </details>
        </>
      )}
    </div>
  );
}

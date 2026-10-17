import { useEffect, useMemo, useRef, useState } from 'react';
import type { Slot } from '../../repo/challenges';
import BingoTile from './BingoTile';

export interface AvailablePrompt { id: string; text: string; image: string | null }
export interface SquareActions {
  setText(slotId: string, text: string): void;
  setImage(slotId: string, file: File | null): void;
  setColor(slotId: string, hex: string): void;
  swapForAnother(slotId: string): void;
  pickBankPrompt(slotId: string, promptId: string): void;
}

// Change one square: its words, its picture, its colour, or swap it for another prompt from the bank.
export default function SquareEditor({ slot, palette, available, act, onClose }: { slot: Slot; palette: string[]; available: AvailablePrompt[]; act: SquareActions; onClose(): void }) {
  const [text, setText] = useState(slot.label);
  const [q, setQ] = useState('');
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => setText(slot.label), [slot.label]);
  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return available.filter((p) => words.every((w) => p.text.toLowerCase().includes(w))).slice(0, 40);
  }, [available, q]);
  const color = slot.color ?? palette[0];
  const dirty = text.trim() !== slot.label;
  const canSave = dirty && (slot.is_free || text.trim() !== '');
  return (
    <div className="overlay" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="dialog pickdlg" role="dialog" aria-modal="true" aria-label="Change this square">
        <h2 className="pagetitle small2">{slot.is_free ? 'FREE SPACE' : 'CHANGE THIS SQUARE'}</h2>
        <div className="sqprev"><BingoTile label={slot.label} art={slot.art} color={color} free={slot.is_free} /></div>
        <label className="stack"><span className="lbl2">{slot.is_free ? 'Prompt (leave empty for a plain FREE space)' : 'Words'}</span>
          <span className="addrow"><input className="field" aria-label="Square text" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && canSave && act.setText(slot.id, text)} />
            <button type="button" className="mini" disabled={!canSave} onClick={() => act.setText(slot.id, text)}>Save words</button></span></label>
        <div className="stack"><span className="lbl2">Picture (cut to a square)</span>
          <span className="addrow">
            <button type="button" className="mini" onClick={() => file.current?.click()}>{slot.art ? 'Replace picture' : 'Add a picture'}</button>
            <input ref={file} type="file" accept="image/*" hidden aria-label="Square picture" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) act.setImage(slot.id, f); }} />
            {slot.art && <button type="button" className="mini" onClick={() => act.setImage(slot.id, null)}>Remove picture</button>}
          </span></div>
        <div className="stack"><span className="lbl2">Color</span>
          <span className="swatches" role="group" aria-label="Square color">
            {palette.map((c) => <button key={c} type="button" className={`swatch${c.toLowerCase() === color.toLowerCase() ? ' on' : ''}`} style={{ background: c }} aria-label={`Square color ${c}`} aria-pressed={c.toLowerCase() === color.toLowerCase()} onClick={() => act.setColor(slot.id, c)} />)}
          </span></div>
        {!slot.is_free && (
          <div className="stack">
            <span className="lbl2">From the prompt bank</span>
            <span className="addrow"><button type="button" className="mini" onClick={() => act.swapForAnother(slot.id)}>Swap for another prompt</button>
              <input className="field small" aria-label="Search the bank" placeholder="Search the bank" value={q} onChange={(e) => setQ(e.target.value)} /></span>
            <ul className="pickist" aria-label="Bank prompts not on the board">
              {shown.length === 0 && <li className="muted small">{available.length ? 'No prompt matches that.' : 'Every prompt in the bank is already on the board.'}</li>}
              {shown.map((p) => <li key={p.id}><button type="button" className="pickrow" onClick={() => act.pickBankPrompt(slot.id, p.id)}><span>{p.text}</span>{p.image && <span className="muted small">has a picture</span>}</button></li>)}
            </ul>
          </div>
        )}
        <div className="actions"><span className="grow" /><button type="button" className="btn on" onClick={onClose}>Done</button></div>
      </div>
    </div>
  );
}

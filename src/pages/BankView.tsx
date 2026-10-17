import { useRef, useState } from 'react';
import { splitPrompts } from '../domain/challenges';
import { PLAYABLE } from '../domain/bingo';
import type { Bank, BankPrompt } from '../repo/bingo';

export interface BankActions {
  rename(name: string): void;
  add(texts: string[]): void;
  renamePrompt(id: string, text: string): void;
  setImage(id: string, file: File | null): void;
  removePrompt(id: string): void;
  removeBank(): void;
}

function Row({ p, act }: { p: BankPrompt; act: BankActions }) {
  const [text, setText] = useState(p.text);
  const [confirming, setConfirming] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const commit = () => { if (text.trim() && text.trim() !== p.text) act.renamePrompt(p.id, text.trim()); else setText(p.text); };
  return (
    <li className="bankrow">
      <span className="bankthumb">{p.image ? <img src={p.image} alt={`Picture for ${p.text}`} /> : <span className="muted small">no picture</span>}</span>
      <input className="field small" aria-label={`Prompt: ${p.text}`} value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
      <span className="muted small bankused">{p.years.length ? `On the ${p.years.join(', ')} board` : 'Not used yet'}</span>
      <button type="button" className="mini" onClick={() => file.current?.click()}>{p.image ? 'Replace picture' : 'Add picture'}</button>
      <input ref={file} type="file" accept="image/*" hidden aria-label={`Picture for ${p.text}`} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) act.setImage(p.id, f); }} />
      {p.image && <button type="button" className="mini" onClick={() => act.setImage(p.id, null)}>Remove picture</button>}
      {confirming
        ? <span className="movebtns"><button type="button" className="mini danger" onClick={() => act.removePrompt(p.id)}>Delete it</button><button type="button" className="mini" onClick={() => setConfirming(false)}>Keep</button></span>
        : <button type="button" className="mini" aria-label={`Delete prompt ${p.text}`} onClick={() => setConfirming(true)}>Delete</button>}
    </li>
  );
}

export default function BankView({ bank, act }: { bank: Bank; act: BankActions }) {
  const [name, setName] = useState(bank.name);
  const [more, setMore] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [q, setQ] = useState('');
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = bank.prompts.filter((p) => words.every((w) => p.text.toLowerCase().includes(w)));
  const short = bank.prompts.length < PLAYABLE;
  return (
    <div className="chalpage">
      <div className="gtop">
        <div className="gtitle">
          <input className="field big" aria-label="Bank name" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => (name.trim() && name.trim() !== bank.name ? act.rename(name.trim()) : setName(bank.name))} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
          <span className="muted small">{bank.prompts.length} prompts{short ? ` · a board needs ${PLAYABLE}, add ${PLAYABLE - bank.prompts.length} more` : ''}</span>
        </div>
      </div>
      <div className="bcard">
        <label className="stack"><span className="lbl2">Add prompts, one per line</span>
          <textarea className="field" rows={4} value={more} onChange={(e) => setMore(e.target.value)} /></label>
        <div><button type="button" className="btn on" disabled={!splitPrompts(more).length} onClick={() => { act.add(splitPrompts(more)); setMore(''); }}>Add prompts</button></div>
      </div>
      <div className="bcard">
        <input className="field small" aria-label="Search prompts" placeholder="Search prompts" value={q} onChange={(e) => setQ(e.target.value)} />
        <ul className="banklist">{shown.map((p) => <Row key={`${p.id}:${p.text}:${p.image ? 1 : 0}`} p={p} act={act} />)}</ul>
        {shown.length === 0 && <p className="muted small">{bank.prompts.length ? 'No prompt matches that.' : 'No prompts yet.'}</p>}
      </div>
      <div className="gedit">
        {deleting
          ? <span className="movebtns"><button type="button" className="mini danger" onClick={act.removeBank}>Delete the bank</button><button type="button" className="mini" onClick={() => setDeleting(false)}>Keep</button></span>
          : <button type="button" className="mini" onClick={() => setDeleting(true)}>Delete this bank</button>}
        <span className="muted small">Boards already made from a bank keep their own copies of the prompts.</span>
      </div>
    </div>
  );
}

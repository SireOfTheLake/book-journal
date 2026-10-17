import { useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ACCENTS } from '../../domain/challenges';
import { MAX_COLS } from '../../domain/challengeLayout';
import type { Candidate, Challenge, Slot, StickerImage } from '../../repo/challenges';
import { readableOn } from '../../theme/themes';
import ReadPicker from './ReadPicker';
import StickerStaging, { type Staged } from './StickerStaging';
import Blurb from './Blurb';
import TrackerBar from './TrackerBar';

export interface GridActions {
  describe?(text: string): void;
  fill(slotId: string, readId: string): void;
  clear(slotId: string): void;
  search(query: string): Promise<Candidate[]>;
  rename(name: string): void;
  color(hex: string): void;
  remove(): void;
  addGroup(name: string): void;
  renameGroup(id: string, name: string): void;
  groupColor(id: string, hex: string): void;
  removeGroup(id: string): void;
  addPrompt(groupId: string | null, label: string): void;
  renamePrompt(slotId: string, label: string): void;
  removePrompt(slotId: string): void;
  askAll?(ask: boolean, label: string): void; // every prompt asks for a short note (a character's name...), and what that note is called
  askPrompt?(slotId: string, ask: boolean | null): void; // one prompt decides for itself (null = follow the challenge)
  note?(slotId: string, text: string): void;
  addStickers?(items: { prompt: string; image: StickerImage; groupId?: string | null }[]): Promise<void>;
  replaceSticker?(slotId: string, file: File): void;
  cardCols(key: string, cols: number): void;
  moveCard(key: string, beforeKey: string | null): void;
  shuffleCards(): void;
  movePrompt(slotId: string, groupId: string | null, beforeSlotId: string | null): void;
  shufflePrompts(groupId: string | null): void;
}

// What is being dragged while you rearrange in Edit mode.
export interface Dnd { start(e: React.DragEvent, d: { kind: 'slot' | 'card'; id: string }): void; end(): void; slotDrop(e: React.DragEvent, beforeSlotId: string): void; over(e: React.DragEvent): void }

const COVER_COLORS = ['#5a1f3a', '#2f3a5a', '#3a2f5a', '#4a2f3a', '#2d4a3a', '#5a3a1f'];
const hue = (t: string) => COVER_COLORS[[...t].reduce((n, c) => n + c.charCodeAt(0), 0) % COVER_COLORS.length];

export function Swatches({ value, label, onPick }: { value: string; label: string; onPick(hex: string): void }) {
  return (
    <span className="swatches" role="group" aria-label={label}>
      {ACCENTS.map((c) => <button key={c} type="button" className={`swatch${c.toLowerCase() === value.toLowerCase() ? ' on' : ''}`} style={{ background: c }} aria-label={`${label} ${c}`} aria-pressed={c.toLowerCase() === value.toLowerCase()} onClick={() => onPick(c)} />)}
    </span>
  );
}

// A text box that saves when you leave it or press Enter.
export function SaveText({ value, label, onSave, className = 'field small' }: { value: string; label: string; onSave(v: string): void; className?: string }) {
  const [v, setV] = useState(value);
  const commit = () => { if (v.trim() && v.trim() !== value) onSave(v.trim()); else setV(value); };
  return <input className={className} aria-label={label} value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget.blur())} />;
}

export /** Book title that shrinks to fit its row (down to a floor), then truncates with an ellipsis. */
function FitText({ to, title, className }: { to: string; title: string; className?: string }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const [size, setSize] = useState(13.5);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      let px = 13.5;
      el.style.fontSize = `${px}px`;
      while (px > 10 && el.scrollWidth > el.clientWidth + 1) { px -= 0.5; el.style.fontSize = `${px}px`; }
      setSize(px);
    };
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(fit);
    if (el.parentElement) ro.observe(el.parentElement);
    return () => ro.disconnect();
  }, [title]);
  return <Link ref={ref} className={className} to={to} title={title} style={{ fontSize: size }}>{title}</Link>;
}

// The short note a prompt asks for. It saves when you leave the box, press Enter, or press Escape.
export function NoteInput({ value, label, onSave }: { value: string; label: string; onSave(text: string): void }) {
  const [v, setV] = useState(value);
  useLayoutEffect(() => setV(value), [value]);
  const done = useRef(false);
  const commit = () => { if (done.current) return; done.current = true; if (v.trim() !== value) onSave(v.trim()); setTimeout(() => { done.current = false; }, 0); };
  return <input className="field small gnote" aria-label={label} placeholder={label} value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); commit(); e.currentTarget.blur(); } }} />;
}

function SlotCard({ slot, cover, editing, sticker, onPick, act, dnd, askAll, noteLabel }: { slot: Slot; cover: string | undefined; editing: boolean; sticker?: boolean; onPick(): void; act: GridActions; dnd?: Dnd; askAll: boolean; noteLabel: string }) {
  const [confirming, setConfirming] = useState(false);
  const f = slot.fill;
  const planned = !!f && f.status !== 'finished'; // a book is on the prompt but has not been read yet
  const asks = slot.askNote ?? askAll;
  return (
    <li className="gslot" draggable={editing && !!dnd} onDragStart={(e) => { if (editing && dnd) { e.stopPropagation(); dnd.start(e, { kind: 'slot', id: slot.id }); } }} onDragEnd={() => dnd?.end()}
      onDragOver={(e) => editing && dnd?.over(e)} onDrop={(e) => editing && dnd?.slotDrop(e, slot.id)}>
      {sticker && (
        <>
          <span className={`sticker${(f && !planned) || editing ? ' got' : ''}`} title={slot.label}>
            {((f && !planned) || editing) && slot.art ? <img src={slot.art} alt={f ? `Sticker: ${slot.label}` : `Sticker for ${slot.label}`} /> : <span className="num" aria-hidden="true">?</span>}
          </span>
          {editing && act.replaceSticker && <ReplaceSticker label={slot.label} onFile={(file) => act.replaceSticker!(slot.id, file)} />}
        </>
      )}
      <button type="button" className={`gframe${f ? ' filled' : ''}${planned ? ' planned' : ''}`} aria-label={f ? `Change the book for ${slot.label}` : `Add a book for ${slot.label}`} onClick={onPick}>
        {f ? (cover ? <img className="libimg" src={cover} alt="" /> : <div className="libgen" style={{ background: hue(f.title) }}><span className="ttl">{f.title.toUpperCase()}</span></div>) : <span className="plus" aria-hidden="true">+</span>}
      </button>
      {planned && <span className="plannedtag" title="It counts once the book is read">planned</span>}
      {editing ? <SaveText value={slot.label} label={`Prompt: ${slot.label}`} onSave={(v) => act.renamePrompt(slot.id, v)} /> : <span className="glabel" title={slot.label}>{slot.label}</span>}
      <span className="gbook">
        {f ? <><FitText className="l" to={`/book/${f.book_id}/${f.read_id}`} title={f.title} />
          <button type="button" className="xbtn" aria-label={`Take ${f.title} off ${slot.label}`} title="Take this book off" onClick={() => act.clear(slot.id)}>&times;</button></> : null}
      </span>
      {asks && f && act.note && <NoteInput value={slot.note ?? ''} label={noteLabel} onSave={(t) => act.note!(slot.id, t)} />}
      {editing && act.askPrompt && (
        <select className="gasks" aria-label={`Note for ${slot.label}`} value={slot.askNote === null ? '' : slot.askNote ? 'yes' : 'no'} onChange={(e) => act.askPrompt!(slot.id, e.target.value === '' ? null : e.target.value === 'yes')}>
          <option value="">{`${noteLabel}: as the challenge`}</option><option value="yes">{`${noteLabel}: ask`}</option><option value="no">{`${noteLabel}: don't ask`}</option>
        </select>
      )}
      {editing && (confirming
        ? <span className="movebtns"><button type="button" className="mini danger" onClick={() => act.removePrompt(slot.id)}>Delete it</button><button type="button" className="mini" onClick={() => setConfirming(false)}>Keep</button></span>
        : <button type="button" className="mini" aria-label={`Delete prompt ${slot.label}`} onClick={() => setConfirming(true)}>Delete prompt</button>)}
    </li>
  );
}

// A sticker challenge without sub-categories keeps its stickers in a card of their own, next to the card of book covers.
function StickerSheet({ slots, editing, act }: { slots: Slot[]; editing: boolean; act: GridActions }) {
  return (
    <ul className="stickersheet">
      {slots.map((s) => {
        const got = !!s.fill && s.fill.status === 'finished';
        return (
          <li key={s.id} className="stickerspot">
            <span className={`sticker${got || editing ? ' got' : ''}`} title={s.label}>
              {(got || editing) && s.art ? <img src={s.art} alt={got ? `Sticker: ${s.label}` : `Sticker for ${s.label}`} /> : <span className="num" aria-hidden="true">?</span>}
            </span>
            {editing && act.replaceSticker && <ReplaceSticker label={s.label} onFile={(file) => act.replaceSticker!(s.id, file)} />}
            <span className="glabel" title={s.label}>{s.label}</span>
          </li>
        );
      })}
    </ul>
  );
}

function ReplaceSticker({ label, onFile }: { label: string; onFile(f: File): void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className="mini" onClick={() => ref.current?.click()}>Replace</button>
      <input ref={ref} type="file" accept="image/*" hidden aria-label={`Replace sticker for ${label}`} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f); }} />
    </>
  );
}
function AddStickers({ add, groups }: { add(items: { prompt: string; image: StickerImage; groupId?: string | null }[]): Promise<void>; groups: { id: string; name: string }[] }) {
  const [staged, setStaged] = useState<Staged[]>([]);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    try { await add(staged.map((s) => ({ prompt: s.prompt, image: s.image, groupId: s.group || null }))); setStaged([]); setError(null); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  return (
    <div className="bcard">
      <span className="lbl2">Add stickers</span>
      <StickerStaging value={staged} onChange={setStaged} groups={groups.map((g) => ({ value: g.id, label: g.name }))} />
      {error && <div className="muted" role="alert">{error}</div>}
      {staged.length > 0 && <div><button type="button" className="btn on" onClick={save}>Add {staged.length} sticker{staged.length === 1 ? '' : 's'}</button></div>}
    </div>
  );
}

// "Ask for a note": a small text box under each book (a character's name, a sport...), for every prompt or only the ones you choose.
function NoteSettings({ ask, label, onSave }: { ask: boolean; label: string; onSave(ask: boolean, label: string): void }) {
  const [text, setText] = useState(label === 'Note' ? '' : label);
  return (
    <div className="notesettings">
      <label className="inline"><input type="checkbox" checked={ask} onChange={(e) => onSave(e.target.checked, text)} /><span>Ask for a note with each book</span></label>
      <input className="field small" aria-label="What the note is called" placeholder="Called (for example, Character)" value={text} onChange={(e) => setText(e.target.value)} onBlur={() => text.trim() !== (label === 'Note' ? '' : label) && onSave(ask, text)} />
      <span className="muted small">Each prompt can also decide for itself; choose that under the prompt.</span>
    </div>
  );
}

function AddPrompt({ onAdd, label }: { onAdd(text: string): void; label: string }) {
  const [t, setT] = useState('');
  const go = () => { if (t.trim()) { onAdd(t.trim()); setT(''); } };
  return <div className="addrow"><input className="field small" aria-label={label} placeholder="New prompt" value={t} onChange={(e) => setT(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} /><button type="button" className="mini" onClick={go}>Add prompt</button></div>;
}


const FULL_FROM = 6; // "narrower" from full width goes to this many books wide

// A card of the challenge. In Edit mode it can be dragged by its grip, moved earlier or later, made wider or narrower, and its prompts put in random order.
function Card({ cardKey, label, color, cols, cell, editing, groupId, onEarlier, onLater, act, dnd, className = '', noShuffle, children }: {
  cardKey: string; label: string; color: string; cols: number; cell?: 'sticker'; editing: boolean; groupId: string | null; onEarlier?: () => void; onLater?: () => void; act: GridActions; dnd: Dnd & { cardDrop(e: React.DragEvent, key: string, groupId: string | null): void }; className?: string; noShuffle?: boolean; children: React.ReactNode;
}) {
  const wider = () => act.cardCols(cardKey, cols === 0 ? 0 : cols >= MAX_COLS ? 0 : cols + 1);
  const narrower = () => act.cardCols(cardKey, cols === 0 ? FULL_FROM : Math.max(1, cols - 1));
  return (
    <section className={`bcard gcard ${cell === 'sticker' ? 'stickercard' : ''} ${cols === 0 ? 'full' : ''} ${className}`} style={{ ['--gc' as string]: color, ['--cols' as string]: cols || undefined }} aria-label={label}
      onDragOver={(e) => editing && dnd.over(e)} onDrop={(e) => editing && dnd.cardDrop(e, cardKey, groupId)}>
      {editing && (
        <div className="cardtools" role="group" aria-label={`Arrange ${label}`}>
          <span className="grip" draggable onDragStart={(e) => dnd.start(e, { kind: 'card', id: cardKey })} onDragEnd={() => dnd.end()} title="Drag to move this card" aria-hidden="true">&#8942;&#8942; Drag</span>
          <button type="button" className="mini" aria-label={`Move ${label} earlier`} disabled={!onEarlier} onClick={onEarlier}>&#9664;</button>
          <button type="button" className="mini" aria-label={`Move ${label} later`} disabled={!onLater} onClick={onLater}>&#9654;</button>
          <span className="widthctl">
            <button type="button" className="mini" aria-label={`Make ${label} narrower`} disabled={cols === 1} onClick={narrower}>&minus;</button>
            <span className="small" aria-live="polite">{cols === 0 ? 'Full width' : `${cols} ${cols === 1 ? 'book' : 'books'} wide`}</span>
            <button type="button" className="mini" aria-label={`Make ${label} wider`} disabled={cols === 0} onClick={wider}>+</button>
            <button type="button" className={`mini${cols === 0 ? ' on' : ''}`} aria-pressed={cols === 0} aria-label={`Full width for ${label}`} onClick={() => act.cardCols(cardKey, cols === 0 ? FULL_FROM : 0)}>Full</button>
          </span>
          {!noShuffle && <button type="button" className="mini" aria-label={`Random order for ${label}`} onClick={() => act.shufflePrompts(groupId)}>Random order</button>}
        </div>
      )}
      {children}
    </section>
  );
}

export default function GridView({ challenge: c, covers, act }: { challenge: Challenge; covers: Record<string, string>; act: GridActions }) {
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState<Slot | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [newGroup, setNewGroup] = useState('');
  const [groupGone, setGroupGone] = useState<string | null>(null);
  const drag = useRef<{ kind: 'slot' | 'card'; id: string } | null>(null);
  const sticker = c.kind === 'sticker';
  const stacked = sticker && c.groups.length > 0; // the sticker sits above the cover only when there are sub-categories
  const split = sticker && c.groups.length === 0; // otherwise the stickers have a card of their own

  const dnd: Dnd & { cardDrop(e: React.DragEvent, key: string, groupId: string | null): void } = {
    start: (e, d) => { drag.current = d; try { e.dataTransfer?.setData('text/plain', d.id); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'; } catch { /* some browsers refuse */ } },
    end: () => { drag.current = null; },
    over: (e) => { if (drag.current) e.preventDefault(); },
    slotDrop: (e, before) => {
      const d = drag.current; if (!d || d.kind !== 'slot') return;
      e.preventDefault(); e.stopPropagation(); drag.current = null;
      if (d.id !== before) act.movePrompt(d.id, null, before);
    },
    cardDrop: (e, key, groupId) => {
      const d = drag.current; if (!d) return;
      e.preventDefault(); drag.current = null;
      if (d.kind === 'card') { if (d.id !== key) act.moveCard(d.id, key); } else act.movePrompt(d.id, groupId, null);
    },
  };

  const slotList = (slots: Slot[], groupId: string | null) => (
    <>
      <ul className="gslots">{slots.map((s) => <SlotCard key={s.id} slot={s} sticker={stacked} cover={s.fill ? covers[s.fill.book_id] : undefined} editing={editing} onPick={() => setPicking(s)} act={act} dnd={dnd} askAll={c.askNote} noteLabel={c.noteLabel} />)}</ul>
      {editing && !sticker && <AddPrompt label={groupId ? 'New prompt for this sub-category' : 'New main prompt'} onAdd={(t) => act.addPrompt(groupId, t)} />}
    </>
  );

  // Which cards are on screen, in the saved order.
  const showMain = (c.loose.length > 0 || editing) && (c.groups.length === 0 || c.loose.length > 0);
  const present = new Set<string>([...(split ? ['stickers'] : []), ...(showMain ? ['main'] : []), ...c.groups.map((g) => g.id)]);
  const keys = c.layout.order.filter((k) => present.has(k));
  const at = (k: string) => keys.indexOf(k);
  const nav = (k: string) => ({
    onEarlier: at(k) > 0 ? () => act.moveCard(k, keys[at(k) - 1]) : undefined,
    onLater: at(k) < keys.length - 1 ? () => act.moveCard(k, keys[at(k) + 2] ?? null) : undefined,
  });
  const cols = (k: string) => c.layout.cols[k] ?? 0;

  const renderCard = (k: string) => {
    if (k === 'stickers') return (
      <Card key={k} cardKey={k} label="Stickers" color={c.color} cols={cols(k)} cell="sticker" editing={editing} groupId={null} {...nav(k)} act={act} dnd={dnd} noShuffle>
        <StickerSheet slots={c.loose} editing={editing} act={act} />
      </Card>);
    if (k === 'main') return (
      <Card cardKey={k} label={c.groups.length ? 'Main prompts' : c.name} color={c.color} cols={cols(k)} editing={editing} groupId={null} {...nav(k)} act={act} dnd={dnd} className="main">
        {c.groups.length > 0 && <header className="ghead"><h2 className="gname" style={{ background: c.color, color: readableOn(c.color) }}>Main prompts</h2></header>}
        {slotList(c.loose, null)}
      </Card>);
    const g = c.groups.find((x) => x.id === k);
    if (!g) return null;
    return (
      <Card key={k} cardKey={k} label={g.name} color={g.color} cols={cols(k)} editing={editing} groupId={g.id} {...nav(k)} act={act} dnd={dnd}>
        <header className="ghead">
          {editing ? <SaveText value={g.name} label={`Sub-category name: ${g.name}`} onSave={(v) => act.renameGroup(g.id, v)} className="field" /> : <h2 className="gname" style={{ background: g.color, color: readableOn(g.color) }}>{g.name}</h2>}
          <span className="muted small">{g.slots.filter((s) => s.fill).length}/{g.slots.length}</span>
        </header>
        {editing && <div className="gedit"><Swatches value={g.color} label={`Color for ${g.name}`} onPick={(h) => act.groupColor(g.id, h)} />
          {groupGone === g.id
            ? <span className="movebtns"><button type="button" className="mini danger" onClick={() => { setGroupGone(null); act.removeGroup(g.id); }}>Delete it and its prompts</button><button type="button" className="mini" onClick={() => setGroupGone(null)}>Keep</button></span>
            : <button type="button" className="mini" aria-label={`Delete sub-category ${g.name}`} onClick={() => setGroupGone(g.id)}>Delete sub-category</button>}</div>}
        {slotList(g.slots, g.id)}
      </Card>);
  };

  return (
    <div className="gridpage" style={{ ['--cc' as string]: c.color }}>
      <div className="gtop">
        <div className="gtitle">
          {editing ? <SaveText value={c.name} label="Challenge name" onSave={act.rename} className="field big" /> : <h2 className="pagetitle small2">{c.name}</h2>}
          <span className="muted small">{sticker ? 'Sticker' : 'Grid'} · Journal {c.year}</span>
        </div>
        <TrackerBar t={c} color={c.color} />
        <button type="button" className={`btn${editing ? ' on' : ''}`} aria-pressed={editing} onClick={() => setEditing((e) => !e)}>{editing ? 'Done editing' : 'Edit'}</button>
      </div>
      <Blurb text={c.description} editing={editing} onSave={act.describe} />
      {editing && (
        <div className="bcard gedit">
          <span className="lbl2">Challenge color</span><Swatches value={c.color} label="Challenge color" onPick={act.color} />
          {<div className="addrow"><input className="field small" aria-label="New sub-category" placeholder="New sub-category" value={newGroup} onChange={(e) => setNewGroup(e.target.value)} />
            <button type="button" className="mini" onClick={() => { if (newGroup.trim()) { act.addGroup(newGroup.trim()); setNewGroup(''); } }}>Add sub-category</button></div>}
          {act.askAll && <NoteSettings ask={c.askNote} label={c.noteLabel} onSave={act.askAll} />}
          {keys.length > 1 && <button type="button" className="mini" onClick={act.shuffleCards}>Shuffle the cards</button>}
          {deleting
            ? <span className="movebtns"><button type="button" className="mini danger" onClick={act.remove}>Delete the whole challenge</button><button type="button" className="mini" onClick={() => setDeleting(false)}>Keep</button></span>
            : <button type="button" className="mini" onClick={() => setDeleting(true)}>Delete challenge</button>}
          <span className="muted small">Drag a card by its grip, or a cover (or sticker) to put it in another place or card. Deleting a challenge or a prompt never deletes your books or reads.</span>
        </div>
      )}
      {sticker && editing && act.addStickers && <AddStickers add={act.addStickers} groups={c.groups.map((g) => ({ id: g.id, name: g.name }))} />}
      <div className="gcards">{keys.map(renderCard)}</div>
      {c.total === 0 && !editing && <p className="muted">This challenge has no prompts yet. Choose Edit to add some.</p>}
      {picking && <ReadPicker prompt={picking.label} search={act.search} onClose={() => setPicking(null)} onPick={(readId) => { act.fill(picking.id, readId); setPicking(null); }} />}
    </div>
  );
}

import { useRef, useState } from 'react';
import { BINGO_COLOR_CHOICES, MAX_BINGO_GOAL, MAX_PALETTE, squarePx, tint } from '../../domain/bingo';
import { countsTowardTracker, type Challenge, type Candidate, type Slot } from '../../repo/challenges';
import BingoTile from './BingoTile';
import ReadPicker from './ReadPicker';
import SquareEditor, { type AvailablePrompt, type SquareActions } from './SquareEditor';
import Blurb from './Blurb';
import TrackerBar from './TrackerBar';

export interface BingoActions extends SquareActions {
  describe?(text: string): void;
  fill(slotId: string, readId: string): void;
  clear(slotId: string): void;
  search(query: string): Promise<Candidate[]>;
  rename(name: string): void;
  remove(): void;
  publish(): void;
  regenerate(): void;
  setPalette(colors: string[]): void;
  replaceColor(from: string, to: string): void;
  setGoal(goal: number | null): void;
  rerollColors(): void;
  swapSquares(a: string, b: string): void;
  shuffleBoard(): void;
  size(step: number): void;
}

export default function BingoView({ challenge: c, covers, available, act }: { challenge: Challenge; covers: Record<string, string>; available: AvailablePrompt[]; act: BingoActions }) {
  const info = c.bingo!;
  const draft = !info.published;
  const [toggled, setToggled] = useState(false);
  const editing = draft || toggled;
  const [picking, setPicking] = useState<Slot | null>(null);
  const [changing, setChanging] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [name, setName] = useState(c.name);
  const dragId = useRef<string | null>(null);
  const step = c.layout.cols.board || 3;
  const px = squarePx(step);
  const [pickColor, setPickColor] = useState<string | 'new' | null>(null); // which palette color is being changed
  // BINGO over the five columns: each letter gets a colour from the palette, chosen the same way every time for this board.
  const letterColors = (() => {
    let h = [...c.id].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7);
    const pal = info.palette.length ? info.palette : ['#c4683d'];
    return [0, 1, 2, 3, 4].map(() => { h = (h * 1664525 + 1013904223) >>> 0; return pal[h % pal.length]; });
  })();
  const changingSlot = changing ? c.loose.find((s) => s.id === changing) ?? null : null;

  const click = (s: Slot) => {
    if (editing) { setChanging(s.id); return; }
    if (countsTowardTracker(s)) setPicking(s);
  };
  // A color picked from the set or the color wheel replaces the one that was clicked, or is added to the set.
  const choose = (hex: string, keepOpen = false) => {
    if (info.palette.includes(hex)) return;
    if (pickColor === 'new') { if (info.palette.length < MAX_PALETTE) act.setPalette([...info.palette, hex]); } else if (pickColor) act.replaceColor(pickColor, hex);
    if (!keepOpen) setPickColor(null); else setPickColor(hex);
  };

  return (
    <div className="gridpage" style={{ ['--cc' as string]: c.color }}>
      <div className="gtop">
        <div className="gtitle">
          {editing ? (
            <input className="field big" aria-label="Challenge name" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => (name.trim() && name.trim() !== c.name ? act.rename(name.trim()) : setName(c.name))} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
          ) : <h2 className="pagetitle small2">{c.name}</h2>}
          <span className="muted small">Bingo · Journal {c.year}{info.bankName ? ` · ${info.bankName}` : ''}{draft ? ' · Draft' : ''}</span>
        </div>
        <TrackerBar t={c} color={c.color} unit={c.trackerUnit} />
        {c.bingoGoal !== null && <span className="chip" aria-label="Squares">Squares: {c.squares}/25</span>}
        {draft
          ? <button type="button" className="btn on" onClick={act.publish}>Publish board</button>
          : <button type="button" className={`btn${toggled ? ' on' : ''}`} aria-pressed={toggled} onClick={() => setToggled((e) => !e)}>{toggled ? 'Done editing' : 'Edit'}</button>}
      </div>
      <Blurb text={c.description} editing={editing} onSave={act.describe} />
      {draft && <div className="bcard"><span>This board is a draft. Click any square to change its words, picture or color, swap it for another prompt, or draw a fresh board. Publish it when you are happy, then click squares to add books.</span></div>}
      {editing && (
        <div className="bcard gedit">
          {draft && <button type="button" className="mini" onClick={act.regenerate}>Draw a whole new board</button>}
          <button type="button" className="mini" onClick={act.shuffleBoard}>Shuffle the squares</button>
          <button type="button" className="mini" onClick={act.rerollColors}>Re-roll the colors</button>
          <span className="widthctl"><span className="lbl2">Square size</span>
            <button type="button" className="mini" aria-label="Make the squares smaller" disabled={step <= 1} onClick={() => act.size(step - 1)}>&minus;</button>
            <button type="button" className="mini" aria-label="Make the squares bigger" disabled={step >= 6} onClick={() => act.size(step + 1)}>+</button></span>
          <label className="stack"><span className="lbl2">Goal</span>
            <select className="field" aria-label="Bingo goal" value={c.bingoGoal === null ? 'blackout' : String(c.bingoGoal)} onChange={(e) => act.setGoal(e.target.value === 'blackout' ? null : Number(e.target.value))}>
              <option value="blackout">Full blackout (all 25 squares)</option>
              {Array.from({ length: MAX_BINGO_GOAL }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n} bingo{n === 1 ? '' : 's'}</option>)}
            </select></label>
          <div className="palette" role="group" aria-label="Palette">
            <span className="lbl2">Colors</span>
            {info.palette.map((col) => (
              <span key={col} className="palitem">
                <button type="button" className={`palswatch${pickColor === col ? ' on' : ''}`} style={{ background: col }} aria-label={`Change color ${col}`} aria-expanded={pickColor === col} onClick={() => setPickColor(pickColor === col ? null : col)} />
                <span className="palhex">{col}</span>
                {info.palette.length > 1 && <button type="button" className="xbtn" aria-label={`Remove color ${col}`} onClick={() => { setPickColor(null); act.setPalette(info.palette.filter((x) => x !== col)); }}>&times;</button>}
              </span>
            ))}
            {info.palette.length < MAX_PALETTE && <button type="button" className="mini" aria-label="Add a color" aria-expanded={pickColor === 'new'} onClick={() => setPickColor(pickColor === 'new' ? null : 'new')}>+ Add a color</button>}
            {pickColor && (
              <div className="palpop" role="group" aria-label={pickColor === 'new' ? 'Choose a color to add' : `Choose a new color for ${pickColor}`}>
                <span className="swatches">{BINGO_COLOR_CHOICES.filter((a) => !info.palette.includes(a)).map((a) => <button key={a} type="button" className="swatch" style={{ background: a }} aria-label={`Use color ${a}`} onClick={() => choose(a)} />)}</span>
                <label className="inline"><span className="muted small">Custom</span> <input type="color" className="bingocolor" aria-label="Pick a custom color" defaultValue={pickColor === 'new' ? '#888888' : pickColor} onChange={(e) => choose(e.target.value.toLowerCase(), true)} /></label>
              </div>
            )}
          </div>
          <span className="muted small">{draft ? 'Drag one square onto another to trade places.' : 'Click a square to change it, or drag one onto another to trade places.'} Everything here can be changed again later.</span>
          {deleting
            ? <span className="movebtns"><button type="button" className="mini danger" onClick={act.remove}>Delete the whole challenge</button><button type="button" className="mini" onClick={() => setDeleting(false)}>Keep</button></span>
            : <button type="button" className="mini" onClick={() => setDeleting(true)}>Delete challenge</button>}
        </div>
      )}
      <div className="bingostage">
      <div className="bingoletters" aria-hidden="true" style={{ ['--sq' as string]: `${px}px` }}>
        {[...'BINGO'].map((l, i) => <span key={i} className="bingoletter" style={{ ['--lc' as string]: letterColors[i], ['--lt' as string]: tint(letterColors[i]) }}>{l}</span>)}
      </div>
      <div className="bingoboard" role="grid" aria-label={`${c.name} board`} style={{ ['--sq' as string]: `${px}px` }}>
        {c.loose.map((s, i) => {
          const f = s.fill;
          const counts = countsTowardTracker(s);
          const label = s.label || (s.is_free ? 'Free space' : `Square ${i + 1}`);
          return (
            <div key={s.id} className="bcell" role="gridcell" draggable={editing && !s.is_free}
              onDragStart={(e) => { if (editing && !s.is_free) { dragId.current = s.id; try { e.dataTransfer?.setData('text/plain', s.id); } catch { /* ignore */ } } }} onDragEnd={() => { dragId.current = null; }}
              onDragOver={(e) => { if (editing && dragId.current && !s.is_free) e.preventDefault(); }}
              onDrop={(e) => { const d = dragId.current; dragId.current = null; if (editing && d && d !== s.id && !s.is_free) { e.preventDefault(); act.swapSquares(d, s.id); } }}>
              <button type="button" className={`bbtn${f && f.status !== 'finished' ? ' planned' : ''}`} title={f && f.status !== 'finished' ? `${label} (planned: counts once read)` : label} disabled={!editing && !counts}
                aria-label={editing ? `Edit square: ${label}` : f ? `Change the book for ${label}` : `Add a book for ${label}`} onClick={() => click(s)}>
                <BingoTile label={s.label} art={s.art} color={s.color ?? info.palette[0]} free={s.is_free} cover={f ? covers[f.book_id] : null} bookTitle={f ? f.title : undefined} />
              </button>
              {f && !editing && <button type="button" className="xbtn over" aria-label={`Take ${f.title} off ${label}`} title="Take this book off" onClick={() => act.clear(s.id)}>&times;</button>}
            </div>
          );
        })}
      </div>
      </div>
      {picking && <ReadPicker prompt={picking.label || 'Free space'} search={act.search} onClose={() => setPicking(null)} onPick={(readId) => { act.fill(picking.id, readId); setPicking(null); }} />}
      {changingSlot && <SquareEditor slot={changingSlot} palette={info.palette} available={available} act={act} onClose={() => setChanging(null)} />}
    </div>
  );
}

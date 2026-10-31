import { useContext, useEffect, useRef, useState } from 'react';
import { DbContext } from '../../db/DbContext';
import { useFeatures } from '../../features/FeaturesContext';
import { addCard, DEF, layoutKeyFor, missingCards, moveCard, removeCard, resizeCard, GRID_COLS, type BookLayout, type CardId, type LayoutCard } from '../../domain/bookLayout';
import { getLayout, resetLayout, saveLayout } from '../../repo/bookLayout';
import { normalizeLayout } from '../../domain/bookLayout';

const UNIT = 44, GAP = 12; // a half-square is 44px tall in the editor
type Drag = { kind: 'move'; id: CardId; dc: number; dr: number } | { kind: 'size'; id: CardId; col: number; row: number; sw: boolean; sh: boolean };

// Where the Book Log's cards sit, shown with placeholder content: drag a card to move it, drag its right or bottom edge to resize it.
export default function LayoutCard() {
  const db = useContext(DbContext);
  const { flags, set } = useFeatures();
  const key = layoutKeyFor();
  const [layout, setLayout] = useState<BookLayout | null>(null);
  const [menu, setMenu] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const drag = useRef<Drag | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const cover = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loaded = useRef(false);

  useEffect(() => { if (db) void getLayout(db, key, flags).then((l) => { setLayout(l); loaded.current = true; }); }, [db, key]); // eslint-disable-line react-hooks/exhaustive-deps
  const change = (next: BookLayout) => {
    setLayout(next);
    if (!db) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void saveLayout(db, key, next); }, 300);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  if (!layout) return <div className="bcard"><span className="muted">Loading the layout…</span></div>;
  const coverCards = layout.cards.filter((x) => x.col === 0).sort((a, b) => a.row - b.row);
  const gridCards = layout.cards.filter((x) => x.col > 0);
  const rows = gridCards.reduce((m, x) => Math.max(m, x.row + x.h), 0);

  // The grid cell under the pointer
  const cellAt = (e: React.PointerEvent) => {
    const r = grid.current!.getBoundingClientRect();
    const colPitch = (r.width + GAP) / GRID_COLS;
    return { col: Math.floor((e.clientX - r.left) / colPitch) + 1, row: Math.floor((e.clientY - r.top) / (UNIT + GAP)), inCover: e.clientX < r.left - 4 };
  };
  const startMove = (e: React.PointerEvent, x: LayoutCard) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const cell = cellAt(e);
    drag.current = { kind: 'move', id: x.id, dc: x.col > 0 ? cell.col - x.col : 0, dr: x.col > 0 ? cell.row - x.row : 0 };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !layout) return;
    const cell = cellAt(e);
    if (d.kind === 'move') {
      if (cell.inCover) {
        // In the cover column only the order matters: it goes above the first card whose middle is below the pointer
        const kids = [...(cover.current?.querySelectorAll<HTMLElement>('[data-lcard]') ?? [])].filter((k) => k.dataset.lcard !== d.id);
        let at = kids.findIndex((k) => { const r = k.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
        if (at === -1) at = kids.length;
        const cur = layout.cards.find((x) => x.id === d.id)!;
        if (cur.col !== 0 || coverCards.findIndex((x) => x.id === d.id) !== at) change(moveCard(layout, d.id, 0, at - 0.5));
      } else {
        const col = Math.min(GRID_COLS, Math.max(1, cell.col - d.dc)), row = Math.max(0, cell.row - d.dr);
        const cur = layout.cards.find((x) => x.id === d.id)!;
        if (cur.col !== col || cur.row !== row) change(moveCard(layout, d.id, col, row));
      }
    } else {
      const w = d.sw ? cell.col - d.col + 1 : layout.cards.find((x) => x.id === d.id)!.w;
      const h = d.sh ? cell.row - d.row + 1 : layout.cards.find((x) => x.id === d.id)!.h;
      const cur = layout.cards.find((x) => x.id === d.id)!;
      const next = resizeCard(layout, d.id, Math.max(1, w), Math.max(1, h));
      const n = next.cards.find((x) => x.id === d.id)!;
      if (n.w !== cur.w || n.h !== cur.h) change(next);
    }
  };
  const end = () => { drag.current = null; };
  const startSize = (e: React.PointerEvent, x: LayoutCard, sw: boolean, sh: boolean) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { kind: 'size', id: x.id, col: x.col, row: x.row, sw, sh };
  };

  const remove = (id: CardId) => { const f = DEF.get(id)!.feature; change(removeCard(layout, id)); if (f) void set(f, false); };
  const add = (id: CardId) => { const f = DEF.get(id)!.feature; change(addCard(layout, id)); if (f) void set(f, true); setMenu(false); };
  const reset = async () => {
    if (db) await resetLayout(db, key);
    setLayout(normalizeLayout(null, flags)); setConfirmReset(false);
  };

  const tile = (x: LayoutCard, inGrid: boolean) => {
    const d = DEF.get(x.id)!;
    return (
      <div key={x.id} data-lcard={x.id} className={`le-card${inGrid ? '' : ' le-cov'}`} role="group" aria-label={`${d.label} card`}
        style={inGrid ? { gridColumn: `${x.col} / span ${x.w}`, gridRow: `${x.row + 1} / span ${x.h}` } : undefined}
        onPointerDown={(e) => startMove(e, x)} onPointerMove={onMove} onPointerUp={end} onPointerCancel={end}>
        <div className="le-head"><span className="le-grip" aria-hidden="true">⠿</span><b>{d.label}</b>
          <button type="button" className="x" aria-label={`Remove the ${d.label} card`} onClick={() => remove(x.id)}>&times;</button></div>
        <div className="le-sample">{d.sample.map((s) => <span key={s}>{s}</span>)}</div>
        {inGrid && (
          <>
            <span className="le-rh" aria-hidden="true" onPointerDown={(e) => startSize(e, x, true, false)} onPointerMove={onMove} onPointerUp={end} onPointerCancel={end} />
            <span className="le-bh" aria-hidden="true" onPointerDown={(e) => startSize(e, x, false, true)} onPointerMove={onMove} onPointerUp={end} onPointerCancel={end} />
            <span className="le-ch" aria-hidden="true" onPointerDown={(e) => startSize(e, x, true, true)} onPointerMove={onMove} onPointerUp={end} onPointerCancel={end} />
          </>
        )}
      </div>
    );
  };
  const left = missingCards(layout);
  return (
    <div className="bcard layoutcard">
      <span className="lbl2">Book Log layout</span>
      <p className="muted">This is how every Book Log is arranged, shown with sample content. Drag a card to move it. Drag its right edge, bottom edge or corner to resize it: a card can be 1 to 4 columns wide, and half a square or more tall. Drag a card into the left column to put it under the cover.
        Rows are only as tall as their tallest card, and if a card needs more room than you gave it, the card at the bottom of its rows grows.</p>
      <div className="le-wrap">
        <div className="le-left" ref={cover}>
          <div className="le-fixed">Cover<span className="muted small">with Find cover, Synopsis and Start reading. Always here.</span></div>
          {coverCards.map((x) => tile(x, false))}
        </div>
        <div>
          <div className="le-grid" ref={grid} style={{ gridTemplateRows: `repeat(${Math.max(rows, 1)}, ${UNIT}px)` }}>
            {gridCards.map((x) => tile(x, true))}
          </div>
          <div className="le-ghost">
            <button type="button" className="le-add" aria-expanded={menu} onClick={() => setMenu(!menu)}>+ Add card</button>
            {menu && (
              <div className="le-menu" role="menu" aria-label="Cards you can add">
                {left.length === 0 && <span className="muted small">Every card is already in the layout.</span>}
                {left.map((d) => (
                  <button key={d.id} type="button" role="menuitem" className="le-item" onClick={() => add(d.id)}>
                    <b>{d.label}</b>{d.feature && !flags[d.feature] && <span className="chip small">feature off · turns on</span>}
                    <span className="muted small">{d.about}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="pictools">
        {confirmReset
          ? <><button type="button" className="btn" onClick={() => void reset()}>Yes, reset the layout</button><button type="button" className="btn" onClick={() => setConfirmReset(false)}>Keep it</button></>
          : <button type="button" className="btn" onClick={() => setConfirmReset(true)}>Reset to the default layout</button>}
      </div>
    </div>
  );
}

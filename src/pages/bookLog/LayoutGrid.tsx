import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { solveRows, type CardId, type LayoutCard } from '../../domain/bookLayout';

const GAP = 12;

/** The Book Log cards: the cover column (cards as tall as their content) beside the four-column grid (each row as tall as its tallest card). */
export default function LayoutGrid({ cards, render, cover }: { cards: LayoutCard[]; render(id: CardId): ReactNode; cover: ReactNode }) {
  const cells = useRef(new Map<string, HTMLDivElement>());
  const [tracks, setTracks] = useState<number[] | null>(null);
  const coverCards = cards.filter((x) => x.col === 0).sort((a, b) => a.row - b.row);
  const grid = cards.filter((x) => x.col > 0);

  const measure = () => {
    const natural: Record<string, number> = {};
    let any = false;
    for (const x of grid) {
      const el = cells.current.get(x.id);
      if (!el) continue;
      const keep = el.style.flex;
      el.style.flex = 'none'; // its own height, not the height of the rows
      natural[x.id] = el.offsetHeight;
      el.style.flex = keep;
      if (natural[x.id] > 0) any = true;
    }
    if (!any) { setTracks(null); return; }
    const next = solveRows(cards, natural, GAP);
    setTracks((cur) => (cur && cur.length === next.length && cur.every((v, i) => Math.abs(v - next[i]) < 0.5) ? cur : next));
  };
  useLayoutEffect(() => {
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measure());
    cells.current.forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  });

  const hold = (id: string) => (el: HTMLDivElement | null) => { if (el) cells.current.set(id, el); else cells.current.delete(id); };
  return (
    <div className="bl-cols">
      <div className="bl-left">
        {cover}
        {coverCards.map((x) => <div key={x.id} className="lcell lcover" data-card={x.id}>{render(x.id)}</div>)}
      </div>
      <div className="bl-layout" style={{ gridTemplateRows: tracks ? tracks.map((t) => `${t}px`).join(' ') : undefined }}>
        {grid.map((x) => (
          <div key={x.id} className="lcell" data-card={x.id} style={{ gridColumn: `${x.col} / span ${x.w}`, gridRow: `${x.row + 1} / span ${x.h}` }}>
            <div className="lcell-in" ref={hold(x.id)}>{render(x.id)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

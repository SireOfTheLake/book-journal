import { useLayoutEffect, type RefObject } from 'react';

// In a sticker challenge without sub-categories the stickers and the books are two cards side by side. This gives row N of the stickers the same height as row N of the books, so each sticker sits level with the top of its book. It assumes both cards have the same number of columns; if they do not, the rows simply will not match.
const rowHeights = (list: HTMLElement): number[] => {
  const rows = new Map<number, number>();
  for (const child of Array.from(list.children) as HTMLElement[]) {
    const top = Math.round(child.offsetTop);
    rows.set(top, Math.max(rows.get(top) ?? 0, child.offsetHeight));
  }
  return [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, h]) => h);
};

export function alignRows(a: HTMLElement | null, b: HTMLElement | null): void {
  if (!a || !b) return;
  a.style.gridTemplateRows = ''; b.style.gridTemplateRows = ''; // measure how tall each row wants to be
  const ra = rowHeights(a); const rb = rowHeights(b);
  if (ra.length === 0 || rb.length === 0) return;
  const heights = Array.from({ length: Math.max(ra.length, rb.length) }, (_, i) => Math.max(ra[i] ?? 0, rb[i] ?? 0));
  if (heights.some((h) => h === 0)) return; // no layout to go by (hidden, or not drawn yet)
  a.style.gridTemplateRows = heights.slice(0, ra.length).map((h) => `${h}px`).join(' ');
  b.style.gridTemplateRows = heights.slice(0, rb.length).map((h) => `${h}px`).join(' ');
}

/** Keeps the sticker rows and the book rows level. `box` holds both cards; it runs after every render, when the window is resized, and when a cover or sticker finishes loading. */
export function useAlignedRows(box: RefObject<HTMLElement | null>, enabled: boolean): void {
  useLayoutEffect(() => {
    const el = box.current;
    if (!enabled || !el) return;
    const run = () => alignRows(el.querySelector<HTMLElement>('.stickersheet'), el.querySelector<HTMLElement>('.gcard.main .gslots'));
    run();
    el.addEventListener('load', run, true); // images do not bubble, so listen on the way down
    let width = el.clientWidth;
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (el.clientWidth !== width) { width = el.clientWidth; run(); } }) : null; // only a change of width matters; our own row heights change the height
    ro?.observe(el);
    return () => { el.removeEventListener('load', run, true); ro?.disconnect(); };
  });
}

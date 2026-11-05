import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { periodLabel, startPages, tocSections, type Period, type SheetSpec } from '../../domain/printPlan';
import SheetContent from './SheetContent';

// Letter paper with 0.4 inch margins, in CSS pixels (96 to the inch), a hair smaller so rounding never spills a blank page.
export const PAGE = { portrait: { w: 737, h: 975 }, landscape: { w: 975, h: 737 } };
const FOOT = 24;
const CHUNK = 6; // pages are drawn a few at a time, so a year of books does not ask the database for everything at once

/** One sheet of paper. Its content is laid out at a comfortable width, then shrunk (never stretched) so it fits; very long pages carry on to extra sheets. */
function Sheet({ id, landscape, width, number, left, onPages, children }: { id: string; landscape: boolean; width: number; number: number; left: string; onPages(n: number): void; children: ReactNode }) {
  const body = useRef<HTMLDivElement>(null);
  const size = landscape ? PAGE.landscape : PAGE.portrait;
  const pagesCb = useRef(onPages);
  pagesCb.current = onPages;
  const fit = useCallback(() => {
    const el = body.current; if (!el) return;
    const room = size.h - FOOT - 30;
    el.style.zoom = '1';
    // A page that is too tall for the paper is laid out wider, which can make it shorter (a bracket's four quarters sit side by side), when that lets the text be larger.
    let best = { w: width, z: -1 };
    for (let w = width; w <= width * 2 + 1; w += width * 0.15) {
      el.style.width = `${w}px`;
      const h = el.scrollHeight;
      const z = Math.min(size.w / w, h > 0 ? room / h : size.w / w);
      if (z > best.z + 0.004) best = { w, z };
      if (size.w / w <= z + 0.001) break; // already as large as the width allows
    }
    el.style.width = `${best.w}px`;
    const natural = el.scrollHeight;
    const across = size.w / best.w;
    const z = Math.max(Math.min(across, natural > 0 ? room / natural : across), Math.min(across, 0.42)); // past this floor the page carries on to another sheet
    el.style.zoom = String(z);
    pagesCb.current(Math.max(1, Math.ceil((natural * z + FOOT) / size.h)));
  }, [size.w, size.h, width]);
  useLayoutEffect(() => { fit(); }, [fit]);
  useEffect(() => {
    const el = body.current; if (!el) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const later = () => { if (t) clearTimeout(t); t = setTimeout(fit, 80); };
    const mo = new MutationObserver(later);
    mo.observe(el, { childList: true, subtree: true, characterData: true });
    el.addEventListener('load', later, true);
    void document.fonts?.ready.then(later);
    return () => { mo.disconnect(); el.removeEventListener('load', later, true); if (t) clearTimeout(t); };
  }, [fit]);
  return (
    <div className={`ppaper${landscape ? ' land' : ''}`}>
      <section className="psheet" data-sheet={id} style={{ width: size.w, minHeight: size.h }}>
        <div className="pbody" ref={body} style={{ width }}>{children}</div>
        <footer className="pfoot" style={{ top: size.h - FOOT, width: size.w }}><span>{left}</span><span className="pno">{number}</span></footer>
      </section>
    </div>
  );
}

function Toc({ period, sheets, starts, counts, total }: { period: Period; sheets: SheetSpec[]; starts: number[]; counts: number[]; total: number }) {
  const sections = tocSections(sheets, starts, counts);
  const MAX = 60; // a very long list of books is cut, the page ranges still show
  let budget = MAX;
  const cut = sections.map((sec) => { const keep = sec.entries.slice(0, Math.max(0, budget)); budget -= keep.length; return { keep, more: sec.entries.length - keep.length }; });
  return (
    <div className="toc">
      <div className="toc-head">
        <span className="toc-kicker">BOOK JOURNAL</span>
        <h1 className="toc-title">{periodLabel(period)}</h1>
        <span className="toc-sub">{sheets.length === 0 ? 'Nothing chosen to print' : `${total} page${total === 1 ? '' : 's'} · printed ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`}</span>
      </div>
      <h2 className="toc-h">Contents</h2>
      <ol className="toc-list">
        {sections.map((s, i) => (
          <li key={i} className="toc-sec">
            <div className="toc-row"><span className="toc-name">{s.title}</span><span className="toc-dots" aria-hidden="true" /><span className="toc-pg">{s.from === s.to ? s.from : `${s.from}–${s.to}`}</span></div>
            {s.entries.length > 0 && (
              <ul className={`toc-sub-list${s.entries.length > 8 ? ' cols' : ''}`}>
                {cut[i].keep.map((e, j) => <li key={j}><span className="toc-ent">{e.label}</span><span className="toc-dots" aria-hidden="true" /><span className="toc-pg">{e.page}</span></li>)}
                {cut[i].more > 0 && <li className="toc-more">and {cut[i].more} more</li>}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** The whole printed journal: a table of contents, then every chosen page, each with its page number. Calls onReady once everything has loaded. */
export default function PrintDocument({ period, sheets, onReady, onTotal }: { period: Period; sheets: SheetSpec[]; onReady(ready: boolean): void; onTotal?(pages: number): void }) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [limit, setLimit] = useState(CHUNK);
  const root = useRef<HTMLDivElement>(null);
  const setCount = useCallback((k: string, n: number) => setCounts((c) => (c[k] === n ? c : { ...c, [k]: n })), []);
  const countArr = useMemo(() => sheets.map((s) => counts[s.key] ?? 1), [sheets, counts]);
  const starts = useMemo(() => startPages(countArr), [countArr]);
  const total = 1 + countArr.reduce((n, c) => n + c, 0);
  const label = periodLabel(period);
  useEffect(() => { onTotal?.(total); }, [total, onTotal]);
  useEffect(() => { setLimit(CHUNK); onReady(false); }, [sheets]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let stable = 0;
    const id = setInterval(() => {
      const el = root.current; if (!el) return;
      const shown = [...el.querySelectorAll<HTMLElement>('[data-sheet]')].slice(0, limit + 1);
      const busy = shown.some((s) => /Loading\.\.\./.test(s.textContent ?? '') || [...s.querySelectorAll('img')].some((i) => !i.complete));
      if (busy) { stable = 0; onReady(false); return; }
      if (++stable < 2) return;
      if (limit < sheets.length) { setLimit((l) => l + CHUNK); stable = 0; } else onReady(true);
    }, 350);
    return () => clearInterval(id);
  }, [limit, sheets.length, onReady]);
  return (
    <div className="printdoc" ref={root}>
      <Sheet id="toc" landscape={false} width={760} number={1} left={`Book Journal · ${label}`} onPages={() => undefined}>
        <Toc period={period} sheets={sheets} starts={starts} counts={countArr} total={total} />
      </Sheet>
      {sheets.map((s, i) => i < limit ? (
        <Sheet key={s.key} id={s.key} landscape={s.landscape} width={s.width} number={starts[i]} left={`Book Journal · ${label}`} onPages={(n) => setCount(s.key, n)}>
          <SheetContent view={s.view} />
        </Sheet>
      ) : <div key={s.key} className="ppaper pending"><span className="muted">Getting page {starts[i]} ready...</span></div>)}
    </div>
  );
}

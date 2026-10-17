import { useEffect, useRef, useState } from 'react';
import { monthColor } from '../domain/months';
import { MONTH_NAMES } from '../domain/months';
import type { Bracket, BracketQuarter, Cand } from '../repo/bracket';

export interface BracketActions {
  month(month: number, readId: string | null): void;
  match(quarter: number, match: 1 | 2, readId: string | null): void;
  quarter(quarter: number, readId: string | null): void;
  half(half: number, readId: string | null): void;
  champion(readId: string | null): void;
}

type State = 'win' | 'lose' | null;
interface SlotProps { x: number; y: number; w?: number; h?: number; label: string; color: string; cand: Cand | null; options: Cand[]; suggested?: string | null; state?: State; onPick?: (readId: string | null) => void; fs?: number; empty?: string }

function Slot({ x, y, w = 92, h = 124, label, color, cand, options, suggested, state = null, onPick, fs = 11, empty }: SlotProps) {
  const [open, setOpen] = useState(false);
  const sel = useRef<HTMLSelectElement>(null);
  useEffect(() => { if (open) { sel.current?.focus(); try { sel.current?.showPicker?.(); } catch { /* ignore */ } } }, [open]);
  const canPick = !!onPick && options.length > 0;
  const text = cand ? cand.title.toUpperCase() : empty ?? (canPick ? 'Choose' : '');
  return (
    <div className={`bslot ${state ?? ''}`} style={{ left: x, top: y, width: w }}>
      <span className="blabel" style={{ color }}>{label}</span>
      {open && canPick ? (
        <select ref={sel} className="bselect" aria-label={label} style={{ width: w }} value={cand?.read_id ?? ''} onBlur={() => setOpen(false)}
          onChange={(e) => { setOpen(false); onPick!(e.target.value || null); }}>
          <option value="">{cand ? 'Clear this pick' : 'Choose a book'}</option>
          {options.map((o) => <option key={o.read_id} value={o.read_id}>{o.title}{o.stars !== null ? ` (${o.stars}★)` : ''}{o.read_id === suggested ? ' (highest rated)' : ''}</option>)}
        </select>
      ) : (
        <button type="button" disabled={!canPick} className={cand ? 'bbox filled' : 'bbox'} title={cand?.title} aria-label={cand ? `${label}: ${cand.title}` : `${label}: choose a book`} onClick={() => setOpen(true)}
          style={{ width: w, height: h, borderColor: cand ? color : undefined, fontSize: fs }}>{cand?.cover ? <img className="bcover" src={cand.cover} alt="" /> : text}</button>
      )}
      {cand && <span className="bsub">{cand.stars !== null ? `${cand.stars} of 5` : 'Unrated'}</span>}
    </div>
  );
}

const lines = (d: string, w: number, h: number) => <svg className="blines" width={w} height={h} aria-hidden="true"><path d={d} fill="none" stroke="var(--muted)" strokeWidth="2" /></svg>;
const stateOf = (cand: Cand | null, won: boolean, decided: boolean): State => (!cand ? null : won ? 'win' : decided ? 'lose' : null);

// Four different colors, one per quarter.
export const QUARTER_COLORS = ['#a65e3a', '#5b6e7e', '#8a9a82', '#d3a05c'];

// January plays February, February plays March, and those two winners meet for the best of the quarter.
// February appears in both matches, so every line joins a pair of books to the match they play in.
function Quarter({ q, act }: { q: BracketQuarter; act: BracketActions }) {
  const [a, b, c] = q.months;
  const name = (m: number) => MONTH_NAMES[m - 1].slice(0, 3).toUpperCase();
  const col = QUARTER_COLORS[q.quarter - 1];
  const H = 100; // height of a month's box
  const lose1 = !!q.w1, lose2 = !!q.w2;
  const slots = [
    { m: a, y: 0, won: !!a.pick && q.w1?.read_id === a.pick.read_id, decided: lose1 },
    { m: b, y: 150, won: !!b.pick && q.w1?.read_id === b.pick.read_id, decided: lose1 },
    { m: b, y: 300, won: !!b.pick && q.w2?.read_id === b.pick.read_id, decided: lose2 },
    { m: c, y: 450, won: !!c.pick && q.w2?.read_id === c.pick.read_id, decided: lose2 },
  ];
  const d = 'M92,68 H122 V218 M92,218 H122 M122,143 H170 M92,368 H122 V518 M92,518 H122 M122,443 H170 M262,143 H301 V443 M262,443 H301 M301,293 H340';
  return (
    <div className="bcard" style={{ borderTop: `4px solid ${col}` }}>
      <span className="lbl2">{`Q${q.quarter} · ${MONTH_NAMES[a.month - 1]} to ${MONTH_NAMES[c.month - 1]}`}</span>
      <div className="bracketbox" style={{ width: 470, height: 600 }}>
        {lines(d, 470, 600)}
        {slots.map((sl, i) => (
          <Slot key={i} x={0} y={sl.y} h={H} label={name(sl.m.month)} color={monthColor(sl.m.month)} cand={sl.m.pick} options={sl.m.candidates} suggested={sl.m.suggested}
            state={stateOf(sl.m.pick, sl.won, sl.decided)} onPick={(id) => act.month(sl.m.month, id)} empty={sl.m.candidates.length ? 'Choose the best of the month' : 'No books'} />
        ))}
        <Slot x={170} y={75} h={H} label={`${name(a.month)} / ${name(b.month)}`} color="var(--muted)" cand={q.w1} options={q.w1Options} state={stateOf(q.w1, !!q.best && q.best.read_id === q.w1?.read_id, !!q.best)} onPick={(id) => act.match(q.quarter, 1, id)} empty={q.w1Options.length ? 'Pick the winner' : ''} />
        <Slot x={170} y={375} h={H} label={`${name(b.month)} / ${name(c.month)}`} color="var(--muted)" cand={q.w2} options={q.w2Options} state={stateOf(q.w2, !!q.best && q.best.read_id === q.w2?.read_id, !!q.best)} onPick={(id) => act.match(q.quarter, 2, id)} empty={q.w2Options.length ? 'Pick the winner' : ''} />
        <Slot x={340} y={187} w={120} h={176} label={`BEST OF Q${q.quarter}`} color={col} cand={q.best} options={q.bestOptions} onPick={(id) => act.quarter(q.quarter, id)} fs={15} empty={q.bestOptions.length ? 'Pick the best of the quarter' : ''} />
      </div>
    </div>
  );
}

export default function BracketView({ bracket, act }: { bracket: Bracket; act: BracketActions }) {
  const [q1, q2, q3, q4] = bracket.quarters;
  const [h1, h2] = bracket.halves;
  // Q1 and Q2 feed January to June on the left, Q3 and Q4 feed July to December on the right, and both halves meet at the featured winner in the middle.
  const W = 860, H = 380, bw = 96, bh = 124;
  // Box centers sit 20px below each slot's top (its label comes first): the quarters at 82 and 282, the half-years and the champion at 182.
  const fd = `M${bw},82 H123 V282 M${bw},282 H123 M123,182 H150 M246,182 H330 `
    + `M${W - bw},82 H${W - 123} V282 M${W - bw},282 H${W - 123} M${W - 123},182 H${W - 150} M${W - 246},182 H${W - 330}`;
  const small = { w: bw, h: bh, fs: 10 };
  const shown = (cand: Cand | null, among: (Cand | null)[], decided: Cand | null): State => stateOf(cand, !!decided && decided.read_id === cand?.read_id, !!decided && among.some(Boolean));
  return (
    <div className="bracketpage">
      <div className="bracketgrid">
        {bracket.quarters.map((q) => <Quarter key={q.quarter} q={q} act={act} />)}
        <div className="bcard bfinal" style={{ gridColumn: 'span 2', alignItems: 'center' }}>
          <span className="lbl2">Half-years and the year</span>
          <div className="bscroll">
            <div className="bracketbox" style={{ width: W, height: H }}>
              {lines(fd, W, H)}
              <Slot x={0} y={0} {...small} label="Q1 BEST" color={QUARTER_COLORS[0]} cand={q1.best} options={[]} state={shown(q1.best, [q1.best], h1.best)} />
              <Slot x={0} y={200} {...small} label="Q2 BEST" color={QUARTER_COLORS[1]} cand={q2.best} options={[]} state={shown(q2.best, [q2.best], h1.best)} />
              <Slot x={150} y={100} {...small} label="JAN TO JUN" color="var(--muted)" cand={h1.best} options={h1.options} state={shown(h1.best, [h1.best], bracket.champion)} onPick={(id) => act.half(1, id)} empty={h1.options.length ? 'Pick' : ''} />
              <Slot x={W - bw} y={0} {...small} label="Q3 BEST" color={QUARTER_COLORS[2]} cand={q3.best} options={[]} state={shown(q3.best, [q3.best], h2.best)} />
              <Slot x={W - bw} y={200} {...small} label="Q4 BEST" color={QUARTER_COLORS[3]} cand={q4.best} options={[]} state={shown(q4.best, [q4.best], h2.best)} />
              <Slot x={W - 150 - bw} y={100} {...small} label="JUL TO DEC" color="var(--muted)" cand={h2.best} options={h2.options} state={shown(h2.best, [h2.best], bracket.champion)} onPick={(id) => act.half(2, id)} empty={h2.options.length ? 'Pick' : ''} />
              <Slot x={W / 2 - 100} y={32} w={200} h={260} label={`BEST OF ${bracket.year}`} color="#d6a35e" cand={bracket.champion} options={bracket.championOptions} onPick={act.champion} fs={20} empty={bracket.championOptions.length ? 'Pick the winner' : ''} />
            </div>
          </div>
        </div>
      </div>
      <span className="muted">Each quarter plays January against February and February against March (so February appears twice, and both boxes are the same pick), then the two winners meet for the best of the quarter. The quarter winners play off for the best of January to June and of July to December, and those two meet for the best book of {bracket.year}. Click a slot to choose; the highest-rated book is marked as a suggestion. Outlined books won their match, and dimmed ones lost.</span>
    </div>
  );
}

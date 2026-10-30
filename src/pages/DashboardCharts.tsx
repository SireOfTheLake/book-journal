import { FORMAT_LABEL, MAKEUPS, PAGE_GROUPS, STAR_GROUPS, type ChallengeMix, type DotColumn, type SourceMix } from '../domain/dashboard';

// The charts take their colors from the month colors in use (--month-1 to --month-12), so they follow the theme and any changes made to the months.
const mc = (n: number) => `var(--month-${n})`;
export const PAGE_COLORS = [mc(1), mc(2), mc(3)];
export const STAR_COLORS = ['var(--muted)', mc(1), mc(2), mc(3), mc(4), mc(5)];
const FORMAT_COLORS: Record<string, string> = { ebook: mc(3), audio: mc(5), physical: mc(2), none: 'var(--muted)' };
const SOURCE_COLORS = [mc(3), mc(2), mc(5), mc(4), mc(6), mc(1), mc(9), mc(8)];
const LETTER_COLORS: Record<string, string> = { M: '#5b8fb9', F: '#c4707f', X: '#8a7bb5' };

function Legend({ items }: { items: { label: string; color: string; note?: string }[] }) {
  return <ul className="dlegend" aria-label="Legend">{items.map((i) => <li key={i.label}><i className="sw" style={{ background: i.color }} />{i.label}{i.note ? <span className="muted"> {i.note}</span> : null}</li>)}</ul>;
}

// A dot for every book, stacked above its value. Each group has its own colour.
// Major ticks (hundreds of pages, whole stars) get large labels; minor ticks (tens of pages, quarter stars) get small ones.
export function DotPlot({ columns, step, from, to, colW, major, minor, minorRotate, unit, colors, groups, label }: {
  columns: DotColumn[]; step: number; from: number; to: number; colW: number; major: { at: number; text: string }[]; minor: { at: number; text: string }[]; minorRotate?: boolean;
  unit: (x: number) => string; colors: string[]; groups: string[]; label: string;
}) {
  const r = Math.min(colW / 2 - 1, 7);
  const pitch = r * 2 + 2;
  const rows = Math.max(3, ...columns.map((c) => c.count));
  const cols = Math.round((to - from) / step) + 1;
  const W = cols * colW + 20;
  const minorH = minorRotate ? 26 : 14;
  const base = rows * pitch + 6;
  const H = base + minorH + 22;
  const cx = (x: number) => 10 + ((x - from) / step) * colW + colW / 2;
  const total = groups.map((_, g) => columns.filter((c) => c.group === g).reduce((n, c) => n + c.count, 0));
  return (
    <>
      <svg className="dotplot" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={label} preserveAspectRatio="xMinYMid meet">
        <line x1={10} x2={W - 10} y1={base} y2={base} stroke="var(--line2)" />
        {minor.map((t) => (
          <g key={`n${t.at}`}>
            <line x1={cx(t.at)} x2={cx(t.at)} y1={base} y2={base + 3} stroke="var(--line2)" />
            <text className="tick-minor" fontSize="8" fill="var(--muted)" textAnchor={minorRotate ? 'end' : 'middle'}
              transform={minorRotate ? `translate(${cx(t.at) + 3} ${base + 6}) rotate(-90)` : undefined} x={minorRotate ? undefined : cx(t.at)} y={minorRotate ? undefined : base + 12}>{t.text}</text>
          </g>
        ))}
        {major.map((t) => (
          <g key={`j${t.at}`}>
            <line x1={cx(t.at)} x2={cx(t.at)} y1={base} y2={base + 6} stroke="var(--muted)" />
            <text className="tick-major" x={cx(t.at)} y={base + minorH + 15} textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--text)">{t.text}</text>
          </g>
        ))}
        {columns.map((c) => (
          <g key={c.x}>
            <title>{`${unit(c.x)}: ${c.count} ${c.count === 1 ? 'book' : 'books'}`}</title>
            {Array.from({ length: c.count }, (_, i) => <circle key={i} cx={cx(c.x)} cy={base - r - 2 - i * pitch} r={r} style={{ fill: colors[c.group] }} stroke="var(--panel)" strokeWidth="1.5" />)}
          </g>
        ))}
      </svg>
      <Legend items={groups.map((g, i) => ({ label: g, color: colors[i], note: String(total[i]) })).filter((_, i) => total[i] > 0 || groups.length <= 3)} />
    </>
  );
}

export function PageDots({ columns, max }: { columns: DotColumn[]; max: number }) {
  const tens = Array.from({ length: max / 10 + 1 }, (_, i) => i * 10);
  return <DotPlot columns={columns} step={10} from={0} to={max} colW={14} minorRotate
    major={tens.filter((v) => v % 100 === 0).map((v) => ({ at: v, text: String(v) }))} minor={tens.filter((v) => v % 100 !== 0).map((v) => ({ at: v, text: String(v) }))}
    unit={(x) => `${x} to ${x + 9} pages`} colors={PAGE_COLORS} groups={PAGE_GROUPS} label="Books by page count" />;
}
export function StarDots({ columns }: { columns: DotColumn[] }) {
  const quarters = Array.from({ length: 21 }, (_, i) => i / 4);
  const frac = (v: number) => String(v - Math.floor(v)).replace('0.', '.');
  return <DotPlot columns={columns} step={0.25} from={0} to={5} colW={30}
    major={quarters.filter((v) => Number.isInteger(v)).map((v) => ({ at: v, text: String(v) }))} minor={quarters.filter((v) => !Number.isInteger(v)).map((v) => ({ at: v, text: frac(v) }))}
    unit={(x) => `${x} ${x === 1 ? 'star' : 'stars'}`} colors={STAR_COLORS} groups={STAR_GROUPS.map((g) => `${g} ${g === '1' ? 'star' : 'stars'}`)} label="Books by star rating" />;
}

// Every kind of pairing, with how many books had it.
export function MakeupTiles({ counts }: { counts: { name: string; count: number }[] }) {
  const by = new Map(counts.map((c) => [c.name, c.count]));
  return (
    <div className="makeups">
      {MAKEUPS.map((m) => {
        const n = by.get(m) ?? 0;
        const letters = m.length === 2 && m !== 'unknown' ? m.split('') : [];
        return (
          <div key={m} className={`dmk ${n ? '' : 'zero'}`} aria-label={`${m === 'unknown' ? 'Unknown' : m}: ${n}`}>
            <span className="dmkglyph">
              {letters.length ? letters.map((l, i) => <i key={i} className="dmkdot" style={{ background: LETTER_COLORS[l] }}>{l}</i>) : <span className="dmkword">{m === 'unknown' ? '?' : 'Mixed'}</span>}
            </span>
            <span className="dmkname">{m === 'unknown' ? 'Unknown' : m === 'Other' ? 'Other' : m}</span>
            <b className="dmknum">{n}</b>
          </div>
        );
      })}
    </div>
  );
}

// Two lanes on a 0 to 100 scale: the formats, then under each format the sources of those books. Percentages are of all the month's books.
const pct = (n: number) => `${Math.round(n)}%`;
export function SourcesChart({ mix }: { mix: SourceMix[] }) {
  if (!mix.length) return <span className="muted small">No books finished yet.</span>;
  const names = [...new Set(mix.flatMap((f) => f.sources.map((s) => s.name)))];
  const sourceColor = new Map<string, string>();
  for (const f of mix) for (const s of f.sources) if (!sourceColor.has(s.name)) sourceColor.set(s.name, s.color && /^#[0-9a-f]{6}$/i.test(s.color) ? s.color : SOURCE_COLORS[names.indexOf(s.name) % SOURCE_COLORS.length]);
  const ticks = Array.from({ length: 11 }, (_, i) => i * 10);
  return (
    <div className="srcchart">
      <div className="lane"><span className="lanelabel">Format</span>
        <div className="laneBar" role="img" aria-label="Books by format">
          {mix.map((f) => <span key={f.format} className="seg2" style={{ left: `${f.start}%`, width: `${f.share}%`, background: FORMAT_COLORS[f.format] }} title={`${FORMAT_LABEL[f.format]}: ${f.total} (${pct(f.share)})`}>{f.share >= 5 ? <b>{pct(f.share)}</b> : null}</span>)}
        </div>
      </div>
      <div className="lane"><span className="lanelabel">Source</span>
        <div className="laneBar" role="img" aria-label="Books by format and source">
          {mix.flatMap((f) => f.sources.map((s) => <span key={`${f.format}${s.name}`} className="seg2" style={{ left: `${s.start}%`, width: `${s.share}%`, background: sourceColor.get(s.name) }} title={`${FORMAT_LABEL[f.format]} · ${s.name}: ${s.count} (${pct(s.share)})`}>{s.share >= 5 ? <b>{pct(s.share)}</b> : null}</span>))}
        </div>
      </div>
      <div className="lane"><span />
        <div className="scale" aria-hidden="true">{ticks.map((t) => <span key={t} className="stick" style={{ left: `${t}%` }}><i />{t}</span>)}</div>
      </div>
      <div className="srclegend" aria-label="Legend">
        {mix.map((f) => (
          <div key={f.format} className="dlgroup">
            <div className="dlgfmt"><i className="sw" style={{ background: FORMAT_COLORS[f.format] }} /><b>{FORMAT_LABEL[f.format]}</b><span className="dlgpct">{pct(f.share)}</span></div>
            {f.sources.map((s) => <div key={s.name} className="dlgsrc"><i className="sw" style={{ background: sourceColor.get(s.name) }} />{s.name}<span className="dlgpct">{pct(s.share)}</span></div>)}
          </div>
        ))}
      </div>
    </div>
  );
}

// The share of the filled prompts that belong to each challenge. Challenges with nothing filled are left out.
export function ChallengeBreakdown({ mix }: { mix: ChallengeMix[] }) {
  if (!mix.length) return <span className="muted small">No challenge prompts were filled in this period.</span>;
  const colorOf = (c: ChallengeMix, i: number) => (c.color && /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : SOURCE_COLORS[i % SOURCE_COLORS.length]);
  return (
    <div className="srcchart">
      <div className="lane"><span className="lanelabel">Challenges</span>
        <div className="laneBar" role="img" aria-label="Filled prompts by challenge">
          {mix.map((c, i) => <span key={c.id} className="seg2" style={{ left: `${c.start}%`, width: `${c.share}%`, background: colorOf(c, i) }} title={`${c.name}: ${c.count} (${pct(c.share)})`}>{c.share >= 5 ? <b>{pct(c.share)}</b> : null}</span>)}
        </div>
      </div>
      <div className="srclegend" aria-label="Legend">
        <div className="dlgroup">
          {mix.map((c, i) => <div key={c.id} className="dlgsrc"><i className="sw" style={{ background: colorOf(c, i) }} />{c.name}<span className="dlgpct">{pct(c.share)}</span></div>)}
        </div>
      </div>
    </div>
  );
}

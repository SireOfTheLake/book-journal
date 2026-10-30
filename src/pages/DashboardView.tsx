import StateShape from '../ui/StateShape';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDuration } from '../domain/format';
import { monthName } from '../domain/dashboard';
import type { DashboardCore, GoalSplit, MonthBook, MonthlyDashboard, Sticker, YearlyDashboard } from '../repo/dashboard';
import { monthColor } from '../domain/months';
import { Card, Lightbox, StarRow } from './bookLog/parts';
import { MakeupTiles, PageDots, SourcesChart, StarDots } from './DashboardCharts';
import BingoTile from './challenges/BingoTile';
import { WordTilesRow } from '../ui/WordTiles';

export type DashTab = 'monthly' | 'yearly';

const pretty = (n: number) => (Number.isInteger(n) ? n.toLocaleString('en-US') : String(n));

function Counts({ title, items, empty = 'None yet.' }: { title: string; items: { name: string; count: number }[]; empty?: string }) {
  return (
    <Card label={title}>
      {items.length === 0 ? <span className="muted small">{empty}</span> : items.map((i, n) => (
        <div className="relline" key={i.name}><span className={n === 0 ? 'topname' : ''}>{i.name}</span><b>{i.count}</b></div>
      ))}
    </Card>
  );
}

// A bar in three parts: progress made before this month, progress made in this month (in the month's own color), and what is left.
export function SplitBar({ label, split, month }: { label: string; split: { before: number; month: number; rest: number }; month: number }) {
  return (
    <div className="splitbar" role="progressbar" aria-label={`${label} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(split.before + split.month)}>
      <span className="sb-before" style={{ width: `${split.before}%` }} title="Before this month" />
      <span className="sb-month" style={{ width: `${split.month}%`, background: monthColor(month) }} title="This month" />
    </div>
  );
}

function GoalRow({ g, month }: { g: GoalSplit; month: number }) {
  return (
    <div className="dgoal" aria-label={g.label}>
      <div className="goalhead"><span className="goaltitle">{g.label}</span><span className="grow" /><span className="muted small">{g.timed ? `${g.from} to ${g.to}` : 'Whole year'}</span></div>
      <SplitBar label={g.label} split={g.split} month={month} />
      <div className="goalnums small">
        <span><b>{pretty(g.total)}</b> of {pretty(g.target)} {g.unit}</span>
        <span><i className="sw before" /> {pretty(g.before)} before · <i className="sw" style={{ background: monthColor(month) }} /> <b>{pretty(g.month)}</b> in {monthName(month)}</span>
      </div>
    </div>
  );
}

function BookLine({ b }: { b: MonthBook | null }) {
  if (!b) return <span className="muted small">—</span>;
  return <Link className="l" to={`/book/${b.book_id}/${b.read_id}`}>{b.title}</Link>;
}

// a stable pseudo-random number (0..1) per sticker, so the scatter looks the same every time the page opens
function jitter(seed: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 1000) / 1000;
}

// A cover or sticker that opens as big as it can go; the book it belongs to is one click away from there.
type Zoomed = { src: string; alt: string; to: string; label: string };
function ZoomLightbox({ z, onClose }: { z: Zoomed; onClose: () => void }) {
  return <Lightbox src={z.src} alt={z.alt} onClose={onClose}><Link className="l" to={z.to}>{z.label}</Link></Lightbox>;
}

export function StickerGrid({ stickers }: { stickers: Sticker[] }) {
  const [zoom, setZoom] = useState<Zoomed | null>(null);
  if (stickers.length === 0) return <span className="muted small">No challenge prompts were filled in this period.</span>;
  return (
    <div className="dstickers">
      {stickers.map((s, i) => {
        const seed = `${s.challenge_id}|${s.label}|${i}`;
        const loose = !!s.art && !s.cover && !s.word && !s.usMap && s.kind !== 'bingo'; // a sticker picture: shown whole, scattered
        const style = loose ? ({
          '--rot': `${(jitter(seed, 1) * 20 - 10).toFixed(1)}deg`,
          '--dy': `${Math.round(jitter(seed, 3) * 16 - 8)}px`,
          '--dx': `${Math.round(jitter(seed, 4) * 10 - 8)}px`,
        } as React.CSSProperties) : undefined;
        return (
        <div style={style} className={s.word ? 'dsticker dword' : s.usMap ? 'dsticker dstate' : loose ? 'dsticker dloose' : 'dsticker'} key={`${s.challenge_id}${i}`} title={`${s.challenge}: ${s.label}${s.note ? ` — ${s.note}` : ''} (${s.title})`}>
          {s.word ? <WordTilesRow tiles={s.word} label={s.label} /> : s.usMap ? <StateShape region={s.region} name={s.label} color={s.color} size={s.region && s.region !== 'us' ? 72 : 64} /> : s.kind === 'bingo' ? <BingoTile label={s.label} art={s.art} color={s.color ?? '#a65e3a'} />
            : s.cover ? <button type="button" className="dzoom" aria-label={`View ${s.title} full size`} onClick={() => setZoom({ src: s.cover!, alt: s.title, to: `/book/${s.book_id}`, label: `Open ${s.title}` })}><img src={s.cover} alt={s.title} /></button>
            : s.art ? <button type="button" className="dzoom" aria-label={`View sticker ${s.label} full size`} onClick={() => setZoom({ src: s.art!, alt: s.label, to: `/book/${s.book_id}`, label: `Open ${s.title}` })}><img src={s.art} alt={s.label} /></button> : <div className="dsfallback"><span>{s.title}</span></div>}
        </div>
        );
      })}
      {zoom && <ZoomLightbox z={zoom} onClose={() => setZoom(null)} />}
    </div>
  );
}

// The totals card, the same for a month and a year.
export function SummaryCard({ d, label }: { d: DashboardCore; label: string }) {
  const t = d.totals;
  return (
        <Card label={label} className="span2">
          <div className="statrow">
            <div><span className="big">{t.books}</span><span className="muted">{t.books === 1 ? 'book' : 'books'}</span></div>
            <div><span className="big">{t.pages ? t.pages.toLocaleString('en-US') : '—'}</span><span className="muted">pages</span></div>
            <div><span className="big">{t.audioHours || '—'}</span><span className="muted">audio hours</span></div>
            <div><span className="big">{t.dnf}</span><span className="muted">DNF</span></div>
          </div>
          <div className="relline"><span className="muted">Average rating</span>{t.avgStars !== null ? <span className="inline"><StarRow value={Math.round(t.avgStars * 4) / 4} size={14} /><b>{Math.round(t.avgStars * 100) / 100}</b></span> : <span className="muted">—</span>}</div>
          <div className="relline"><span className="muted">Average length</span><b>{t.avgPages ? `${t.avgPages} pages` : '—'}</b></div>
          <div className="relline"><span className="muted">Average days to finish</span><b>{t.avgDays ?? '—'}</b></div>
        </Card>
  );
}

// Everything from the covers down: the same for a month and a year.
const FAVORITES_SHOWN = 5;
function FavoritesCard({ books }: { books: MonthBook[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? books : books.slice(0, FAVORITES_SHOWN);
  return (
    <Card label="Favorites">
      {books.length === 0 ? <span className="muted small">No favorites or five-star books yet.</span> : shown.map((b) => (
        <div key={b.read_id} className="relline favline"><BookLine b={b} />
          <span className="favwhy">
            {b.favorite && <span className="chip fav" title="Marked as a favorite">&#9829; Favorite</span>}
            {(b.rating ?? 0) >= 20 && <span className="chip fav" title="Rated five stars">&#9733; 5 stars</span>}
          </span>
        </div>
      ))}
      {books.length > FAVORITES_SHOWN && (
        <button type="button" className="mini morebtn" aria-expanded={all} onClick={() => setAll(!all)}>{all ? 'Show less' : `Show more (${books.length - FAVORITES_SHOWN} more)`}</button>
      )}
    </Card>
  );
}

export function SharedCards({ d, period }: { d: DashboardCore; period: string }) {
  const [zoom, setZoom] = useState<Zoomed | null>(null);
  return (
    <>
        <Card label="Books finished" className="span4">
          {d.books.length === 0 ? <span className="muted small">No books finished in {period} yet.</span> : (
            <div className="dcovers">
              {d.books.map((b) => (
                d.covers[b.book_id]
                  ? <button key={b.read_id} type="button" className="dcover dzoom" title={b.title} aria-label={`View the cover of ${b.title} full size`} onClick={() => setZoom({ src: d.covers[b.book_id], alt: b.title, to: `/book/${b.book_id}/${b.read_id}`, label: `Open ${b.title}` })}><img src={d.covers[b.book_id]} alt="" /></button>
                  : <Link key={b.read_id} className="dcover" to={`/book/${b.book_id}/${b.read_id}`} title={b.title} aria-label={b.title}><span className="dsfallback"><span>{b.title}</span></span></Link>
              ))}
            </div>
          )}
          {zoom && <ZoomLightbox z={zoom} onClose={() => setZoom(null)} />}
        </Card>

        <Counts title="Most read authors" items={d.top.authors} />
        <Counts title="Top genres" items={d.top.genres} />
        <Counts title="Top tropes" items={d.top.tropes} />
        <Counts title="Main character first names" items={d.top.characters} />
        <Counts title="Main character jobs" items={d.top.jobs} />
        <Counts title="Settings: States" items={d.top.states} />
        <Counts title="Settings: Non-US Countries" items={d.top.countries} />
        <FavoritesCard books={d.favorites} />

        <Card label="Shortest and longest" className="span2">
          <div className="relline"><span className="muted">Shortest</span><span><BookLine b={d.shortest} /> {d.shortest && <span className="muted small">{d.shortest.pages} pages</span>}</span></div>
          <div className="relline"><span className="muted">Longest</span><span><BookLine b={d.longest} /> {d.longest && <span className="muted small">{d.longest.pages} pages</span>}</span></div>
          <div className="relline"><span className="muted">Shortest audio</span><span><BookLine b={d.shortestAudio} /> {d.shortestAudio && <span className="muted small">{formatDuration(d.shortestAudio.audio_seconds)}</span>}</span></div>
          <div className="relline"><span className="muted">Longest audio</span><span><BookLine b={d.longestAudio} /> {d.longestAudio && <span className="muted small">{formatDuration(d.longestAudio.audio_seconds)}</span>}</span></div>
        </Card>

        <Card label="Relationship makeup" className="span2"><MakeupTiles counts={d.makeups} /></Card>

        <Card label="Sources" className="span4"><SourcesChart mix={d.sourceMix} /></Card>

        <Card label="Page distribution" className="span4"><PageDots columns={d.pageDots.columns} max={d.pageDots.max} /></Card>

        <Card label="Star distribution" className="span2"><StarDots columns={d.starDots} /></Card>

        <Card label="Series" className="span2">
          <div className="relline"><span className="muted">Started</span><span>{d.series.started.length ? d.series.started.map((s) => <Link key={s.id} className="l comma" to={`/series/${s.id}`}>{s.title}</Link>) : '—'}</span></div>
          <div className="relline"><span className="muted">Continued</span><span>{d.series.continued.length ? d.series.continued.map((s) => <Link key={s.id} className="l comma" to={`/series/${s.id}`}>{s.title}</Link>) : '—'}</span></div>
          <div className="relline"><span className="muted">Finished</span><span>{d.series.finished.length ? d.series.finished.map((s) => <Link key={s.id} className="l comma" to={`/series/${s.id}`}>{s.title}</Link>) : '—'}</span></div>
        </Card>
    </>
  );
}

// ---------- the yearly dashboard ----------
function StackBar({ label, before, byMonth, target }: { label: string; before: number; byMonth: number[]; target: number }) {
  const w = (n: number) => (target > 0 ? Math.min(100, (n / target) * 100) : 0);
  let used = w(before);
  return (
    <div className="splitbar" role="progressbar" aria-label={`${label} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(100, w(before + byMonth.reduce((a, b) => a + b, 0))))}>
      {before > 0 && <span className="sb-before" style={{ width: `${w(before)}%` }} title="Earlier or undated" />}
      {byMonth.map((n, i) => { const width = Math.max(0, Math.min(w(n), 100 - used)); used += width; return n > 0 ? <span key={i} className="sb-m" style={{ width: `${width}%`, background: monthColor(i + 1) }} title={`${monthName(i + 1)}: ${n}`} /> : null; })}
    </div>
  );
}

function MonthKey() {
  return <div className="monthkey small muted">{Array.from({ length: 12 }, (_, i) => <span key={i}><i className="sw" style={{ background: monthColor(i + 1) }} />{monthName(i + 1).slice(0, 3)}</span>)}</div>;
}

export function YearlyView({ d }: { d: YearlyDashboard }) {
  const maxBooks = Math.max(1, ...d.months.map((m) => m.books));
  const run = (r: { length: number; start: string; end: string; ongoing: boolean } | null) => (r ? `${r.length} ${r.length === 1 ? 'day' : 'days'} (${r.start} to ${r.end}${r.ongoing ? ', still going' : ''})` : '—');
  return (
    <>
      <h2 className="dashhead" style={{ borderColor: 'var(--accent)' }}>{d.year}</h2>
      <div className="dashgrid">
        <SummaryCard d={d} label="This year" />
        <Card label="Month by month" className="span2">
          <div className="mbars" role="img" aria-label="Books finished each month">
            {d.months.map((m) => (
              <div key={m.month} className="mbar">
                <b className="mbn">{m.books || ''}</b>
                <span className="mbtrack"><span className="mbfill" style={{ height: `${(m.books / maxBooks) * 100}%`, background: monthColor(m.month) }} title={`${monthName(m.month)}: ${m.books} ${m.books === 1 ? 'book' : 'books'}, ${m.pages.toLocaleString('en-US')} pages`} /></span>
                <span className="mbl">{monthName(m.month).slice(0, 3)}</span>
                <span className="mbp muted">{m.pages ? m.pages.toLocaleString('en-US') : ''}</span>
              </div>
            ))}
          </div>
          <span className="muted small">Books finished each month, with pages read underneath.</span>
          {d.bestMonth && <div className="relline"><span className="muted">Busiest month</span><b>{`${monthName(d.bestMonth.month)} (${d.bestMonth.books})`}</b></div>}
          {d.quietestMonth && <div className="relline"><span className="muted">Quietest month with books</span><b>{`${monthName(d.quietestMonth.month)} (${d.quietestMonth.books})`}</b></div>}
        </Card>

        <Card label="Goals" className="span2">
          {d.goals.length === 0 ? <span className="muted small">No goals this year. Add them on the Journal overview.</span> : d.goals.map((g) => (
            <div className="dgoal" key={g.id} aria-label={g.label}>
              <div className="goalhead"><span className="goaltitle">{g.label}</span><span className="grow" /><span className="muted small">{g.timed ? `${g.from} to ${g.to}` : 'Whole year'}</span></div>
              <StackBar label={g.label} before={g.before} byMonth={g.byMonth} target={g.target} />
              <div className="goalnums small"><span><b>{pretty(g.total)}</b> of {pretty(g.target)} {g.unit}</span><span className="muted">{g.target > 0 ? `${Math.round((g.total / g.target) * 100)}%` : ''}</span></div>
            </div>
          ))}
          <MonthKey />
        </Card>

        <Card label="Challenges" className="span2">
          {d.challenges.length === 0 ? <span className="muted small">No challenges this year.</span> : d.challenges.map((c) => (
            <div className="dgoal" key={c.id}>
              <div className="goalhead"><Link className="l goaltitle" to={`/journal/challenges/${c.id}`}>{c.name}</Link><span className="grow" /><span className="muted small">{`${c.before + c.month} of ${c.total}`}</span></div>
              <StackBar label={c.name} before={c.before} byMonth={c.byMonth} target={c.total} />
            </div>
          ))}
          <MonthKey />
        </Card>

        <Card label="Streaks" className="span2">
          <div className="relline"><span className="muted">Longest reading streak</span><span>{run(d.streaks.longestReading)}</span></div>
          <div className="relline"><span className="muted">Longest run finishing books</span><span>{run(d.streaks.longestFinishing)}</span></div>
          <div className="relline"><span className="muted">Longest break from reading</span><span>{run(d.streaks.longestBreak)}</span></div>
        </Card>

        <Card label={`Stickers from ${d.year}`} className="span2"><StickerGrid stickers={d.stickers} /></Card>

        <SharedCards d={d} period={String(d.year)} />
      </div>
    </>
  );
}

export default function DashboardView({ tab, setTab, year, month, setMonth, d, y, today }: {
  tab: DashTab; setTab(t: DashTab): void; year: number; month: number; setMonth(m: number): void; d: MonthlyDashboard | null; y?: YearlyDashboard | null; today: string;
}) {
  const t = d?.totals;
  return (
    <div className="dash">
      <div className="seg dashtabs" role="tablist" aria-label="Dashboard type">
        {(['monthly', 'yearly'] as const).map((k) => <button type="button" role="tab" key={k} aria-selected={tab === k} aria-pressed={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{k === 'monthly' ? 'Monthly' : 'Yearly'}</button>)}
      </div>

      {tab === 'yearly' ? (y ? <YearlyView d={y} /> : <p className="muted">Loading...</p>) : (
        <>
          <div className="monthtabs" role="tablist" aria-label="Month">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <button type="button" role="tab" key={m} aria-selected={month === m} className={`mtab ${month === m ? 'on' : ''}`} style={{ ['--mc' as string]: monthColor(m) }} onClick={() => setMonth(m)}>
                {monthName(m).slice(0, 3)}{today.startsWith(`${year}-${String(m).padStart(2, '0')}`) ? ' •' : ''}
              </button>
            ))}
          </div>
          {!d || !t ? <p className="muted">Loading...</p> : (
            <>
              <h2 className="dashhead" style={{ borderColor: monthColor(month) }}>{`${monthName(month).toUpperCase()} ${year}`}</h2>
              <div className="dashgrid">
                <SummaryCard d={d} label="This month" />

                <Card label="Goals" className="span2">
                  {d.goals.length === 0 ? <span className="muted small">No goals cover this month. Add them on the Journal overview.</span> : d.goals.map((g) => <GoalRow key={g.id} g={g} month={month} />)}
                  <div className="splitkey small muted"><i className="sw before" /> done before {monthName(month)} <i className="sw" style={{ background: monthColor(month) }} /> done in {monthName(month)}</div>
                </Card>

                <Card label="Challenges" className="span2">
                  {d.challenges.length === 0 ? <span className="muted small">No challenges this year.</span> : d.challenges.map((c) => (
                    <div className="dgoal" key={c.id}>
                      <div className="goalhead"><Link className="l goaltitle" to={`/journal/challenges/${c.id}`}>{c.name}</Link><span className="grow" /><span className="muted small">{`${c.before + c.month} of ${c.total}`}</span></div>
                      <SplitBar label={c.name} split={c.split} month={month} />
                      <span className="muted small">{c.month ? `${c.month} filled in ${monthName(month)}` : `Nothing filled in ${monthName(month)}`}</span>
                    </div>
                  ))}
                </Card>

                <Card label={`Stickers from ${monthName(month)}`} className="span2">
                  <StickerGrid stickers={d.stickers} />
                </Card>

                <SharedCards d={d} period={monthName(month)} />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useDb } from '../../db/DbContext';
import { monthName, type DotColumn } from '../../domain/dashboard';
import { monthColor } from '../../domain/months';
import { getMonthlyDashboard, getYearlyDashboard, type DashboardCore, type MonthlyDashboard, type YearlyDashboard } from '../../repo/dashboard';
import { useJournalYear } from '../../ui/Shell';
import { Card } from '../bookLog/parts';
import { ChallengeBreakdown, MakeupTiles, PAGE_COLORS, SourcesChart, STAR_COLORS } from '../DashboardCharts';
import { Counts, FavoritesCard, GoalRow, MonthKey, SplitBar, StackBar, SummaryCard } from '../DashboardView';
import { formatDuration } from '../../domain/format';
import { Link } from 'react-router-dom';

const pretty = (n: number) => n.toLocaleString('en-US');

/** A simple bar graph: a bar for each label, with its number above. */
function Bars({ bars, label }: { bars: { label: string; count: number; color: string }[]; label: string }) {
  const max = Math.max(1, ...bars.map((b) => b.count));
  return (
    <div className="pbars" role="img" aria-label={label}>
      {bars.map((b) => (
        <div key={b.label} className="pbar">
          <b>{b.count || ''}</b>
          <span className="pbtrack"><span className="pbfill" style={{ height: `${(b.count / max) * 100}%`, background: b.color }} /></span>
          <span className="pbl">{b.label}</span>
        </div>
      ))}
    </div>
  );
}

export const pageBars = (cols: DotColumn[], max: number) => {
  const top = Math.max(100, Math.ceil((max + 1) / 100) * 100);
  return Array.from({ length: top / 100 }, (_, i) => {
    const inside = cols.filter((c) => c.x >= i * 100 && c.x < i * 100 + 100);
    return { label: i === 0 ? '<100' : i === top / 100 - 1 && top >= 700 ? `${i * 100}+` : `${i * 100}s`, count: inside.reduce((n, c) => n + c.count, 0), color: PAGE_COLORS[Math.min(2, inside[0]?.group ?? 0)] };
  });
};
export const starBars = (cols: DotColumn[]) => ['<1', '1', '2', '3', '4', '5'].map((l, i) => ({
  label: l === '<1' ? '<1 ★' : `${l}★`, color: STAR_COLORS[i],
  count: cols.filter((c) => (l === '<1' ? c.x < 1 : Math.floor(c.x) === Number(l))).reduce((n, c) => n + c.count, 0),
}));

function Extremes({ d }: { d: DashboardCore }) {
  const row = (name: string, b: DashboardCore['shortest'], val?: string) => (
    <div className="relline"><span className="muted">{name}</span><span>{b ? <Link className="l" to={`/book/${b.book_id}/${b.read_id}`}>{b.title}</Link> : '—'} {b && <span className="muted small">{val}</span>}</span></div>
  );
  return (
    <Card label="Shortest and longest">
      {row('Shortest', d.shortest, `${d.shortest?.pages} pages`)}{row('Longest', d.longest, `${d.longest?.pages} pages`)}
      {row('Shortest audio', d.shortestAudio, d.shortestAudio ? formatDuration(d.shortestAudio.audio_seconds) : '')}{row('Longest audio', d.longestAudio, d.longestAudio ? formatDuration(d.longestAudio.audio_seconds) : '')}
    </Card>
  );
}

function SeriesCard({ d }: { d: DashboardCore }) {
  const list = (a: { id: string; title: string }[]) => (a.length ? <>{a.slice(0, 6).map((s) => <Link key={s.id} className="l comma" to={`/series/${s.id}`}>{s.title}</Link>)}{a.length > 6 ? <span className="muted small"> and {a.length - 6} more</span> : null}</> : '\u2014');
  return (
    <Card label="Series">
      <div className="relline"><span className="muted">Started</span><span>{list(d.series.started)}</span></div>
      <div className="relline"><span className="muted">Continued</span><span>{list(d.series.continued)}</span></div>
      <div className="relline"><span className="muted">Finished</span><span>{list(d.series.finished)}</span></div>
    </Card>
  );
}

function Distributions({ d }: { d: DashboardCore }) {
  return (
    <>
      <Card label="Page distribution" className="s2"><Bars bars={pageBars(d.pageDots.columns, d.pageDots.max)} label="Books by page count" /></Card>
      <Card label="Star distribution" className="s2"><Bars bars={starBars(d.starDots)} label="Books by star rating" /></Card>
    </>
  );
}

function MonthPage({ d, month, year }: { d: MonthlyDashboard; month: number; year: number }) {
  return (
    <div className="pdash">
      <h2 className="dashhead" style={{ borderColor: monthColor(month) }}>{`${monthName(month).toUpperCase()} ${year} · DASHBOARD`}</h2>
      <div className="pdgrid">
        <SummaryCard d={d} label="This month" />
        <Card label="Goals" className="s2">
          {d.goals.length === 0 ? <span className="muted small">No goals cover this month.</span> : d.goals.map((g) => <GoalRow key={g.id} g={g} month={month} />)}
        </Card>
        <Card label="Challenges">
          {d.challenges.length === 0 ? <span className="muted small">No challenges this year.</span> : d.challenges.map((c) => (
            <div className="dgoal" key={c.id}>
              <div className="goalhead"><span className="goaltitle">{c.name}</span><span className="grow" /><span className="muted small">{`${c.before + c.month} of ${c.total}`}</span></div>
              <SplitBar label={c.name} split={c.split} month={month} />
            </div>
          ))}
        </Card>
        <Counts title="Most read authors" items={d.top.authors} />
        <Counts title="Top genres" items={d.top.genres} />
        <Counts title="Top tropes" items={d.top.tropes} />
        <Counts title="Main character first names" items={d.top.characters} />
        <Counts title="Main character jobs" items={d.top.jobs} />
        <Counts title="Settings: States" items={d.top.states} />
        <Counts title="Settings: Non-US Countries" items={d.top.countries} />
        <FavoritesCard books={d.favorites} />
        <Extremes d={d} />
        <Card label="Relationship makeup"><MakeupTiles counts={d.makeups} /></Card>
        <SeriesCard d={d} />
        <Card label="Sources" className="s2"><SourcesChart mix={d.sourceMix} /></Card>
        <Card label="Challenge Breakdown" className="s2"><ChallengeBreakdown mix={d.challengeMix} /></Card>
        <Distributions d={d} />
      </div>
    </div>
  );
}

const run = (r: { length: number; start: string; end: string; ongoing: boolean } | null) => (r ? `${r.length} ${r.length === 1 ? 'day' : 'days'} (${r.start} to ${r.end}${r.ongoing ? ', still going' : ''})` : '—');

// The year, over two facing pages: first the year's shape (totals, months, goals, challenges, streaks), then what you read.
function YearPage({ d, part }: { d: YearlyDashboard; part: 1 | 2 }) {
  const maxBooks = Math.max(1, ...d.months.map((m) => m.books));
  if (part === 2) {
    return (
      <div className="pdash">
        <h2 className="dashhead" style={{ borderColor: 'var(--accent)' }}>{d.year} {'·'} WHAT YOU READ</h2>
        <div className="pdgrid">
          <Counts title="Most read authors" items={d.top.authors} />
          <Counts title="Top genres" items={d.top.genres} />
          <Counts title="Top tropes" items={d.top.tropes} />
          <Counts title="Main character first names" items={d.top.characters} />
          <Counts title="Main character jobs" items={d.top.jobs} />
          <Counts title="Settings: States" items={d.top.states} />
          <Counts title="Settings: Non-US Countries" items={d.top.countries} />
          <FavoritesCard books={d.favorites} />
          <Extremes d={d} />
          <Card label="Relationship makeup"><MakeupTiles counts={d.makeups} /></Card>
          <SeriesCard d={d} />
          <Card label="Sources" className="s2"><SourcesChart mix={d.sourceMix} /></Card>
          <Card label="Challenge Breakdown" className="s2"><ChallengeBreakdown mix={d.challengeMix} /></Card>
          <Distributions d={d} />
        </div>
      </div>
    );
  }
  return (
    <div className="pdash">
      <h2 className="dashhead" style={{ borderColor: 'var(--accent)' }}>{d.year} {'·'} YEAR IN NUMBERS</h2>
      <div className="pdgrid">
        <SummaryCard d={d} label="This year" />
        <Card label="Month by month" className="s3">
          <div className="mbars" role="img" aria-label="Books finished each month">
            {d.months.map((m) => (
              <div key={m.month} className="mbar">
                <b className="mbn">{m.books || ''}</b>
                <span className="mbtrack"><span className="mbfill" style={{ height: `${(m.books / maxBooks) * 100}%`, background: monthColor(m.month) }} /></span>
                <span className="mbl">{monthName(m.month).slice(0, 3)}</span>
                <span className="mbp muted">{m.pages ? pretty(m.pages) : ''}</span>
              </div>
            ))}
          </div>
          <span className="muted small">Books finished each month, with pages read underneath.{d.bestMonth ? ` Busiest: ${monthName(d.bestMonth.month)} (${d.bestMonth.books}).` : ''}{d.quietestMonth ? ` Quietest: ${monthName(d.quietestMonth.month)} (${d.quietestMonth.books}).` : ''}</span>
        </Card>
        <Card label="Goals" className="s2">
          {d.goals.length === 0 ? <span className="muted small">No goals this year.</span> : d.goals.map((g) => (
            <div className="dgoal" key={g.id}>
              <div className="goalhead"><span className="goaltitle">{g.label}</span><span className="grow" /><span className="muted small">{g.timed ? `${g.from} to ${g.to}` : 'Whole year'}</span></div>
              <StackBar label={g.label} before={g.before} byMonth={g.byMonth} target={g.target} />
              <div className="goalnums small"><span><b>{pretty(g.total)}</b> of {pretty(g.target)} {g.unit}</span><span className="muted">{g.target > 0 ? `${Math.round((g.total / g.target) * 100)}%` : ''}</span></div>
            </div>
          ))}
          <MonthKey />
        </Card>
        <Card label="Challenges" className="s2">
          {d.challenges.length === 0 ? <span className="muted small">No challenges this year.</span> : d.challenges.map((c) => (
            <div className="dgoal" key={c.id}>
              <div className="goalhead"><span className="goaltitle">{c.name}</span><span className="grow" /><span className="muted small">{`${c.before + c.month} of ${c.total}`}</span></div>
              <StackBar label={c.name} before={c.before} byMonth={c.byMonth} target={c.total} />
            </div>
          ))}
          <MonthKey />
        </Card>
        <Card label="Streaks" className="s4">
          <div className="relline"><span className="muted">Longest reading streak</span><span>{run(d.streaks.longestReading)}</span></div>
          <div className="relline"><span className="muted">Longest run finishing books</span><span>{run(d.streaks.longestFinishing)}</span></div>
          <div className="relline"><span className="muted">Longest break from reading</span><span>{run(d.streaks.longestBreak)}</span></div>
        </Card>
      </div>
    </div>
  );
}

/** The dashboards as they are printed: no covers or stickers, bar graphs in place of dot charts, laid out to fill one landscape page. */
export default function PrintDashboard({ month, part }: { month?: number; part?: 1 | 2 }) {
  const db = useDb();
  const year = useJournalYear();
  const [m, setM] = useState<MonthlyDashboard | null>(null);
  const [y, setY] = useState<YearlyDashboard | null>(null);
  useEffect(() => {
    let live = true;
    if (month) getMonthlyDashboard(db, year, month).then((x) => { if (live) setM(x); }, () => undefined);
    else getYearlyDashboard(db, year, new Date().toLocaleDateString('en-CA')).then((x) => { if (live) setY(x); }, () => undefined);
    return () => { live = false; };
  }, [db, year, month]);
  if (month) return m ? <MonthPage d={m} month={month} year={year} /> : <p className="muted">Loading...</p>;
  return y ? <YearPage d={y} part={part ?? 1} /> : <p className="muted">Loading...</p>;
}

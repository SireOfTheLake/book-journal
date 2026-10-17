import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FORMATS, METRICS, metricInfo, type GoalDisplay, type GoalFilter, type Metric } from '../../domain/goals';
import type { Streaks, Run } from '../../domain/streaks';
import type { Item } from '../../repo/bookLog';
import type { GoalInput, GoalProgress, Overview } from '../../repo/goals';
import { Card, EditNotes, StarRow } from '../bookLog/parts';

export interface OverviewLists { genres: Item[]; tropes: Item[]; challenges?: { id: string; name: string }[] }
export interface OverviewActions {
  saveGoal(input: GoalInput): Promise<boolean> | boolean | void;
  deleteGoal(id: string): void;
  moveGoal(id: string, dir: -1 | 1): void;
  copyGoals(fromYear: number): void;
  setNotes(text: string): void;
}

const pretty = (n: number, metric: Metric) => (metric === 'audio_hours' ? String(Math.round(n * 10) / 10) : Math.round(n).toLocaleString('en-US'));
const nice = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

function filterText(g: GoalProgress, lists: OverviewLists): string {
  return g.filters.map((f) => {
    const name = f.kind === 'genre' ? lists.genres.find((x) => x.id === f.ref)?.name : f.kind === 'trope' ? lists.tropes.find((x) => x.id === f.ref)?.name : FORMATS.find((x) => x.value === f.ref)?.label;
    return `${f.mode === 'exclude' ? 'not ' : ''}${name ?? 'removed item'}`;
  }).join(' · ');
}

// ---------- the form for a goal ----------
function GoalForm({ lists, timed, goal, onSave, onCancel }: { lists: OverviewLists; timed: boolean; goal?: GoalProgress; onSave(input: GoalInput): Promise<boolean> | boolean | void; onCancel(): void }) {
  const [label, setLabel] = useState(goal?.label ?? '');
  const [metric, setMetric] = useState<Metric>(goal?.metric ?? 'books');
  const [target, setTarget] = useState(goal ? String(goal.target) : '');
  const [filters, setFilters] = useState<GoalFilter[]>(goal?.filters ?? []);
  const [start, setStart] = useState(goal?.start_date ?? '');
  const [end, setEnd] = useState(goal?.end_date ?? '');
  const filterable = metricInfo(metric).filterable;
  const isCh = metric === 'challenges';
  const chList = lists.challenges ?? [];
  const [chMode, setChMode] = useState<'all' | 'some'>(goal?.challenge_ids?.length ? 'some' : 'all');
  const [chIds, setChIds] = useState<string[]>(goal?.challenge_ids ?? []);
  const [home, setHome] = useState(goal?.show_on_home ?? false);
  const [display, setDisplay] = useState<GoalDisplay>(goal?.display ?? 'ring');
  const setFilter = (i: number, patch: Partial<GoalFilter>) => setFilters(filters.map((f, k) => (k === i ? { ...f, ...patch } : f)));
  const optionsFor = (kind: GoalFilter['kind']) => (kind === 'genre' ? lists.genres.map((x) => ({ value: x.id, label: x.name })) : kind === 'trope' ? lists.tropes.map((x) => ({ value: x.id, label: x.name })) : FORMATS);
  const submit = async () => {
    const ok = await onSave({ id: goal?.id, label, metric, target: Number(target), start_date: timed ? start || null : null, end_date: timed ? end || null : null, filters, show_on_home: home, display, challenge_ids: isCh && chMode === 'some' ? chIds : null });
    if (ok !== false) onCancel();
  };
  return (
    <div className="goalform bcard">
      <div className="gfrow">
        <label className="stack"><span className="lbl2">Counts</span>
          <select aria-label="What the goal counts" value={metric} onChange={(e) => setMetric(e.target.value as Metric)}>{METRICS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select></label>
        {!isCh && <label className="stack"><span className="lbl2">Target</span>
          <input className="field narrow" type="number" min="0" step="any" aria-label="Goal target" value={target} onChange={(e) => setTarget(e.target.value)} /></label>}
        <label className="stack grow"><span className="lbl2">Name (optional)</span>
          <input className="field" aria-label="Goal name" placeholder="Leave blank to name it for you" value={label} onChange={(e) => setLabel(e.target.value)} /></label>
      </div>
      {isCh && (
        <div className="stack"><span className="lbl2">Which challenges</span>
          <div className="seg" role="group" aria-label="Which challenges">
            <button type="button" aria-pressed={chMode === 'all'} className={chMode === 'all' ? 'on' : ''} onClick={() => setChMode('all')}>All challenges</button>
            <button type="button" aria-pressed={chMode === 'some'} className={chMode === 'some' ? 'on' : ''} onClick={() => setChMode('some')}>Choose challenges</button>
          </div>
          {chMode === 'some' && (
            <div className="chpick">
              {chList.length === 0 && <span className="muted">There are no challenges this year yet.</span>}
              {chList.map((c) => <label key={c.id}><input type="checkbox" checked={chIds.includes(c.id)} onChange={() => setChIds(chIds.includes(c.id) ? chIds.filter((x) => x !== c.id) : [...chIds, c.id])} />{c.name}</label>)}
            </div>
          )}
          <span className="muted small">The goal fills as you complete the prompts of the challenges you pick.</span>
        </div>
      )}
      {timed && (
        <div className="gfrow">
          <label className="stack"><span className="lbl2">From</span><input className="field" type="date" aria-label="Goal start date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
          <label className="stack"><span className="lbl2">To</span><input className="field" type="date" aria-label="Goal end date" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
        </div>
      )}
      {filterable && (
        <div className="stack"><span className="lbl2">Only count books that are</span>
          {filters.map((f, i) => (
            <div className="gfrow" key={i}>
              <select aria-label="Include or leave out" value={f.mode} onChange={(e) => setFilter(i, { mode: e.target.value as GoalFilter['mode'] })}><option value="include">in</option><option value="exclude">not in</option></select>
              <select aria-label="Kind of filter" value={f.kind} onChange={(e) => setFilter(i, { kind: e.target.value as GoalFilter['kind'], ref: '' })}><option value="genre">genre</option><option value="trope">trope</option><option value="format">format</option></select>
              <select aria-label="Filter value" value={f.ref} onChange={(e) => setFilter(i, { ref: e.target.value })}><option value="">Choose...</option>{optionsFor(f.kind).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
              <button type="button" className="quiet" aria-label="Remove this filter" onClick={() => setFilters(filters.filter((_, k) => k !== i))}>remove</button>
            </div>
          ))}
          <button type="button" className="mini addchar" onClick={() => setFilters([...filters, { kind: 'genre', mode: 'include', ref: '' }])}>+ Limit by genre, trope, or format</button>
        </div>
      )}
      <div className="gfrow">
        <label className="chk"><input type="checkbox" aria-label="Show on Home" checked={home} onChange={(e) => setHome(e.target.checked)} /> Show on Home</label>
        {home && (
          <div className="seg" role="group" aria-label="How it shows on Home">
            <button type="button" aria-pressed={display === 'ring'} className={display === 'ring' ? 'on' : ''} onClick={() => setDisplay('ring')}>Circle</button>
            <button type="button" aria-pressed={display === 'bar'} className={display === 'bar' ? 'on' : ''} onClick={() => setDisplay('bar')}>Line</button>
          </div>
        )}
      </div>
      <div className="gfrow">
        <button type="button" className="mini" onClick={submit}>{goal ? 'Save goal' : 'Add goal'}</button>
        <button type="button" className="quiet" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ---------- one goal ----------
function GoalCard({ g, lists, timed, act, first, last }: { g: GoalProgress; lists: OverviewLists; timed: boolean; act: OverviewActions; first: boolean; last: boolean }) {
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  if (editing) return <GoalForm lists={lists} timed={timed} goal={g} onSave={act.saveGoal} onCancel={() => setEditing(false)} />;
  const unit = metricInfo(g.metric).unit;
  const scope = filterText(g, lists);
  return (
    <div className="goalcard" aria-label={g.label}>
      <div className="goalhead">
        <span className="goaltitle">{g.label}</span>
        <span className="grow" />
        <button type="button" className="quiet" aria-label={`Move ${g.label} up`} disabled={first} onClick={() => act.moveGoal(g.id, -1)}>up</button>
        <button type="button" className="quiet" aria-label={`Move ${g.label} down`} disabled={last} onClick={() => act.moveGoal(g.id, 1)}>down</button>
        <button type="button" className="quiet" aria-label={`Edit ${g.label}`} onClick={() => setEditing(true)}>edit</button>
        {confirm
          ? <><button type="button" className="mini" onClick={() => act.deleteGoal(g.id)}>Delete goal</button><button type="button" className="quiet" onClick={() => setConfirm(false)}>Keep</button></>
          : <button type="button" className="quiet" aria-label={`Delete ${g.label}`} onClick={() => setConfirm(true)}>delete</button>}
      </div>
      {(scope || timed) && <div className="muted small">{[timed ? `${nice(g.from)} to ${nice(g.to)}` : '', scope ? `Counting books ${scope}` : ''].filter(Boolean).join(' · ')}</div>}
      <div className="goalbar" role="progressbar" aria-label={`${g.label} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={g.pace.percent}><span style={{ width: `${g.pace.percent}%` }} className={g.pace.state} /></div>
      <div className="goalnums">
        <span><b>{pretty(g.value, g.metric)}</b> of {pretty(g.target, g.metric)} {unit} · {g.pace.percent}%{g.show_on_home ? ' · on Home' : ''}</span>
        <span className={`pace ${g.pace.state}`}>{g.pace.text}</span>
      </div>
    </div>
  );
}

function GoalSection({ title, hint, goals, lists, timed, act }: { title: string; hint: string; goals: GoalProgress[]; lists: OverviewLists; timed: boolean; act: OverviewActions }) {
  const [adding, setAdding] = useState(false);
  return (
    <section className="goalsec">
      <h2 className="lbl2 sect">{title}</h2>
      <p className="muted small">{hint}</p>
      <div className="goallist">
        {goals.map((g, i) => <GoalCard key={g.id} g={g} lists={lists} timed={timed} act={act} first={i === 0} last={i === goals.length - 1} />)}
        {goals.length === 0 && !adding && <span className="muted">{timed ? 'No goals for part of the year yet.' : 'No goals for this year yet.'}</span>}
      </div>
      {adding ? <GoalForm lists={lists} timed={timed} onSave={act.saveGoal} onCancel={() => setAdding(false)} />
        : <button type="button" className="mini addchar" onClick={() => setAdding(true)}>{timed ? '+ Add a goal for part of the year' : '+ Add a yearly goal'}</button>}
    </section>
  );
}

// ---------- streaks ----------
function days(n: number) { return `${n} ${n === 1 ? 'day' : 'days'}`; }
function RunText({ run, plain = false }: { run: Run | null; plain?: boolean }) {
  if (!run) return <span className="muted">None yet</span>;
  return <span><b>{days(run.length)}</b> <span className="muted small">{run.start === run.end ? nice(run.start) : `${nice(run.start)} to ${nice(run.end)}`}{run.ongoing && !plain ? ' · still going' : ''}</span></span>;
}
function StreakCard({ streaks }: { streaks: { year: Streaks; all: Streaks } }) {
  const [scope, setScope] = useState<'year' | 'all'>('year');
  const s = streaks[scope];
  const rows: [string, Run | null][] = [
    ['Reading anything', s.any], ['Finishing a book each day', s.finished], ['Not reading', s.notReading],
    ['Audiobooks', s.audio], ['Ebooks', s.ebook], ['Physical books', s.physical],
  ];
  return (
    <Card label="Streaks" className="streakcard">
      <div className="seg" role="group" aria-label="Streak range">
        <button type="button" className={`mini ${scope === 'year' ? 'activebtn' : ''}`} aria-pressed={scope === 'year'} onClick={() => setScope('year')}>This year</button>
        <button type="button" className={`mini ${scope === 'all' ? 'activebtn' : ''}`} aria-pressed={scope === 'all'} onClick={() => setScope('all')}>All time</button>
      </div>
      <div className="streakrows">
        {rows.map(([label, run]) => <div className="streakrow" key={label}><span className="muted">Longest streak: {label}</span><RunText run={run} /></div>)}
        <div className="streakrow"><span className="muted">Current reading streak</span>{s.current ? <span><b>{days(s.current.length)}</b></span> : <span className="muted">Not reading today</span>}</div>
      </div>
      <p className="muted small">A book with no day log is counted as read evenly over every day from its start to its finish. A book with day log entries counts the days you logged, plus the day you finished it (the rest is assumed to be read that day). A paused book counts only its logged days.</p>
    </Card>
  );
}

// ---------- the page ----------
const SHOWN = 7;
function SeriesList({ title, items, empty }: { title: string; items: { id: string; title: string; date?: string; books?: number }[]; empty: string }) {
  const [all, setAll] = useState(false);
  const visible = all ? items : items.slice(0, SHOWN);
  return (
    <Card label={title}>
      {items.length ? <ul className="tidy">{visible.map((s) => <li key={s.id}><Link className="l" to={`/series/${s.id}`}>{s.title}</Link>{s.date && <span className="muted small"> · {nice(s.date)}</span>}{s.books !== undefined && <span className="muted small"> · {s.books} {s.books === 1 ? 'book' : 'books'}</span>}</li>)}</ul>
        : <span className="muted">{empty}</span>}
      {items.length > SHOWN && <button type="button" className="mini showall" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${items.length}`}</button>}
    </Card>
  );
}

export default function OverviewView({ o, lists, act }: { o: Overview; lists: OverviewLists; act: OverviewActions }) {
  const t = o.totals;
  return (
    <div className="overview">
      <div className="bcard">
        <div className="stats">
          <div className="stat"><span className="lbl2">Books read</span><span className="big">{t.books}</span></div>
          <div className="stat"><span className="lbl2">Pages read</span><span className="big">{t.pages.toLocaleString('en-US')}</span></div>
          <div className="stat"><span className="lbl2">Audiobook hours</span><span className="big">{t.audioHours}</span></div>
          <div className="stat"><span className="lbl2">Average rating</span>{t.avgStars !== null ? <span className="inline"><StarRow value={Math.round(t.avgStars * 4) / 4} size={18} /><span className="muted">{(Math.round(t.avgStars * 100) / 100).toString()}</span></span> : <span className="muted">No ratings yet</span>}</div>
        </div>
        <div className="stats divider">
          <div className="stat"><span className="lbl2">Series started</span><span className="big">{t.seriesStarted}</span></div>
          <div className="stat"><span className="lbl2">Series continued</span><span className="big">{t.seriesContinued}</span></div>
          <div className="stat"><span className="lbl2">Series finished</span><span className="big">{t.seriesFinished}</span></div>
        </div>
      </div>

      {o.canCopyFrom !== null && (
        <div className="bcard">
          <span>No goals for {o.year} yet. </span>
          <button type="button" className="mini" onClick={() => act.copyGoals(o.canCopyFrom!)}>{`Copy ${o.canCopyFrom}'s yearly goals`}</button>
        </div>
      )}
      <GoalSection title={`${o.year} goals`} hint="Counted over the whole year." goals={o.yearly} lists={lists} timed={false} act={act} />
      <GoalSection title="Goals for part of the year" hint="A goal with its own start and end dates, such as a summer challenge." goals={o.timed} lists={lists} timed act={act} />

      <StreakCard streaks={o.streaks} />

      <div className="twocol">
        <SeriesList title="Series started" items={o.started} empty="None started this year." />
        <SeriesList title="Series finished" items={o.finishedSeries} empty="None finished this year." />
      </div>
      <SeriesList title="Series continued" items={o.continued} empty="No series continued this year. A series counts when you read a book in one you had already started, without finishing it." />

      <Card label="Year notes"><EditNotes label="Year notes" addLabel="Add notes for this year" value={o.notes} onCommit={act.setNotes} /></Card>
    </div>
  );
}

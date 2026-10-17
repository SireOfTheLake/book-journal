import { Link } from 'react-router-dom';
import { formatDuration } from '../domain/format';
import type { CurrentRead, HomeBook, HomeData } from '../repo/home';
import GoalGauge from '../ui/GoalGauge';
import { metricInfo } from '../domain/goals';
import { Icon, StarRow } from './bookLog/parts';

export interface HomeActions { start(bookId: string): void; resume(bookId: string, readId: string): void; finish(bookId: string, readId: string): void; log(readId: string): void }

const COVER_COLORS = ['#5a1f3a', '#2f3a5a', '#3a2f5a', '#4a2f3a', '#2d4a3a', '#5a3a1f'];
const hue = (t: string) => COVER_COLORS[[...t].reduce((n, c) => n + c.charCodeAt(0), 0) % COVER_COLORS.length];
const FORMAT = { audio: 'Audio', ebook: 'Ebook', physical: 'Physical' } as const;
const stars = (r: number | null) => (r === null ? null : Math.round(r * 4) / 4);
const seriesText = (b: { series: string | null; position: number | null }) => (b.series ? `${b.series}${b.position !== null ? ` #${b.position}` : ''}` : null);
const day = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

function Cover({ title, authors, src, className = '' }: { title: string; authors: string | null; src: string | null; className?: string }) {
  return (
    <div className={`homecover ${className}`}>
      {src ? <img className="libimg" src={src} alt="" /> : <div className="libgen" style={{ background: hue(title) }} aria-hidden="true"><span className="by">{(authors ?? '').split(', ')[0].toUpperCase()}</span><span className="ttl">{title.toUpperCase()}</span></div>}
    </div>
  );
}

function where(e: NonNullable<CurrentRead['last_entry']>): string {
  const bits = [e.page !== null ? `page ${e.page}` : null, e.percent !== null ? `${e.percent}%` : null, e.seconds !== null ? formatDuration(e.seconds) : null].filter(Boolean);
  return bits.length ? bits.join(' · ') : 'a note';
}

function Reading({ r, act }: { r: CurrentRead; act: HomeActions }) {
  const pct = r.progress === null ? null : Math.round(r.progress * 100);
  return (
    <div className="readcard">
      <Link to={`/book/${r.book_id}/${r.read_id}`} aria-label={`Open ${r.title}`}><Cover title={r.title} authors={r.authors} src={r.cover} /></Link>
      <div className="readinfo">
        <Link className="l big2" to={`/book/${r.book_id}/${r.read_id}`}>{r.title}</Link>
        <span className="muted">{r.authors ?? 'No author'}</span>
        {seriesText(r) && <span className="libseries">{seriesText(r)}</span>}
        <span className="muted small">{r.format && <><Icon name={r.format} /> {FORMAT[r.format]}</>}{r.start_date ? `${r.format ? ' · ' : ''}Started ${day(r.start_date)}${r.day ? `, day ${r.day}` : ''}` : ''}</span>
        {r.status === 'reading' && (
          <>
            {pct !== null ? <div className="progressrow"><progress value={r.progress ?? 0} max={1} aria-label={`${r.title} progress`} /><b>{`${pct}%`}</b></div> : <span className="muted small">{r.last_entry ? 'Progress could not be worked out. Add a page count or audio length.' : 'No progress logged yet.'}</span>}
            {r.last_entry && <span className="muted small">{`Last logged ${day(r.last_entry.date)}: ${where(r.last_entry)}`}</span>}
          </>
        )}
        <div className="pictools">
          {r.status === 'reading' ? (
            <>
              <button type="button" className="btn on" onClick={() => act.log(r.read_id)}>Log progress</button>
              <button type="button" className="btn" onClick={() => act.finish(r.book_id, r.read_id)}>Finished</button>
            </>
          ) : <button type="button" className="btn on" onClick={() => act.resume(r.book_id, r.read_id)}>Resume</button>}
        </div>
      </div>
    </div>
  );
}

function Shelf({ books, render }: { books: HomeBook[]; render: (b: HomeBook) => React.ReactNode }) {
  return <div className="homeshelf">{books.map((b) => <div className="shelfitem" key={b.id}>{render(b)}</div>)}</div>;
}

export default function HomeView({ data, act }: { data: HomeData; act: HomeActions }) {
  const y = data.year;
  const t = data.tidy;
  const b = t.backup;
  const tidyItems = [
    (b.days === null || b.days >= 14) && <li key="b"><Link className="l inlinelink" to="/settings">{b.days === null ? 'You have not made a backup yet' : `Your last backup was ${b.days} days ago`}</Link></li>,
    t.noCover > 0 && <li key="c"><Link className="l" to="/import?tab=covers">{`${t.noCover} ${t.noCover === 1 ? 'book has' : 'books have'} no cover`}</Link></li>,
    t.unassignedCharacters > 0 && <li key="ch"><Link className="l" to="/characters">{`${t.unassignedCharacters} ${t.unassignedCharacters === 1 ? 'character is' : 'characters are'} not in a book yet`}</Link></li>,
    t.locations > 0 && <li key="l"><Link className="l" to="/locations?needs=1">{`${t.locations} ${t.locations === 1 ? 'location needs' : 'locations need'} updating`}</Link></li>,
    t.caughtUp.length > 0 && <li key="s">{'Caught up on '}{t.caughtUp.slice(0, 3).map((s, i, shownList) => <span key={s.id}><Link className="l inlinelink" to={`/series/${s.id}`}>{s.title}</Link>{i < shownList.length - 1 ? ', ' : ''}</span>)}{t.caughtUp.length > 3 ? ` and ${t.caughtUp.length - 3} more` : ''}<span className="muted small"> (waiting on the next book)</span></li>,
  ].filter(Boolean);

  return (
    <div className="home">
      <div className="homemain">
        <section className="bcard">
          <span className="lbl2">{`Currently reading${data.reading.length ? ` (${data.reading.length})` : ''}`}</span>
          {data.reading.length === 0 && <p className="muted">Nothing in progress. Start a book from Up Next below, or add one from the sidebar.</p>}
          {data.reading.map((r) => <Reading key={r.read_id} r={r} act={act} />)}
          {data.paused.length > 0 && <><span className="lbl2">Paused</span>{data.paused.map((r) => <Reading key={r.read_id} r={r} act={act} />)}</>}
        </section>

        <section className="bcard">
          <span className="lbl2">{`Up next${data.upNextCount ? ` (${data.upNextCount})` : ''}`}</span>
          {data.upNext.length === 0 ? <p className="muted">Nothing is queued. Add a book and choose Up Next.</p> : (
            <Shelf books={data.upNext} render={(b) => (
              <>
                <Link className="shelfcover" to={`/book/${b.id}`} aria-label={`Open ${b.title}`}><Cover title={b.title} authors={b.authors} src={b.cover} /></Link>
                <Link className="l shelftitle" to={`/book/${b.id}`}>{b.title}</Link>
                <span className="muted small">{b.authors ?? 'No author'}</span>
                <button type="button" className="mini" aria-label={`Start ${b.title}`} onClick={() => act.start(b.id)}>Start</button>
              </>
            )} />
          )}
          <Link className="l small" to="/shelf">{data.upNextCount > data.upNext.length ? `See all ${data.upNextCount} on TBR & Up Next` : 'Open TBR & Up Next'}</Link>
        </section>

        <section className="bcard">
          <span className="lbl2">Recently finished</span>
          {data.recent.length === 0 ? <p className="muted">Nothing finished yet.</p> : (
            <div className="homeshelf">
              {data.recent.map((b) => (
                <div className="shelfitem" key={b.read_id}>
                  <Link className="shelfcover" to={`/book/${b.id}/${b.read_id}`} aria-label={`Open ${b.title}`}><Cover title={b.title} authors={b.authors} src={b.cover} /></Link>
                  <Link className="l shelftitle" to={`/book/${b.id}/${b.read_id}`}>{b.title}</Link>
                  <span className="muted small">{b.finish_date ? day(b.finish_date) : ''}</span>
                  {stars(b.rating) !== null && <StarRow value={stars(b.rating)} size={13} />}
                </div>
              ))}
            </div>
          )}
          <Link className="l small" to="/journal/book-list">Open the Book List</Link>
        </section>
      </div>

      <aside className="homeside">
        {(data.goals ?? []).length > 0 && (
          <section className="bcard" aria-label="Goals">
            <span className="lbl2">Goals</span>
            <div className="homegoals">
              {data.goals.map((g) => (
                <div key={g.id} className={`homegoal ${g.display === 'bar' ? 'isbar' : ''}`}>
                  {g.display === 'bar' ? null : <GoalGauge percent={g.pace.percent} display="ring" label={g.label} state={g.pace.state} />}
                  <div className="gtext">
                    <span className="gtitle">{g.label}</span>
                    <span className="muted small">{`${Math.round(g.value * 10) / 10} of ${Math.round(g.target * 10) / 10} ${metricInfo(g.metric).unit}`}</span>
                    {g.display === 'bar' && <GoalGauge percent={g.pace.percent} display="bar" label={g.label} state={g.pace.state} />}
                    <span className={`pace ${g.pace.state} small`}>{g.pace.text}</span>
                  </div>
                </div>
              ))}
            </div>
            <Link className="l small" to="/journal/overview">Edit goals</Link>
          </section>
        )}
        <section className="bcard">
          <span className="lbl2">{`${y.year} so far`}</span>
          <div className="statpair"><span className="big">{y.finished}</span><span className="muted">{y.finished === 1 ? 'book finished' : 'books finished'}</span></div>
          <div className="relline"><span className="muted">This month</span><b>{y.thisMonth}</b></div>
          <div className="relline"><span className="muted">Average rating</span>{y.avgStars !== null ? <span className="inline"><StarRow value={stars(y.avgStars)} size={14} /><b>{(Math.round(y.avgStars * 100) / 100).toString()}</b></span> : <span className="muted">—</span>}</div>
          <div className="relline"><span className="muted">Pages read</span><b>{y.pages ? y.pages.toLocaleString() : '—'}</b></div>
          <div className="relline"><span className="muted">Audio listened</span><b>{y.audioSeconds ? formatDuration(y.audioSeconds) : '—'}</b></div>
          <Link className="l small" to="/journal/calendar">Open the Calendar</Link>
        </section>

        <section className="bcard">
          <span className="lbl2">Coming soon</span>
          {data.upcoming.length === 0 ? <p className="muted small">No announced books. Add release dates on a series page.</p> : data.upcoming.map((u, i) => (
            <div className="relline" key={i}><Link className="l grow" to={`/book/${u.book_id}`}>{u.title}</Link><span className="muted small">{`${FORMAT[u.format as keyof typeof FORMAT] ?? u.format} · ${u.release_date ?? 'TBA'}`}</span></div>
          ))}
          <Link className="l small" to="/releases">{data.upcoming.length ? 'See all upcoming releases' : 'Open Upcoming releases'}</Link>
        </section>

        <section className="bcard">
          <span className="lbl2">To tidy</span>
          {tidyItems.length === 0 ? <p className="muted small">Nothing needs attention.</p> : <ul className="tidy">{tidyItems}</ul>}
        </section>
      </aside>
    </div>
  );
}

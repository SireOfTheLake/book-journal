import { Link } from 'react-router-dom';
import { chipStyle } from '../../domain/colors';
import type { AuthorDetail, Counted } from '../../repo/people';
import { Card, EditText, Icon, StarRow } from '../bookLog/parts';
import PersonSide, { type PersonActions } from './PersonSide';

const FORMAT_NAME: Record<string, string> = { audio: 'Audio', ebook: 'Ebook', physical: 'Physical' };
const Stat = ({ label, children }: { label: string; children: React.ReactNode }) => <div className="bcard"><span className="lbl2">{label}</span>{children}</div>;
const Tags = ({ items, empty }: { items: Counted[]; empty: string }) => items.length ? <div className="chips">{items.map((t) => <span key={t.id} className="chip" style={chipStyle(t.color)}>{t.name} <span className="muted small">{t.n}</span></span>)}</div> : <span className="muted">{empty}</span>;

export default function AuthorView({ d, act }: { d: AuthorDetail; act: PersonActions }) {
  const c = d.core;
  return (
    <div className="charpage">
      <div className="sphead">
        <EditText label="Author name" className="seriestitle" value={c.name} onCommit={(v) => v.trim() && act.update({ name: v.trim() })} />
        <span className="grow" />
        <button type="button" className="btn" aria-pressed={c.is_favorite === 1} onClick={() => act.update({ is_favorite: c.is_favorite ? 0 : 1 })}>{c.is_favorite ? 'Favorite' : 'Mark as favorite'}</button>
      </div>
      <div className="bl-cols">
        <PersonSide photo={c.photo} name={c.name} aliases={d.aliases} aliasLabel="Pen names" links={c.links} notes={c.notes} act={act} />
        <div className="stackcol wide">
          <div className="statrow">
            <Stat label="Books read"><span className="big">{`${d.booksRead} of ${d.books.length}`}</span></Stat>
            <Stat label="Series">{d.series.length ? d.series.map((s) => <Link key={s.id} className="l" to={`/series/${s.id}`}>{s.name}</Link>) : <span className="muted">None</span>}</Stat>
            <Stat label="Average rating">{d.avgStars !== null ? <span className="inline"><StarRow value={Math.round(d.avgStars * 4) / 4} /><span className="muted">{(Math.round(d.avgStars * 100) / 100).toString()} · {d.ratedBooks} rated</span></span> : <span className="muted">No ratings yet</span>}</Stat>
            <Stat label="Total pages">{d.totalPages ? <span className="big">{d.totalPages.toLocaleString()}</span> : <span className="muted">Add page counts</span>}</Stat>
            <Stat label="Co-authors">{d.coAuthors.length ? d.coAuthors.map((a) => <span key={a.id}><Link className="l inl" to={`/authors/${a.id}`}>{a.name}</Link><span className="muted small">{a.n} {a.n === 1 ? 'book' : 'books'}</span></span>) : <span className="muted">None</span>}</Stat>
          </div>
          <Card label="Books">
            <div className="brow bhead"><span>Title</span><span>Series</span><span>Finished</span><span>Format</span><span>Rating</span></div>
            {d.books.map((b) => (
              <div className="brow" key={b.id}>
                <Link className="l ttl" to={`/book/${b.id}${b.read_id ? `/${b.read_id}` : ''}`}>{b.title}</Link>
                <span>{b.series_id ? <Link className="l inl" to={`/series/${b.series_id}`}>{b.series}</Link> : <span className="muted">—</span>}{b.position !== null && <span className="muted small"> #{b.position}</span>}</span>
                <span className="muted">{b.finish_date ?? (b.shelf === 'up_next' ? 'Up next' : b.shelf === 'tbr' ? 'TBR' : '—')}</span>
                <span className="fmt">{b.format ? <><Icon name={b.format} />{FORMAT_NAME[b.format]}</> : <span className="muted">—</span>}</span>
                <span>{b.rating !== null ? <StarRow value={Math.round(b.rating * 4) / 4} size={14} /> : <span className="muted">—</span>}</span>
              </div>
            ))}
            {d.books.length === 0 && <span className="muted">No books yet.</span>}
          </Card>
          <div className="twocol">
            <Card label="Average rating by format">
              {d.byFormat.length ? d.byFormat.map((f) => <div className="relline" key={f.format}><span className="fmt grow"><Icon name={f.format as 'audio' | 'ebook' | 'physical'} />{FORMAT_NAME[f.format]}</span><StarRow value={Math.round(f.stars * 4) / 4} size={14} /><span className="muted small">{(Math.round(f.stars * 100) / 100).toString()} · {f.n}</span></div>) : <span className="muted">Appears as you rate books in different formats.</span>}
            </Card>
            <Card label="Common genres and tropes"><Tags items={[...d.genres, ...d.tropes]} empty="Appear once the books have genres and tropes." /></Card>
            <Card label="Unread books">
              {d.unread.length ? d.unread.map((b) => <div className="relline" key={b.id}><Link className="l grow" to={`/book/${b.id}`}>{b.title}</Link><span className="muted small">{b.shelf === 'up_next' ? 'Up next' : b.shelf === 'tbr' ? 'TBR' : 'Not started'}</span></div>) : <span className="muted">You have read every book of theirs that you have added.</span>}
            </Card>
            <Card label="Upcoming releases">
              {d.upcoming.length ? d.upcoming.map((u, i) => <div className="relline" key={i}><Link className="l grow" to={`/book/${u.book_id}`}>{u.title}</Link><span className="muted small">{FORMAT_NAME[u.format] ?? u.format} · {u.release_date ?? 'TBA'}</span></div>) : <span className="muted">No announced books. Add release dates on a series page.</span>}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

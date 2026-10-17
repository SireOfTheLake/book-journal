import { useState } from 'react';
import { MAP_HEIGHT, MAP_WIDTH, STATE_SHAPES } from '../../domain/usStates';
import type { Candidate, Challenge, Slot } from '../../repo/challenges';
import StateShape from '../../ui/StateShape';
import { FitText, SaveText, Swatches } from './GridView';
import ReadPicker from './ReadPicker';
import Blurb from './Blurb';
import TrackerBar from './TrackerBar';

export interface MapActions {
  describe?(text: string): void;
  fill(slotId: string, readId: string): void;
  clear(slotId: string): void;
  search(query: string): Promise<Candidate[]>;
  reroll(slotId: string): void;
  rename(name: string): void;
  color(hex: string): void;
  remove(): void;
}

const COVER_COLORS = ['#5a1f3a', '#2f3a5a', '#3a2f5a', '#4a2f3a', '#2d4a3a', '#5a3a1f'];
const hue = (t: string) => COVER_COLORS[[...t].reduce((n, c) => n + c.charCodeAt(0), 0) % COVER_COLORS.length];

// The challenge page of a US map: the map on top (a state fills in with its own random color once it has a book) and a card for every state underneath.
export default function MapView({ challenge: c, covers = {}, act }: { challenge: Challenge; covers?: Record<string, string>; act: MapActions }) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [picking, setPicking] = useState<Slot | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [onlyEmpty, setOnlyEmpty] = useState(false);
  const slots = c.loose;
  const byName = new Map(slots.map((s) => [s.label, s]));
  const filled = slots.filter((s) => s.fill).length;
  const shown = onlyEmpty ? slots.filter((s) => !s.fill) : slots;
  const hovered = hover ? byName.get(hover) ?? null : null;
  return (
    <div className="gridpage usmapage" style={{ ['--cc' as string]: c.color }}>
      <div className="gtop">
        <div className="gtitle">
          {editing ? <SaveText value={c.name} label="Challenge name" onSave={act.rename} className="field big" /> : <h2 className="pagetitle small2">{c.name}</h2>}
          <span className="muted small">{`US map · Journal ${c.year} · ${filled} of ${slots.length} states`}</span>
        </div>
        <TrackerBar t={c} color={c.color} />
        <button type="button" className={`btn${editing ? ' on' : ''}`} aria-pressed={editing} onClick={() => setEditing((e) => !e)}>{editing ? 'Done editing' : 'Edit'}</button>
      </div>
      <Blurb text={c.description} editing={editing} onSave={act.describe} />
      {editing && (
        <div className="bcard gedit">
          <span className="lbl2">Challenge color</span><Swatches value={c.color} label="Challenge color" onPick={act.color} />
          {deleting
            ? <span className="movebtns"><button type="button" className="mini danger" onClick={act.remove}>Delete the whole challenge</button><button type="button" className="mini" onClick={() => setDeleting(false)}>Keep</button></span>
            : <button type="button" className="mini" onClick={() => setDeleting(true)}>Delete challenge</button>}
          <span className="muted small">Each state gets a random color when you put a book on it. Use "New color" on a state to roll another. Deleting a challenge never deletes your books or reads.</span>
        </div>
      )}
      <section className="bcard usmapcard" aria-label="Map of the United States">
        <svg className="usmap" viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT + 20}`} role="group" aria-label="States">
          {STATE_SHAPES.map((st) => {
            const slot = byName.get(st.name);
            const f = slot?.fill;
            const fillColor = f && f.status === 'finished' ? slot?.color ?? c.color : null; // a state fills in once the book is read
            return (
              <path key={st.name} d={st.d} className={`ust${f ? ' filled' : ''}${hover === st.name ? ' hot' : ''}`} style={fillColor ? { fill: fillColor } : undefined}
                role="button" tabIndex={0} aria-label={f ? `${st.name}: ${f.title}` : `${st.name}: add a book`}
                onMouseEnter={() => setHover(st.name)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(st.name)} onBlur={() => setHover(null)}
                onClick={() => slot && setPicking(slot)} onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && slot) { e.preventDefault(); setPicking(slot); } }} />
            );
          })}
        </svg>
        <div className="usmapcap" aria-live="polite">
          {hovered ? <><strong>{hovered.label}</strong>{hovered.fill ? <span className="muted"> · {hovered.fill.title}{hovered.fill.authors ? ` by ${hovered.fill.authors}` : ''}</span> : <span className="muted"> · no book yet, click to add one</span>}</>
            : <span className="muted">{filled === 0 ? 'Click a state to add a book. It fills in with its own color.' : `${filled} of ${slots.length} states filled in. Point at one to see its book.`}</span>}
        </div>
      </section>
      <div className="usmaptools">
        <h3 className="lbl2">States</h3>
        <label className="check"><input type="checkbox" checked={onlyEmpty} onChange={(e) => setOnlyEmpty(e.target.checked)} /> Only states without a book</label>
      </div>
      <ul className="stcards">
        {shown.map((s) => {
          const f = s.fill;
          const cover = f ? covers[f.book_id] : undefined;
          return (
            <li key={s.id} className="gslot stcard">
              <StateShape name={s.label} color={f && f.status === 'finished' ? s.color ?? c.color : null} size={64} />
              <button type="button" className={`gframe${f ? ' filled' : ''}${f && f.status !== 'finished' ? ' planned' : ''}`} aria-label={f ? `Change the book for ${s.label}` : `Add a book for ${s.label}`} onClick={() => setPicking(s)}>
                {f ? (cover ? <img className="libimg" src={cover} alt="" /> : <div className="libgen" style={{ background: hue(f.title) }}><span className="ttl">{f.title.toUpperCase()}</span></div>) : <span className="plus" aria-hidden="true">+</span>}
              </button>
              {f && f.status !== 'finished' && <span className="plannedtag" title="It fills in once the book is read">planned</span>}
              <span className="glabel" title={s.label}>{s.label}</span>
              <span className="gbook">
                {f ? <><FitText className="l" to={`/book/${f.book_id}/${f.read_id}`} title={f.title} />
                  <button type="button" className="xbtn" aria-label={`Take ${f.title} off ${s.label}`} title="Take this book off" onClick={() => act.clear(s.id)}>&times;</button></> : null}
              </span>
              {editing && f && <button type="button" className="mini" aria-label={`New color for ${s.label}`} onClick={() => act.reroll(s.id)}>New color</button>}
            </li>
          );
        })}
      </ul>
      {onlyEmpty && shown.length === 0 && <p className="muted">Every state has a book. Nice.</p>}
      {picking && <ReadPicker prompt={picking.label} search={act.search} onClose={() => setPicking(null)} onPick={(readId) => { act.fill(picking.id, readId); setPicking(null); }} />}
    </div>
  );
}

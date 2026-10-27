import { useState } from 'react';
import { canSplitUk, hasBonusPlaces, mapDef, mapPlaces, placeLabel, type BonusMode } from '../../domain/maps';
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
  place(slotId: string, place: string | null): void;
  fillPlace(place: string, readId: string): void;
  bonus(mode: BonusMode): void;
  australia(on: boolean): void;
  ukSplit(on: boolean): void;
  extras(on: boolean): void;
  limit(n: number | null): void;
  rename(name: string): void;
  color(hex: string): void;
  remove(): void;
}

const COVER_COLORS = ['#5a1f3a', '#2f3a5a', '#3a2f5a', '#4a2f3a', '#2d4a3a', '#5a3a1f'];
const hue = (t: string) => COVER_COLORS[[...t].reduce((n, c) => n + c.charCodeAt(0), 0) % COVER_COLORS.length];

// The challenge page of a map: the map on top (a place fills in with its own random color once its book is read) and a card for every place underneath.
// A limited map ("complete after N") has N boxes instead: put a book in a box, then choose its place. A box without a place does not count and shows a warning.
export default function MapView({ challenge: c, covers = {}, act }: { challenge: Challenge; covers?: Record<string, string>; act: MapActions }) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [picking, setPicking] = useState<Slot | null>(null);
  const [pickingPlace, setPickingPlace] = useState<string | null>(null); // a place chosen on the map of a limited challenge that has no box yet
  const [hover, setHover] = useState<string | null>(null);
  const [onlyEmpty, setOnlyEmpty] = useState(false);
  const [limitText, setLimitText] = useState(String(c.mapLimit ?? mapDef(c.mapRegion).defaultLimit));
  const region = mapDef(c.mapRegion);
  const limited = c.mapLimit !== null;
  const slots = c.loose;
  const byName = new Map(slots.filter((s) => s.label).map((s) => [s.label, s]));
  const filled = slots.filter((s) => s.fill && (!limited || s.label)).length;
  const shown = onlyEmpty ? slots.filter((s) => !s.fill) : slots;
  const hovered = hover ? byName.get(hover) ?? null : null;
  const choose = (label: string) => { const slot = byName.get(label); if (slot) setPicking(slot); else if (limited) setPickingPlace(label); };
  const taken = new Set(slots.map((s) => s.label).filter(Boolean));
  const options = mapPlaces(region.id, c.bonusMode, c.australia, c.ukSplit);
  const unplaced = limited ? slots.filter((s) => s.fill && !s.label).length : 0;
  const what = limited ? `${filled} of ${slots.length} boxes` : `${filled} of ${slots.length} ${region.plural}`;
  return (
    <div className="gridpage usmapage" style={{ ['--cc' as string]: c.color }}>
      <div className="gtop">
        <div className="gtitle">
          {editing ? <SaveText value={c.name} label="Challenge name" onSave={act.rename} className="field big" /> : <h2 className="pagetitle small2">{c.name}</h2>}
          <span className="muted small">{`${region.title} · Journal ${c.year} · ${what}`}</span>
        </div>
        <TrackerBar t={c} color={c.color} bonus={c.bonus} />
        <button type="button" className={`btn${editing ? ' on' : ''}`} aria-pressed={editing} onClick={() => setEditing((e) => !e)}>{editing ? 'Done editing' : 'Edit'}</button>
      </div>
      <Blurb text={c.description} editing={editing} onSave={act.describe} />
      {unplaced > 0 && <div className="bcard warn" role="status">&#9888; {unplaced} {unplaced === 1 ? 'box has a book but no' : 'boxes have a book but no'} {region.noun}. Choose a {region.noun} for {unplaced === 1 ? 'it' : 'them'}, or it will not count.</div>}
      {editing && (
        <div className="bcard gedit">
          <span className="lbl2">Challenge color</span><Swatches value={c.color} label="Challenge color" onPick={act.color} />
          {hasBonusPlaces(region.id) && <label className="stack"><span className="lbl2">Bonus prompts ({region.bonusNote})</span>
            <select className="field" aria-label="Bonus prompts" value={c.bonusMode} onChange={(e) => act.bonus(e.target.value as BonusMode)}>
              <option value="optional">Optional (extra points, not part of the goal)</option>
              <option value="required">Required (part of the goal)</option>
              <option value="off">Not included</option>
            </select></label>}
          {region.id === 'continents' && <label className="check"><input type="checkbox" role="switch" className="toggle" checked={c.australia} onChange={(e) => act.australia(e.target.checked)} /> Call Oceania "Australia"</label>}
          {canSplitUk(region.id) && <label className="check"><input type="checkbox" role="switch" className="toggle" checked={c.ukSplit} onChange={(e) => act.ukSplit(e.target.checked)} /> Separate the United Kingdom into England, Northern Ireland, Scotland and Wales</label>}
          <span className="movebtns">
            <label className="check"><input type="checkbox" role="switch" className="toggle" checked={limited} onChange={(e) => act.limit(e.target.checked ? Math.max(1, Number(limitText) || region.defaultLimit) : null)} /> Limited: complete after</label>
            {limited && <><input className="field small" type="number" min={1} max={options.length} aria-label="Complete after" value={limitText} onChange={(e) => setLimitText(e.target.value)} />
              <button type="button" className="mini" onClick={() => act.limit(Number(limitText))}>Set</button></>}
          </span>
          {limited && <label className="check"><input type="checkbox" role="switch" className="toggle" checked={c.extras} onChange={(e) => act.extras(e.target.checked)} /> Allow more than {c.mapLimit}: each extra {region.noun} counts as a bonus</label>}
          {deleting
            ? <span className="movebtns"><button type="button" className="mini danger" onClick={act.remove}>Delete the whole challenge</button><button type="button" className="mini" onClick={() => setDeleting(false)}>Keep</button></span>
            : <button type="button" className="mini" onClick={() => setDeleting(true)}>Delete challenge</button>}
          <span className="muted small">Each {region.noun} gets a random color when you put a book on it. Use "New color" to roll another. Deleting a challenge never deletes your books or reads.</span>
        </div>
      )}
      <section className="bcard usmapcard" aria-label={`Map: ${region.title}`}>
        <svg className="usmap" viewBox={`0 0 ${region.geo.width} ${region.geo.height + 20}`} role="group" aria-label={region.plural.charAt(0).toUpperCase() + region.plural.slice(1)}>
          {region.geo.shapes.map((st) => {
            const label = placeLabel(region.id, st.name, c.australia);
            const slot = byName.get(label);
            if (!limited && !slot) return null; // a place that is left out is not drawn
            if (limited && !slot && !options.some((o) => o.name === label)) return null;
            const open = slot || limited;
            const f = slot?.fill;
            const fillColor = f && f.status === 'finished' ? slot?.color ?? c.color : null;
            const props = {
              className: `ust${f ? ' filled' : ''}${st.marker ? ' tiny' : ''}${hover === label ? ' hot' : ''}`, style: fillColor ? { fill: fillColor } : undefined,
              role: 'button', tabIndex: 0, 'aria-label': f ? `${label}: ${f.title}` : `${label}${open ? ': add a book' : ''}`,
              onMouseEnter: () => setHover(label), onMouseLeave: () => setHover(null), onFocus: () => setHover(label), onBlur: () => setHover(null),
              onClick: () => choose(label), onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(label); } },
            };
            return (
              <g key={st.name}>
                {st.d && <path d={st.d} {...props} />}
                {st.marker && <circle cx={st.cx} cy={st.cy} r={5} {...props} />}
                {st.marker && !st.d && st.label && <text className="ustlabel" x={st.cx} y={st.cy + 14} textAnchor="middle">{st.label}</text>}
              </g>
            );
          })}
        </svg>
        <div className="usmapcap" aria-live="polite">
          {hover && !hovered ? <><strong>{hover}</strong><span className="muted"> · no book yet, click to add one</span></>
            : hovered ? <><strong>{hovered.label}</strong>{hovered.fill ? <span className="muted"> · {hovered.fill.title}{hovered.fill.authors ? ` by ${hovered.fill.authors}` : ''}</span> : <span className="muted"> · no book yet, click to add one</span>}</>
            : <span className="muted">{filled === 0 ? (limited ? `Click a ${region.noun} on the map to add a book, or add a book to a box and choose its ${region.noun}.` : `Click a ${region.noun} to add a book. It fills in with its own color.`) : `${what} filled in. Point at one to see its book.`}</span>}
        </div>
      </section>
      <div className="usmaptools">
        <h3 className="lbl2">{limited ? 'Boxes' : region.plural.charAt(0).toUpperCase() + region.plural.slice(1)}</h3>
        <label className="check"><input type="checkbox" role="switch" className="toggle" checked={onlyEmpty} onChange={(e) => setOnlyEmpty(e.target.checked)} /> Only {limited ? 'boxes' : region.plural} without a book</label>
      </div>
      <ul className="stcards">
        {shown.map((s) => {
          const f = s.fill;
          const cover = f ? covers[f.book_id] : undefined;
          const name = s.label || (s.is_bonus ? 'Bonus book' : `Book ${slots.indexOf(s) + 1}`);
          const noPlace = limited && !s.label;
          return (
            <li key={s.id} className="gslot stcard">
              {s.label ? <StateShape region={region.id} name={s.label} color={f && f.status === 'finished' && (!limited || s.label) ? s.color ?? c.color : null} size={64} /> : <span className="stateshape" style={{ width: 64, height: 64 }} />}
              <button type="button" className={`gframe${f ? ' filled' : ''}${f && f.status !== 'finished' ? ' planned' : ''}`} aria-label={f ? `Change the book for ${name}` : `Add a book for ${name}`} onClick={() => setPicking(s)}>
                {f ? (cover ? <img className="libimg" src={cover} alt="" /> : <div className="libgen" style={{ background: hue(f.title) }}><span className="ttl">{f.title.toUpperCase()}</span></div>) : <span className="plus" aria-hidden="true">+</span>}
              </button>
              {f && f.status !== 'finished' && <span className="plannedtag" title="It fills in once the book is read">planned</span>}
              {limited
                ? <><select className="field placepick" aria-label={`${region.noun} for ${name}`} value={s.label} onChange={(e) => act.place(s.id, e.target.value || null)}>
                    <option value="">Choose a {region.noun}...</option>
                    {options.filter((o) => o.name === s.label || !taken.has(o.name)).map((o) => <option key={o.name} value={o.name}>{o.name}{o.bonus ? ' (bonus)' : ''}</option>)}
                  </select>{s.is_bonus && <span className="bonuschip">Bonus</span>}</>
                :  <span className="glabel" title={s.label}>{s.label}{s.is_bonus && <span className="bonustag" title="Bonus prompt"> +</span>}</span>}
              {noPlace && f && <span className="noplace" role="img" aria-label={`Choose a ${region.noun} for this book`} title={`Choose a ${region.noun} or this book does not count`}>&#9888; no {region.noun} chosen</span>}
              <span className="gbook">
                {f ? <><FitText className="l" to={`/book/${f.book_id}/${f.read_id}`} title={f.title} />
                  <button type="button" className="xbtn" aria-label={`Take ${f.title} off ${name}`} title="Take this book off" onClick={() => act.clear(s.id)}>&times;</button></> : null}
              </span>
              {editing && f && s.label && <button type="button" className="mini" aria-label={`New color for ${s.label}`} onClick={() => act.reroll(s.id)}>New color</button>}
            </li>
          );
        })}
      </ul>
      {onlyEmpty && shown.length === 0 && <p className="muted">Every {limited ? 'box' : region.noun} has a book. Nice.</p>}
      {pickingPlace && <ReadPicker prompt={pickingPlace} search={act.search} onClose={() => setPickingPlace(null)} onPick={(readId) => { act.fillPlace(pickingPlace, readId); setPickingPlace(null); }} />}
      {picking && <ReadPicker prompt={picking.label || `Book ${slots.indexOf(picking) + 1}`} search={act.search} onClose={() => setPicking(null)} onPick={(readId) => { act.fill(picking.id, readId); setPicking(null); }} />}
    </div>
  );
}

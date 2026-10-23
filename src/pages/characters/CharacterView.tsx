import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ageText } from '../../domain/format';
import { chipStyle } from '../../domain/colors';
import type { Item } from '../../repo/bookLog';
import type { CharacterDetail, CharacterImage, RelStatus, Relationship, RelatedPerson } from '../../repo/characters';
import type { PlaceInput } from '../../repo/places';
import { PlacePicker } from '../bookLog/LocationEditor';
import { Card, Combo, EditNotes, EditSelect, EditText, LinkImageForm, Seg, TagEditor, ZoomImage } from '../bookLog/parts';

export interface CharacterLists { sexualities: Item[]; occupations: Item[]; places: Item[]; nameTypes: Item[]; tags: Item[]; characters: (Item & { tags?: string | null })[]; books: (Item & { authors: string | null })[] }
export type RelKind = 'partner_current' | 'partner_previous' | 'family' | 'friend' | 'other';
export interface CharacterActions {
  voiceAdd(readNarratorId: string): void; voiceRemove(readNarratorId: string): void;
  update(f: Record<string, string | number | null>): void;
  createSexuality(name: string): void;
  addOccupation(name: string): void; removeOccupation(id: string): void; renameOccupation(id: string, name: string): void;
  addTag(name: string): void; removeTag(id: string): void; renameTag(id: string, name: string): void;
  addPreviousPlace(placeId: string): void; removePreviousPlace(placeId: string): void;
  saveCurrentPlace(placeId: string | null, input: PlaceInput): Promise<void>; savePreviousPlace(placeId: string | null, input: PlaceInput): Promise<void>; // a new or changed location, then use it
  addAltName(name: string, type: string): void; removeAltName(id: string): void;
  linkCharacter(otherId: string, kind: RelKind, label: string): void | Promise<void>;
  addPerson(name: string, kind: RelKind, label: string): void | Promise<void>;
  removeRelationship(id: string): void; setRelationshipLabel(id: string, label: string): void;
  removePerson(id: string): void; setPersonLabel(id: string, label: string): void; convertPerson(id: string, targetId: string | null): void;
  addToBook(bookId: string, role: 'main' | 'side'): void; setBookNote(id: string, note: string): void; removeFromBook(id: string): void;
  setRelStatus(relId: string, status: RelStatus | null): void; setPersonStatus(personId: string, status: RelStatus | null): void;
  addImageUrl(url: string, main: boolean): Promise<void>;
  addImage(file: File, main: boolean): void; setMainImage(id: string): void; removeImage(id: string): void; tagImage(imageId: string, characterId: string): void;
}

const STATUS_OPTIONS = [{ value: 'deceased', label: 'Deceased' }, { value: 'estranged', label: 'Estranged' }];
const LIFE_OPTIONS = [{ value: 'alive', label: 'Alive' }, { value: 'dead', label: 'Dead' }, { value: 'undead', label: 'Undead' }];
const GENDERS = [{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'non_binary', label: 'Non-binary' }, { value: 'other', label: 'Other' }] as const;
const kindOf = (type: string, cur: number | null): RelKind => (type === 'partner' ? (cur === 1 ? 'partner_current' : 'partner_previous') : (type as RelKind));
const personKind = (p: RelatedPerson) => kindOf(p.rel_type, p.is_current);

function Picker({ label, onFile, className = 'mini' }: { label: string; onFile(f: File): void; className?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className={className} onClick={() => ref.current?.click()}>{label}</button>
      <input ref={ref} type="file" accept="image/*" hidden aria-label={label} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
    </>
  );
}

function Art({ d, lists, act }: { d: CharacterDetail; lists: CharacterLists; act: CharacterActions }) {
  const main = d.images.find((i) => i.is_main === 1);
  const rest = d.images.filter((i) => i !== main);
  const tagBox = (im: CharacterImage) => (
    <div className="gimg" key={im.id}>
      <div className="gthumb"><ZoomImage src={im.data} alt="Gallery art" /></div>
      <div className="gtools">
        <button type="button" className="mini" onClick={() => act.setMainImage(im.id)}>Make main</button>
        <button type="button" className="mini" onClick={() => act.removeImage(im.id)}>Remove</button>
      </div>
      {im.tagged.length > 0 && <span className="muted small">Also: {im.tagged.map((t) => <Link key={t.id} className="l" to={`/characters/${t.id}`}>{t.name}</Link>)}</span>}
      <select aria-label="Also show this picture on" value="" onChange={(e) => e.target.value && act.tagImage(im.id, e.target.value)}>
        <option value="">Also show on...</option>
        {lists.characters.filter((c) => c.id !== d.core.id && !im.tagged.some((t) => t.id === c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </div>
  );
  return (
    <div className="bl-left">
      <div className="mainart">{main ? <ZoomImage src={main.data} alt={`Art of ${d.core.name}`} /> : <span className="muted">No main art yet</span>}</div>
      <div className="pictools"><Picker label={main ? 'Replace main art' : 'Add main art'} onFile={(f) => act.addImage(f, true)} /><LinkImageForm label="Main art from a link" onUrl={(u) => act.addImageUrl(u, true)} /></div>
      <Card label="Gallery">
        <div className="gallery">{rest.map(tagBox)}</div>
        {rest.length === 0 && <span className="muted">Fan art, official art, couple art.</span>}
        <div className="pictools"><Picker label="+ Add image" onFile={(f) => act.addImage(f, false)} /><LinkImageForm label="Image from a link" onUrl={(u) => act.addImageUrl(u, false)} /></div>
      </Card>
    </div>
  );
}

// A relationship with another character (who has a page).
function RelRow({ r, act, showStatus }: { r: Relationship; act: CharacterActions; showStatus: boolean }) {
  return (
    <div className="relline">
      <Link className="l relname linked" to={`/characters/${r.other_id}`}>{r.other_name}</Link>
      <EditText label="Relationship label" addLabel="Add label" className="rellabel" value={r.label} onCommit={(v) => act.setRelationshipLabel(r.id, v)} />
      {r.other_life && r.other_life !== 'alive' && <span className={`lifebadge ${r.other_life}`}>{r.other_life}</span>}
      {showStatus && <EditSelect label="Relationship status" addLabel="+ status" className={`statuspick ${r.status ?? ''}`} value={r.status} options={STATUS_OPTIONS} onChange={(v) => act.setRelStatus(r.id, v as RelStatus | null)} />}
      <span className="grow" />
      <button type="button" className="mini" aria-label={`Remove ${r.other_name}`} onClick={() => act.removeRelationship(r.id)}>&times;</button>
    </div>
  );
}

// Someone who is only named: no page, no details. Can be linked to a character or turned into one.
function PersonRow({ p, lists, selfId, act, showStatus }: { p: RelatedPerson; lists: CharacterLists; selfId: string; act: CharacterActions; showStatus: boolean }) {
  const [linking, setLinking] = useState(false);
  return (
    <div className="relline">
      <span className="relname plain">{p.name}</span>
      <EditText label="Label" addLabel="Add label" className="rellabel" value={p.label} onCommit={(v) => act.setPersonLabel(p.id, v)} />
      {showStatus && <EditSelect label="Relationship status" addLabel="+ status" className={`statuspick ${p.status ?? ''}`} value={p.status} options={STATUS_OPTIONS} onChange={(v) => act.setPersonStatus(p.id, v as RelStatus | null)} />}
      <span className="grow" />
      {linking ? (
        <Combo label="Link to a character" placeholder="Find a character" options={lists.characters.filter((c) => c.id !== selfId).map((c) => ({ key: c.id, label: c.name, sub: c.tags }))}
          onPick={(id) => { setLinking(false); act.convertPerson(p.id, id); }} />
      ) : (
        <>
          <button type="button" className="mini" onClick={() => setLinking(true)}>Link to a character</button>
          <button type="button" className="mini" onClick={() => act.convertPerson(p.id, null)}>Make a character</button>
        </>
      )}
      <button type="button" className="mini" aria-label={`Remove ${p.name}`} onClick={() => act.removePerson(p.id)}>&times;</button>
    </div>
  );
}

// The quiet "add relationship" under one header: pick a character you have, or type a name for someone with no page.
// The label and status are changed on the row afterwards.
function AddUnder({ kind, title, lists, selfId, act }: { kind: RelKind; title: string; lists: CharacterLists; selfId: string; act: CharacterActions }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => void | Promise<void>) => { setError(null); try { await fn(); setOpen(false); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } };
  if (!open) return <button type="button" className="quiet addrelbtn" aria-label={`Add relationship under ${title}`} onClick={() => setOpen(true)}>+ add relationship</button>;
  return (
    <div className="addrel">
      <Combo autoFocus label={`Add to ${title}`} placeholder="Pick a character, or type a new name" onClose={() => setOpen(false)}
        options={lists.characters.filter((c) => c.id !== selfId).map((c) => ({ key: c.id, label: c.name, sub: c.tags }))}
        onPick={(id) => run(() => act.linkCharacter(id, kind, ''))} onCreate={(name) => run(() => act.addPerson(name, kind, ''))} createLabel={(t) => `+ Add "${t}" as a new character (no page yet)`} />
      {error && <span className="muted" role="alert">{error}</span>}
    </div>
  );
}

export default function CharacterView({ d, lists, act }: { d: CharacterDetail; lists: CharacterLists; act: CharacterActions }) {
  const c = d.core;
  const [altName, setAltName] = useState('');
  const [altType, setAltType] = useState('Nickname');
  const [role, setRole] = useState<'main' | 'side'>('main');
  const rel = d.relationships;
  const kindOfRel = (r: Relationship) => kindOf(r.rel_type, r.is_current);
  const group = (title: string, kind: RelKind) => {
    const links = rel.filter((r) => kindOfRel(r) === kind);
    const people = d.people.filter((p) => personKind(p) === kind);
    return (
      <div className="relgroup" key={kind}><span className="lbl2">{title}</span>
        {links.map((r) => <RelRow key={r.id} r={r} act={act} showStatus={kind !== 'partner_current'} />)}
        {people.map((p) => <PersonRow key={p.id} p={p} lists={lists} selfId={c.id} act={act} showStatus={kind !== 'partner_current'} />)}
        <AddUnder kind={kind} title={title} lists={lists} selfId={c.id} act={act} />
      </div>
    );
  };
  const main = d.books.filter((b) => b.role === 'main');
  const side = d.books.filter((b) => b.role === 'side');
  const bookRow = (b: (typeof d.books)[number], isMain: boolean) => (
    <div className={isMain ? 'mainrow' : 'siderow'} key={b.id}>
      <Link className="l big2" to={`/book/${b.book_id}${b.read_id ? `/${b.read_id}` : ''}`}>{b.title}</Link>
      <span className="muted small">{isMain ? 'Main' : 'Side'}</span>
      <span className="grow"><EditText label="Note for this book" addLabel="Add a note for this book" value={b.notes} onCommit={(v) => act.setBookNote(b.id, v)} /></span>
      <button type="button" className="mini" aria-label={`Remove from ${b.title}`} onClick={() => act.removeFromBook(b.id)}>&times;</button>
    </div>
  );

  return (
    <div className="charpage">
      <div className="sphead">
        <EditText label="Name" className="seriestitle" value={c.name} onCommit={(v) => v.trim() && act.update({ name: v.trim() })} />
        <div className="chips">{d.tags.map((t) => <span key={t.id} className="chip" style={chipStyle(t.color)}>{t.name}</span>)}</div>
      </div>
      <div className="bl-cols">
        <Art d={d} lists={lists} act={act} />
        <div className="charcols">
          <Card label="Identity">
            <span className="muted">Gender</span>
            <Seg label="Gender" value={c.gender} onChange={(v) => act.update({ gender: v })} options={[...GENDERS]} />
            <label className="inline"><input type="checkbox" aria-label="Transgender" checked={c.is_transgender === 1} onChange={(e) => act.update({ is_transgender: e.target.checked ? 1 : 0 })} /><span className="muted">Transgender</span></label>
            <span className="muted">Age {ageText(c.age_min, c.age_max) && <b>{ageText(c.age_min, c.age_max)}{c.age_is_approximate ? ' (approx.)' : ''}</b>}</span>
            <span className="inline">
              <EditText label="Youngest age" addLabel="Add age" type="number" value={c.age_min} onCommit={(v) => act.update({ age_min: v === '' ? null : Number(v), ...(c.age_max === null && v !== '' ? { age_max: Number(v) } : {}) })} />
              <span className="muted">to</span>
              <EditText label="Oldest age" addLabel="same" type="number" value={c.age_max} onCommit={(v) => act.update({ age_max: v === '' ? null : Number(v) })} />
              <label className="inline"><input type="checkbox" aria-label="Approximate age" checked={c.age_is_approximate === 1} onChange={(e) => act.update({ age_is_approximate: e.target.checked ? 1 : 0 })} /><span className="muted small">approx.</span></label>
            </span>
            <span className="muted">Status</span>
            <EditSelect label="Life status" addLabel="Add status" value={c.life_status} options={LIFE_OPTIONS} onChange={(v) => act.update({ life_status: v })} />
            <span className="muted">Sexuality</span>
            <EditSelect label="Sexuality" addLabel="Add sexuality" value={c.sexuality_id} options={lists.sexualities.map((s) => ({ value: s.id, label: s.name }))} onChange={(id) => act.update({ sexuality_id: id })} onCreate={act.createSexuality} />
          </Card>
          <Card label="Work and places">
            <TagEditor label="Occupations" items={d.occupations} options={lists.occupations} onAdd={act.addOccupation} onRemove={act.removeOccupation} onRename={act.renameOccupation} />
            <span className="muted">Organization</span>
            <EditText label="Organization" addLabel="Add organization" value={c.organization} onCommit={(v) => act.update({ organization: v.trim() || null })} />
            <span className="muted">Current place</span>
            <PlacePicker single label="current place" places={d.place ? [d.place] : []} options={lists.places}
              onPick={(pid) => act.update({ current_place_id: pid })} onRemove={() => act.update({ current_place_id: null })} onSave={act.saveCurrentPlace} />
            <span className="muted">Previous places</span>
            <PlacePicker label="previous place" places={d.previousPlaces} options={lists.places}
              onPick={act.addPreviousPlace} onRemove={act.removePreviousPlace} onSave={act.savePreviousPlace} />
          </Card>
          <Card label="Alternative names">
            {d.altNames.map((a) => <div className="relline" key={a.id}><b>{a.name}</b><span className="muted small">{a.type ?? ''}</span><span className="grow" /><button type="button" className="mini" aria-label={`Remove ${a.name}`} onClick={() => act.removeAltName(a.id)}>&times;</button></div>)}
            <div className="addrel">
              <input className="field" placeholder="Name" aria-label="Alternative name" value={altName} onChange={(e) => setAltName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && altName.trim()) { act.addAltName(altName, altType); setAltName(''); } }} />
              <input className="field" list="name-types" aria-label="Name type" value={altType} onChange={(e) => setAltType(e.target.value)} />
              <datalist id="name-types">{lists.nameTypes.map((t) => <option key={t.id} value={t.name} />)}</datalist>
              <button type="button" className="mini" onClick={() => { if (altName.trim()) { act.addAltName(altName, altType); setAltName(''); } }}>Add</button>
            </div>
          </Card>
          <TagEditor label="Tags" items={d.tags} options={lists.tags} onAdd={act.addTag} onRemove={act.removeTag} onRename={act.renameTag} />
          <Card label="Description" className="span2"><EditNotes label="Description" addLabel="Add a physical description" value={c.description} onCommit={(v) => act.update({ description: v.trim() || null })} /></Card>
          <Card label="Relationships" className="span2">
            {group('Current Partner', 'partner_current')}
            {group('Previous Partner', 'partner_previous')}
            {group('Family', 'family')}
            {group('Friends', 'friend')}
            {group('Other', 'other')}
            <span className="muted small">Someone with no page is just a name until you choose "Make a character". Click a label or status to change it.</span>
          </Card>
          <Card label="Books" className="span2">
            {main.length > 0 && <span className="muted">Main character in</span>}
            {main.map((b) => bookRow(b, true))}
            {side.length > 0 && <span className="muted">Side character in</span>}
            {side.map((b) => bookRow(b, false))}
            {d.books.length === 0 && <span className="notice">Not in a book yet{d.tags.length > 0 ? `. The tags above (${d.tags.map((t) => t.name).join(', ')}) may show which one.` : '.'}</span>}
            <div className="addrel">
              <select aria-label="Role in the book" value={role} onChange={(e) => setRole(e.target.value as 'main' | 'side')}><option value="main">Main character</option><option value="side">Side character</option></select>
              <Combo label="Add to a book" placeholder="+ Add to a book: search by title" options={lists.books.map((b) => ({ key: b.id, label: b.name, sub: b.authors }))} onPick={(id) => act.addToBook(id, role)} />
            </div>
            <div className="relline">
              {d.series.length > 0 && <span><span className="muted">Series: </span>{d.series.map((s) => <Link key={s.id} className="l inl" to={`/series/${s.id}`}>{s.name}</Link>)}</span>}
              {d.voicings.length > 0 && <span><span className="muted">Voiced by: </span>{d.voicings.map((v) => (
                <span key={v.rn_id} className="chip tiny voicechip"><Link className="l" to={`/narrators/${v.narrator_id}`}>{v.narrator}</Link><span className="muted small"> in {v.title}</span>
                  <button type="button" className="x" aria-label={`Take ${v.narrator} off ${d.core.name} in ${v.title}`} onClick={() => act.voiceRemove(v.rn_id)}>&times;</button></span>))}</span>}
              {d.voiceOptions.length > 0 && (
                <select className="field small" aria-label="Add a narrator who voiced this character" value="" onChange={(e) => e.target.value && act.voiceAdd(e.target.value)}>
                  <option value="">+ Voiced by...</option>
                  {d.voiceOptions.map((v) => <option key={v.rn_id} value={v.rn_id}>{`${v.narrator} · ${v.title}`}</option>)}
                </select>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

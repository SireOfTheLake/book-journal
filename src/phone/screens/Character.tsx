import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useDb } from '../../db/DbContext';
import * as c from '../../repo/characters';
import { ageText } from '../../domain/format';
import { listItems } from '../../repo/bookLog';
import { savePlace } from '../../repo/places';
import { PlaceSet } from '../places';
import { Card, ChipSet, ConfirmRemove, PickerSheet, Seg, SyncDot, TextField, useLoad } from '../kit';

type Kind = 'partner_current' | 'partner_previous' | 'family' | 'friend' | 'other';
const KINDS: { kind: Kind; title: string }[] = [
  { kind: 'partner_current', title: 'Current Partner' }, { kind: 'partner_previous', title: 'Previous Partner' },
  { kind: 'family', title: 'Family' }, { kind: 'friend', title: 'Friends' }, { kind: 'other', title: 'Other' },
];
const kindOf = (type: string, cur: number | null): Kind => (type === 'partner' ? (cur === 1 ? 'partner_current' : 'partner_previous') : (type as Kind));
const typeOf = (k: Kind) => (k.startsWith('partner') ? 'partner' : k) as 'partner' | 'family' | 'friend' | 'other';
const currentOf = (k: Kind): 0 | 1 | null => (k === 'partner_current' ? 1 : k === 'partner_previous' ? 0 : null);
const STATUSES = [{ value: 'deceased' as const, label: 'Deceased' }, { value: 'estranged' as const, label: 'Estranged' }];

const toItem = (x: { id: string; name: string }) => ({ id: x.id, name: x.name });

// "29" or "29 to 35" or "29-35" -> a range. Empty clears it.
export function parseAge(text: string): { min: number | null; max: number | null } | null {
  const t = text.trim();
  if (!t) return { min: null, max: null };
  const m = /^(\d{1,3})\s*(?:-|–|to)?\s*(\d{1,3})?$/i.exec(t);
  if (!m) return null;
  const a = Number(m[1]); const b = m[2] ? Number(m[2]) : a;
  return { min: Math.min(a, b), max: Math.max(a, b) };
}

export default function Character() {
  const db = useDb();
  const nav = useNavigate();
  const { characterId = '' } = useParams();
  const [error, setError] = useState<string | null>(null);
  const [addingKind, setAddingKind] = useState<Kind | null>(null);
  const loaded = useLoad(async () => {
    const [ch, occ, tags, places, picks] = await Promise.all([c.getCharacter(db, characterId), c.listNamed(db, 'occupation'), c.listNamed(db, 'character_tag'), listItems(db, 'place'), c.listCharacterPicks(db)]);
    return { ch, occ, tags, places, picks };
  }, [db, characterId]);
  const run = async (fn: () => Promise<unknown>) => { try { await fn(); await loaded.reload(); setError(null); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } };
  const d = loaded.data;
  if (loaded.error) return <div className="ph-err" role="alert">{loaded.error}</div>;
  if (!d) return <p className="ph-muted">Loading...</p>;
  if (!d.ch) return <><div className="ph-top"><button type="button" className="ph-back" onClick={() => nav('/people')}>&#8249;</button></div><p className="ph-muted">That character is not here (it may have been removed on another device).</p></>;
  const { core, books, relationships } = d.ch;
  const [adding, setAdding] = [addingKind, setAddingKind];
  const upd = (f: Record<string, string | number | null>) => run(() => c.updateCharacter(db, characterId, f));

  return (
    <>
      <div className="ph-top"><button type="button" className="ph-back" aria-label="Back" onClick={() => nav(-1)}>&#8249;</button><span style={{ flex: 1 }} /><span className="ph-pill"><SyncDot /></span></div>
      {error && <div className="ph-err" role="alert">{error}</div>}
      <TextField hideLabel label="Name" value={core.name} onCommit={(v) => v.trim() && void upd({ name: v.trim() })} />
      <div className="ph-muted ph-small" style={{ marginTop: 6 }}>{books.length ? `In ${books.length} book${books.length === 1 ? '' : 's'}` : 'Not in any book yet'}</div>

      <Card label="Role in each book">
        {books.length === 0 && <p className="ph-muted ph-small">Add this character to a book from the book&rsquo;s page.</p>}
        {books.map((b) => (
          <div key={b.id} style={{ marginBottom: 12 }}>
            <Link to={`/book/${b.book_id}${b.read_id ? `/${b.read_id}` : ''}`} className="ph-small" style={{ display: 'block', marginBottom: 6, fontWeight: 700 }}>{b.title}</Link>
            <Seg label={`Role in ${b.title}`} value={b.role} options={[{ value: 'main', label: 'Main' }, { value: 'side', label: 'Side' }]} onChange={(v) => v && void run(() => c.addCharacterToBook(db, characterId, b.book_id, v))} />
          </div>
        ))}
      </Card>

      <div className="ph-field"><span className="ph-label">Gender</span>
        <Seg label="Gender" allowClear value={core.gender} options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'non_binary', label: 'Non-binary' }, { value: 'other', label: 'Other' }]} onChange={(v) => void upd({ gender: v })} />
      </div>
      <TextField label="Age" inputMode="text" placeholder="29 or 29 to 35" value={ageText(core.age_min, core.age_max) || null} onCommit={(v) => { const a = parseAge(v); if (!a) setError('Use a number like 29, or a range like 29 to 35.'); else void upd({ age_min: a.min, age_max: a.max }); }} />
      <div className="ph-field"><span className="ph-label">Alive or not</span>
        <Seg label="Life status" allowClear value={core.life_status} options={[{ value: 'alive', label: 'Alive' }, { value: 'dead', label: 'Dead' }, { value: 'undead', label: 'Undead' }]} onChange={(v) => void upd({ life_status: v })} />
      </div>

      <ChipSet label="Occupations" color="var(--theme)" items={d.ch.occupations.map(toItem)} options={d.occ.map(toItem)} addLabel="Add"
        onAdd={(o) => void run(() => c.addOccupation(db, characterId, o.name))} onCreate={(n) => void run(() => c.addOccupation(db, characterId, n))} onRemove={(o) => void run(() => c.removeOccupation(db, characterId, o.id))} />
      <ChipSet label="Tags" color="var(--trope)" items={d.ch.tags.map(toItem)} options={d.tags.map(toItem)} addLabel="Add"
        onAdd={(o) => void run(() => c.addCharacterTag(db, characterId, o.name))} onCreate={(n) => void run(() => c.addCharacterTag(db, characterId, n))} onRemove={(o) => void run(() => c.removeCharacterTag(db, characterId, o.id))} />

      <Card label="Places">
        <span className="ph-label">Current place</span>
        <PlaceSet bare single label="Current place" noun="current place" places={d.ch.place ? [d.ch.place] : []} options={d.places}
          onPick={(id) => void upd({ current_place_id: id })} onRemove={() => void upd({ current_place_id: null })}
          onSave={async (id, input) => { try { const saved = await savePlace(db, id, input); if (!id) await c.updateCharacter(db, characterId, { current_place_id: saved }); } finally { await loaded.reload(); } }} />
        <span className="ph-label" style={{ marginTop: 14 }}>Previous places</span>
        <PlaceSet bare label="Previous places" noun="previous place" places={d.ch.previousPlaces} options={d.places}
          onPick={(id) => void run(() => c.addPreviousPlace(db, characterId, id))} onRemove={(id) => void run(() => c.removePreviousPlace(db, characterId, id))}
          onSave={async (id, input) => { try { const saved = await savePlace(db, id, input); if (!id) await c.addPreviousPlace(db, characterId, saved); } finally { await loaded.reload(); } }} />
      </Card>

      <Card label="Relationships">
        {KINDS.map(({ kind, title }) => {
          const links = relationships.filter((r) => kindOf(r.rel_type, r.is_current) === kind);
          const people = d.ch!.people.filter((p) => kindOf(p.rel_type, p.is_current) === kind);
          return (
            <div key={kind} style={{ marginBottom: 14 }} role="group" aria-label={title}>
              <span className="ph-label">{title}</span>
              <ul className="ph-list">
                {links.map((r) => (
                  <li key={r.id} className="ph-item" style={{ display: 'block' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Link to={`/character/${r.other_id}`} className="grow" style={{ display: 'block' }}><span className={`t ${r.other_featured ? 'page' : ''}`} style={{ display: 'inline' }}>{r.other_name}</span></Link>
                      <ConfirmRemove label={`Remove the link to ${r.other_name}`} onConfirm={() => void run(() => c.removeRelationship(db, r.id))} />
                    </div>
                    <TextField label={`Label for ${r.other_name}`} placeholder="mother, ex, best friend..." value={r.label} onCommit={(v) => void run(() => c.setRelationshipLabel(db, r.id, characterId, v.trim() || null))} />
                    {kind !== 'partner_current' && <Seg label={`Status of ${r.other_name}`} allowClear value={r.status} options={STATUSES} onChange={(v) => void run(() => c.setRelationshipStatus(db, r.id, characterId, v))} />}
                  </li>
                ))}
                {people.map((p) => (
                  <li key={p.id} className="ph-item" style={{ display: 'block' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="grow"><b>{p.name}</b> <span className="ph-muted ph-small">no page yet</span></div>
                      <ConfirmRemove label={`Remove ${p.name}`} onConfirm={() => void run(() => c.removePerson(db, p.id))} />
                    </div>
                    <TextField label={`Label for ${p.name}`} placeholder="mother, ex, best friend..." value={p.label} onCommit={(v) => void run(() => c.setPersonLabel(db, p.id, v.trim() || null))} />
                    {kind !== 'partner_current' && <Seg label={`Status of ${p.name}`} allowClear value={p.status} options={STATUSES} onChange={(v) => void run(() => c.setPersonStatus(db, p.id, v))} />}
                  </li>
                ))}
              </ul>
              <button type="button" className="ph-btn" style={{ minHeight: 40, opacity: 0.8 }} aria-label={`Add relationship under ${title}`} onClick={() => setAdding(kind)}>+ add relationship</button>
            </div>
          );
        })}
      </Card>
      {adding && (
        <PickerSheet title={`Add to ${KINDS.find((k) => k.kind === adding)!.title}`} placeholder="Search characters or type a new name"
          options={d.picks.filter((p) => p.id !== characterId).map((p) => ({ id: p.id, name: p.name, note: p.featured ? undefined : 'no page yet' }))}
          taken={relationships.map((r) => r.other_id)}
          onPick={(o) => void run(() => c.addRelationship(db, characterId, { id: o.id }, typeOf(adding), currentOf(adding), null))}
          onCreate={(name) => void run(() => c.addPerson(db, characterId, name, typeOf(adding), currentOf(adding), null))} createLabel="Add a new character (no page yet):"
          onClose={() => setAdding(null)} />
      )}

      <TextField label="Description" multiline value={core.description} onCommit={(v) => void upd({ description: v.trim() || null })} />
      <TextField label="Notes" multiline value={core.notes} onCommit={(v) => void upd({ notes: v.trim() || null })} />
    </>
  );
}

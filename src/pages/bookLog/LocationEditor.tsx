import { useState } from 'react';
import { parseLocationText } from '../../domain/geo';
import type { Item, LogPlace } from '../../repo/bookLog';
import type { PlaceInput } from '../../repo/places';
import LocationDialog from '../locations/LocationDialog';
import { Card, Combo } from './parts';

type DialogState = { id: string | null; initial?: Parameters<typeof LocationDialog>[0]['initial']; typed?: string } | null;

// Locations as chips with a search to add one and a window to make or fix one. With `single`, only one can be held and picking another replaces it.
// Used by the book's Setting card and by a character's current and previous places, so they behave the same way.
export function PlacePicker({ places, options, single, label = 'location', onPick, onRemove, onSave }: {
  places: LogPlace[]; options: Item[]; single?: boolean; label?: string;
  onPick(id: string): void; onRemove(id: string): void; onSave(id: string | null, input: PlaceInput): Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);
  const have = new Set(places.map((p) => p.id));
  const stale = places.filter((p) => p.needsUpdate);
  const full = !!single && places.length > 0;
  return (
    <>
      <div className="chips">
        {places.map((p) => (
          <span key={p.id} className={`chip${p.needsUpdate ? ' locwarn' : ''}`}>
            {p.needsUpdate && <span className="warnmark" role="img" aria-label="Needs updating" title="This location is plain text. Edit it to give it a city, area and country.">&#9888;</span>}
            <button type="button" className="chipname" title="Edit this location" aria-label={`Edit ${p.name}`} onClick={() => setDialog({ id: p.id, initial: { city: p.city ?? (p.area || p.country ? null : p.name), area: p.area, country: p.country, fictional: p.fictional }, typed: p.needsUpdate ? p.name : undefined })}>{p.name}</button>
            {p.fictional && <span className="muted small fictag">fictional</span>}
            <button type="button" className="x" aria-label={`Remove ${p.name}`} onClick={() => onRemove(p.id)}>&times;</button>
          </span>
        ))}
      </div>
      {stale.length > 0 && <span className="muted small" role="note">{stale.length === 1 ? `${stale[0].name} still needs updating.` : `${stale.length} locations still need updating.`} Click it to sort it into a city, area and country, or mark it fictional.</span>}
      {adding ? (
        <Combo autoFocus label={`Search ${label}s`} placeholder="Search your locations" onClose={() => setAdding(false)}
          footer={{ label: '+ New location...', onChoose: () => setDialog({ id: null }) }}
          options={options.filter((o) => !have.has(o.id)).map((o) => ({ key: o.id, label: o.name }))}
          onPick={(id) => { setAdding(false); onPick(id); }}
          onCreate={(text) => { const known = parseLocationText(text); setDialog(known ? { id: null, initial: known } : { id: null, initial: { city: text }, typed: text }); }} createLabel={(t) => `New location "${t}"...`} />
      ) : (
        <button type="button" className="ed add plusbtn" title={full ? `Change the ${label}` : `Add a ${label}`} onClick={() => setAdding(true)}>{full ? 'change' : '+ add'}</button>
      )}
      {dialog && <LocationDialog title={dialog.id ? 'Edit location' : 'New location'} shared={!!dialog.id} initial={dialog.initial} typed={dialog.typed} onClose={() => setDialog(null)} onSave={(input) => onSave(dialog.id, input)} />}
    </>
  );
}

// The Setting card: the locations of a book, each with its warning when it still needs updating, and a way to add or fix one.
export default function LocationEditor({ places, options, onPick, onRemove, onSave }: {
  places: LogPlace[]; options: Item[]; onPick(name: string): void; onRemove(id: string): void; onSave(id: string | null, input: PlaceInput): Promise<void>;
}) {
  return (
    <Card label="Setting">
      <PlacePicker places={places} options={options} onPick={(id) => { const o = options.find((x) => x.id === id); if (o) onPick(o.name); }} onRemove={onRemove} onSave={onSave} />
    </Card>
  );
}

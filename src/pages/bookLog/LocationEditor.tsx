import { useState } from 'react';
import { parseLocationText } from '../../domain/geo';
import type { Item, LogPlace } from '../../repo/bookLog';
import type { PlaceInput } from '../../repo/places';
import LocationDialog from '../locations/LocationDialog';
import { Card, Combo } from './parts';

// The Setting card: the locations of a book, each with its warning when it still needs updating, and a way to add or fix one.
export default function LocationEditor({ places, options, onPick, onRemove, onSave }: {
  places: LogPlace[]; options: Item[]; onPick(name: string): void; onRemove(id: string): void; onSave(id: string | null, input: PlaceInput): Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [dialog, setDialog] = useState<{ id: string | null; initial?: Parameters<typeof LocationDialog>[0]['initial']; typed?: string } | null>(null);
  const have = new Set(places.map((p) => p.id));
  const stale = places.filter((p) => p.needsUpdate);
  return (
    <Card label="Setting">
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
        <Combo autoFocus label="Search locations" placeholder="Search for a location" onClose={() => setAdding(false)}
          options={options.filter((o) => !have.has(o.id)).map((o) => ({ key: o.id, label: o.name }))}
          onPick={(id) => { const o = options.find((x) => x.id === id); if (o) onPick(o.name); }}
          onCreate={(text) => { const known = parseLocationText(text); setDialog(known ? { id: null, initial: known } : { id: null, initial: { city: text }, typed: text }); }} createLabel={(t) => `New location "${t}"...`} />
      ) : (
        <span className="movebtns"><button type="button" className="ed add" onClick={() => setAdding(true)}>Add location</button>
          <button type="button" className="ed add" onClick={() => setDialog({ id: null })}>New location...</button></span>
      )}
      {dialog && <LocationDialog title={dialog.id ? 'Edit location' : 'New location'} shared={!!dialog.id} initial={dialog.initial} typed={dialog.typed} onClose={() => setDialog(null)} onSave={(input) => onSave(dialog.id, input)} />}
    </Card>
  );
}

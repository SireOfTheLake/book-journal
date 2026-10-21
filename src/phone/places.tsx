import { useEffect, useMemo, useState } from 'react';
import { useDb } from '../db/DbContext';
import { AREAS, areaLabel, canonicalCountry, COUNTRIES_ORDERED, parseLocationText } from '../domain/geo';
import type { Item, LogPlace } from '../repo/bookLog';
import { listPlaceParts, type PlaceInput, type PlaceParts } from '../repo/places';
import { Card, PickerSheet, Sheet } from './kit';

// A location: country, area (state, province, county...) and city, the same three parts as on the computer.
function LocationForm({ id, initial, onSave, onClose }: { id: string | null; initial?: Partial<PlaceInput> & { fictional?: boolean }; onSave(input: PlaceInput): Promise<void>; onClose(): void }) {
  const db = useDb();
  const [country, setCountry] = useState(initial?.country ?? '');
  const [area, setArea] = useState(initial?.area ?? '');
  const [city, setCity] = useState(initial?.city ?? '');
  const [fictional, setFictional] = useState(!!initial?.fictional);
  const [parts, setParts] = useState<PlaceParts>({ countries: [], areas: [], cities: [] });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { listPlaceParts(db).then(setParts, () => undefined); }, [db]);
  const c = canonicalCountry(country);
  const countries = useMemo(() => [...COUNTRIES_ORDERED, ...parts.countries.filter((x) => !COUNTRIES_ORDERED.includes(x))], [parts]);
  const areas = useMemo(() => {
    const listed = c && AREAS[c] ? AREAS[c].list.map((x) => x.name) : Object.values(AREAS).flatMap((a) => a.list.map((x) => x.name));
    return [...new Set([...listed, ...parts.areas.map((x) => x.area)])];
  }, [parts, c]);
  const cities = useMemo(() => [...new Set(parts.cities.map((x) => x.city))], [parts]);
  const save = async () => {
    setBusy(true); setError(null);
    try { await onSave({ city, area, country, fictional }); onClose(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); setBusy(false); }
  };
  return (
    <Sheet title={id ? 'Edit location' : 'New location'} onClose={onClose}>
      {id && <p className="ph-note" style={{ marginTop: 0 }}>This location is shared: changing it changes it everywhere it is used.</p>}
      <label className="ph-field" style={{ marginTop: 0 }}><span className="ph-label">Country</span>
        <input className="ph-input" list="ph-countries" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Country" autoCapitalize="words" />
      </label>
      <label className="ph-field" style={{ marginTop: 0 }}><span className="ph-label">{c ? areaLabel(c) : 'Area (state, province, county)'}</span>
        <input className="ph-input" list="ph-areas" value={area} onChange={(e) => setArea(e.target.value)} placeholder="Area" autoCapitalize="words" />
      </label>
      <label className="ph-field" style={{ marginTop: 0 }}><span className="ph-label">City</span>
        <input className="ph-input" list="ph-cities" value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" autoCapitalize="words" />
      </label>
      <datalist id="ph-countries">{countries.map((x) => <option key={x} value={x} />)}</datalist>
      <datalist id="ph-areas">{areas.map((x) => <option key={x} value={x} />)}</datalist>
      <datalist id="ph-cities">{cities.map((x) => <option key={x} value={x} />)}</datalist>
      <button type="button" className={`ph-btn ${fictional ? 'primary' : ''}`} aria-pressed={fictional} onClick={() => setFictional(!fictional)}>{fictional ? 'Fictional place' : 'Mark as a fictional place'}</button>
      {error && <div className="ph-err" role="alert">{error}</div>}
      <button type="button" className="ph-btn primary" style={{ minHeight: 52 }} disabled={busy} onClick={() => void save()}>Save location</button>
    </Sheet>
  );
}

/** Locations as chips, with a search of the ones you have and a form to make a new one. With `single`, picking another replaces the one held. */
export function PlaceSet({ label, noun = 'location', places, options, single, onPick, onRemove, onSave, bare }: {
  label: string; noun?: string; places: LogPlace[]; options: Item[]; single?: boolean; bare?: boolean;
  onPick(id: string): void; onRemove(id: string): void; onSave(id: string | null, input: PlaceInput): Promise<void>;
}) {
  const [picking, setPicking] = useState(false);
  const [form, setForm] = useState<{ id: string | null; initial?: Partial<PlaceInput> & { fictional?: boolean } } | null>(null);
  const full = !!single && places.length > 0;
  const body = (
    <>
      <div className="ph-chips">
        {places.map((p) => (
          <span key={p.id} className={`ph-chip place${p.needsUpdate ? ' warn' : ''}`}>
            {p.needsUpdate && <span role="img" aria-label="Needs updating" title="This location is plain text. Edit it to give it a city, area and country.">&#9888;</span>}
            <button type="button" className="name" aria-label={`Edit ${p.name}`} onClick={() => setForm({ id: p.id, initial: { city: p.city ?? (p.area || p.country ? null : p.name), area: p.area, country: p.country, fictional: p.fictional } })}>{p.name}{p.fictional ? ' (fictional)' : ''}</button>
            <button type="button" className="x" aria-label={`Remove ${p.name}`} onClick={() => onRemove(p.id)}>&times;</button>
          </span>
        ))}
        <button type="button" className="ph-chip add" onClick={() => setPicking(true)}>{full ? `Change ${noun}` : `+ Add ${noun}`}</button>
      </div>
      {places.some((p) => p.needsUpdate) && <p className="ph-note">Tap a location with &#9888; to sort it into a city, area and country, or mark it fictional.</p>}
      {picking && (
        <PickerSheet title={`Add ${noun}`} placeholder="Search your locations" options={options} taken={places.map((p) => p.id)}
          onPick={(o) => onPick(o.id)} onClose={() => setPicking(false)}
          extra={{ label: 'New location...', onChoose: () => { setPicking(false); setForm({ id: null }); } }}
          onCreate={(text) => { setPicking(false); setForm({ id: null, initial: parseLocationText(text) ?? { city: text } }); }} createLabel="New location" />
      )}
      {form && <LocationForm id={form.id} initial={form.initial} onClose={() => setForm(null)} onSave={(input) => onSave(form.id, input)} />}
    </>
  );
  return bare ? body : <Card label={label}>{body}</Card>;
}

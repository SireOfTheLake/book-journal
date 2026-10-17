import { useEffect, useMemo, useState } from 'react';
import { useDb } from '../../db/DbContext';
import { AREAS, canonicalCountry, COUNTRIES_ORDERED, locationLabel, standardLocation } from '../../domain/geo';
import { listPlaceParts, type PlaceInput, type PlaceParts } from '../../repo/places';
import FieldCombo from './FieldCombo';

export interface LocationValue { city: string | null; area: string | null; country: string | null; fictional: boolean }
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// A window to add or change a location. Country, area and city are each a search over what exists, and each accepts a new value of your own.
export default function LocationDialog({ title, initial, typed, shared, onSave, onClose }: { title: string; initial?: Partial<LocationValue>; typed?: string; shared?: boolean; onSave(input: PlaceInput): Promise<void>; onClose(): void }) {
  const db = useDb();
  const [city, setCity] = useState(initial?.city ?? '');
  const [area, setArea] = useState(initial?.area ?? '');
  const [country, setCountry] = useState(initial?.country ?? '');
  const [fictional, setFictional] = useState(!!initial?.fictional);
  const [parts, setParts] = useState<PlaceParts>({ countries: [], areas: [], cities: [] });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { listPlaceParts(db).then(setParts, () => undefined); }, [db]);
  const c = canonicalCountry(country);
  const countryOptions = useMemo(() => [...COUNTRIES_ORDERED, ...parts.countries.filter((x) => !COUNTRIES_ORDERED.includes(x))], [parts]);
  const areaOptions = useMemo(() => {
    const listed = c && AREAS[c] ? AREAS[c].list.map((x) => x.name) : Object.values(AREAS).flatMap((a) => a.list.map((x) => x.name));
    return [...new Set([...listed, ...parts.areas.map((x) => x.area)])];
  }, [parts, c]);
  const cityOptions = useMemo(() => [...new Set(parts.cities.map((x) => x.city))], [parts]);
  const place = (field: 'city' | 'area' | 'country') => { const t = typed ?? ''; setCity(field === 'city' ? t : ''); setArea(field === 'area' ? t : ''); setCountry(field === 'country' ? t : ''); };
  const preview = locationLabel(standardLocation({ city, area, country }));
  const save = async () => {
    setBusy(true);
    try { await onSave({ city, area, country, fictional }); onClose(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); setBusy(false); }
  };
  return (
    <div className="overlay" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="dialog locdlg" role="dialog" aria-label={title}>
        <h2 className="pagetitle small2">{title}</h2>
        {shared && <span className="muted small">This changes the location everywhere it is used.</span>}
        <span className="muted small">A location can be a city, an area, a country, or any mix. Search the lists or type your own.</span>
        {typed && (
          <div className="stack"><span className="lbl2">{`"${typed}" is a...`}</span>
            <span className="movebtns">{(['city', 'area', 'country'] as const).map((f) => <button key={f} type="button" className="mini" onClick={() => place(f)}>{cap(f)}</button>)}</span></div>
        )}
        <div className="stack"><span className="lbl2">Country</span>
          <FieldCombo label="Country" noun="country" value={country} onChange={setCountry} options={countryOptions} /></div>
        <div className="stack"><span className="lbl2">Area (state, province, planet, dungeon...)</span>
          <FieldCombo label="Area" noun="area" value={area} onChange={setArea} options={areaOptions} limit={12} /></div>
        <div className="stack"><span className="lbl2">City</span>
          <FieldCombo label="City" noun="city" value={city} onChange={setCity} options={cityOptions} /></div>
        <label className="check"><input type="checkbox" checked={fictional} onChange={(e) => setFictional(e.target.checked)} /> Fictional place (made up, like Hogwarts or Tatooine)</label>
        <span className="muted small" aria-live="polite">{preview ? <>Saved as: <b>{preview}</b>{fictional ? ' (fictional)' : ''}</> : 'Fill in at least one of the three.'}</span>
        {error && <div className="muted" role="alert">{error}</div>}
        <div className="actions"><button type="button" className="btn" onClick={onClose}>Cancel</button><span className="grow" />
          <button type="button" className="btn on" disabled={busy} onClick={save}>Save location</button></div>
      </div>
    </div>
  );
}

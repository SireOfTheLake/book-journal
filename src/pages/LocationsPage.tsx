import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDb } from '../db/DbContext';
import { listPlaces, normalizePlaces, savePlace, type PlaceRow } from '../repo/places';
import LocationDialog from './locations/LocationDialog';

// Every location, with the ones that still need updating first. Changing one here changes it for every book that uses it.
export default function LocationsPage() {
  const db = useDb();
  const [params, setParams] = useSearchParams();
  const needsOnly = params.get('needs') === '1';
  const [rows, setRows] = useState<PlaceRow[] | null>(null);
  const [editing, setEditing] = useState<PlaceRow | null>(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const reload = useCallback(async () => setRows(await listPlaces(db)), [db]);
  useEffect(() => { reload().catch((e) => setError(String(e))); }, [reload]);
  const shown = (rows ?? []).filter((r) => (!needsOnly || r.needsUpdate) && (!q.trim() || r.name.toLowerCase().includes(q.trim().toLowerCase())));
  const stale = (rows ?? []).filter((r) => r.needsUpdate).length;
  const retry = async () => { try { const r = await normalizePlaces(db); setNote(r.converted ? `Sorted out ${r.converted} location${r.converted === 1 ? '' : 's'}. ${r.flagged} still need${r.flagged === 1 ? 's' : ''} you.` : 'Nothing more could be sorted out automatically.'); await reload(); } catch (e) { setError(String(e)); } };
  return (
    <section className="locpage">
      <h1 className="pagetitle">LOCATIONS <span className="muted small">{rows ? `${rows.length} in all${stale ? `, ${stale} need updating` : ''}` : ''}</span></h1>
      {error && <div className="bcard warn" role="alert">{error} <button type="button" className="mini" onClick={() => setError(null)}>Dismiss</button></div>}
      <div className="bcard">
        <div className="movebtns">
          <input className="field small" aria-label="Search locations" placeholder="Search locations" value={q} onChange={(e) => setQ(e.target.value)} />
          <label className="check"><input type="checkbox" checked={needsOnly} onChange={(e) => setParams(e.target.checked ? { needs: '1' } : {})} /> Only locations that need updating</label>
          <button type="button" className="mini" onClick={retry}>Try to sort them out again</button>
        </div>
        {note && <span className="muted small" role="status">{note}</span>}
        {rows === null ? <p className="muted">Loading...</p> : shown.length === 0 ? <p className="muted">{needsOnly ? 'Every location is sorted out.' : 'No locations yet. Add one from a book\'s Setting card.'}</p> : shown.map((r) => (
          <div key={r.id} className="locrow">
            <span>{r.needsUpdate && <span className="warnmark" role="img" aria-label="Needs updating">&#9888;</span>}<b>{r.name}</b>{r.fictional && <span className="muted small fictag">fictional</span>}</span>
            <span className="muted small">{r.needsUpdate ? 'Plain text: not sorted into city, area and country yet' : [r.city && `City: ${r.city}`, r.area && `Area: ${r.area}`, r.country && `Country: ${r.country}`].filter(Boolean).join(' · ')}</span>
            <span className="muted small">{r.books} book{r.books === 1 ? '' : 's'}</span>
            <button type="button" className="mini" aria-label={`Edit ${r.name}`} onClick={() => setEditing(r)}>Edit</button>
          </div>
        ))}
      </div>
      {editing && <LocationDialog title="Edit location" shared initial={{ city: editing.city ?? (editing.area || editing.country ? null : editing.name), area: editing.area, country: editing.country, fictional: editing.fictional }} typed={editing.needsUpdate ? editing.name : undefined} onClose={() => setEditing(null)}
        onSave={async (input) => { await savePlace(db, editing.id, input); await reload(); }} />}
    </section>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { useDb } from '../db/DbContext';
import { countPurgeable, deletePlace, listPlaces, normalizePlaces, purgeUnusedPlaces, savePlace, type PlaceRow } from '../repo/places';
import { Link } from 'react-router-dom';
import { sortByLocation } from '../domain/geo';
import LocationDialog from './locations/LocationDialog';

// Every location, with the ones that still need updating first. Changing one here changes it for every book that uses it.
export default function LocationsPage() {
  const db = useDb();
  const [rows, setRows] = useState<PlaceRow[] | null>(null);
  const [editing, setEditing] = useState<PlaceRow | null>(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [purge, setPurge] = useState<number | null>(null); // how many a purge would remove, while asking
  const reload = useCallback(async () => setRows(await listPlaces(db)), [db]);
  useEffect(() => { reload().catch((e) => setError(String(e))); }, [reload]);
  const filtered = (rows ?? []).filter((r) => (!q.trim() || r.name.toLowerCase().includes(q.trim().toLowerCase())));
  // searching orders the matches by which parts they have; the plain list keeps its order (needs-updating first)
  const shown = q.trim() ? sortByLocation(filtered) : filtered;
  const stale = (rows ?? []).filter((r) => r.needsUpdate).length;
  const retry = async () => { try { const r = await normalizePlaces(db); setNote(r.converted ? `Sorted out ${r.converted} location${r.converted === 1 ? '' : 's'}. ${r.flagged} still need${r.flagged === 1 ? 's' : ''} you.` : 'Nothing more could be sorted out automatically.'); await reload(); } catch (e) { setError(String(e)); } };
  return (
    <section className="locpage">
      <h1 className="pagetitle">LOCATIONS <span className="muted small">{rows ? `${rows.length} in all${stale ? `, ${stale} need updating` : ''}` : ''}</span></h1>
      {error && <div className="bcard warn" role="alert">{error} <button type="button" className="mini" onClick={() => setError(null)}>Dismiss</button></div>}
      <div className="bcard">
        <div className="movebtns">
          <input className="field small" aria-label="Search locations" placeholder="Search locations" value={q} onChange={(e) => setQ(e.target.value)} />
          <button type="button" className="mini" onClick={retry}>Try to sort them out again</button>
          {purge === null
            ? <button type="button" className="mini" onClick={async () => { const n = await countPurgeable(db); if (n === 0) setNote('No unused locations need purging.'); else setPurge(n); }}>Purge unused locations</button>
            : <span className="notice" role="alert">{`Delete ${purge} location${purge === 1 ? '' : 's'} that need updating and have no books? `}
              <button type="button" className="mini danger" onClick={async () => { try { const n = await purgeUnusedPlaces(db); setNote(`Purged ${n} location${n === 1 ? '' : 's'}.`); setPurge(null); await reload(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); setPurge(null); } }}>Yes, purge them</button>
              <button type="button" className="mini" onClick={() => setPurge(null)}>Cancel</button></span>}
        </div>
        {note && <span className="muted small" role="status">{note}</span>}
        {rows === null ? <p className="muted">Loading...</p> : shown.length === 0 ? <p className="muted">{'No locations yet. Add one from a book\'s Setting card.'}</p> : shown.map((r) => (
          <div key={r.id} className="locrow">
            <span>{r.needsUpdate && <span className="warnmark" role="img" aria-label="Needs updating">&#9888;</span>}<b>{r.name}</b>{r.fictional && <span className="muted small fictag">fictional</span>}</span>
            <span className="muted small">{r.needsUpdate ? 'Plain text: not sorted into city, area and country yet' : [r.city && `City: ${r.city}`, r.area && `Area: ${r.area}`, r.country && `Country: ${r.country}`].filter(Boolean).join(' · ')}</span>
            <span className="muted small"><Link className="l" to={`/locations/${r.id}`} aria-label={`${r.name}: ${r.books} book${r.books === 1 ? '' : 's'}, ${r.characters} character${r.characters === 1 ? '' : 's'}`}>{r.books} book{r.books === 1 ? '' : 's'}, {r.characters} character{r.characters === 1 ? '' : 's'}</Link></span>
            <button type="button" className="mini" aria-label={`Edit ${r.name}`} onClick={() => setEditing(r)}>Edit</button>
          </div>
        ))}
      </div>
      {editing && <LocationDialog title="Edit location" shared initial={{ city: editing.city ?? (editing.area || editing.country ? null : editing.name), area: editing.area, country: editing.country, fictional: editing.fictional }} typed={editing.needsUpdate ? editing.name : undefined} onClose={() => setEditing(null)}
        onSave={async (input) => { await savePlace(db, editing.id, input); await reload(); }} usedBy={editing.books}
        onDelete={async () => { await deletePlace(db, editing.id); await reload(); }} />}
    </section>
  );
}

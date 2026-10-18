import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useDb } from '../../db/DbContext';
import { deletePlace, getPlaceDetail, savePlace, type PlaceDetail } from '../../repo/places';
import LocationDialog from './LocationDialog';

// One location: the books and characters tied to it, and (for one that needs updating) fields to sort it into a proper location.
export default function LocationDetailPage() {
  const db = useDb();
  const nav = useNavigate();
  const { placeId = '' } = useParams();
  const [d, setD] = useState<PlaceDetail | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => setD(await getPlaceDetail(db, placeId)), [db, placeId]);
  useEffect(() => { reload().catch((e) => setError(String(e))); }, [reload]);
  if (d === undefined) return <p className="muted">Loading...</p>;
  if (d === null) return <section><p className="muted">That location could not be found.</p><Link className="l" to="/locations">Back to Locations</Link></section>;
  const { place, books, characters } = d;
  return (
    <section className="locpage">
      <div className="titlerow"><h1 className="pagetitle">LOCATION</h1><Link className="l small" to="/locations">All locations</Link></div>
      {error && <div className="bcard warn" role="alert">{error} <button type="button" className="mini" onClick={() => setError(null)}>Dismiss</button></div>}
      <div className="bcard">
        <h2 className="seriestitle plain">{place.needsUpdate && <span className="warnmark" role="img" aria-label="Needs updating">&#9888; </span>}{place.name}{place.fictional && <span className="muted small fictag">fictional</span>}</h2>
        <span className="muted small">{place.needsUpdate ? 'Plain text: not sorted into city, area and country yet' : [place.city && `City: ${place.city}`, place.area && `Area: ${place.area}`, place.country && `Country: ${place.country}`].filter(Boolean).join(' · ')}</span>
      </div>
      <div className="bl-cols">
        <div className="bcard"><span className="lbl2">{`Books (${books.length})`}</span>
          {books.length === 0 ? <p className="muted">No books use this location.</p> : <ul className="plainlist">{books.map((b) => <li key={b.id}><Link className="l" to={`/book/${b.id}`}>{b.title}</Link>{b.authors && <span className="muted small">{` — ${b.authors}`}</span>}</li>)}</ul>}
        </div>
        <div className="bcard"><span className="lbl2">{`Characters (${characters.length})`}</span>
          {characters.length === 0 ? <p className="muted">No characters are tied to this location.</p> : <ul className="plainlist">{characters.map((c) => <li key={c.id}><Link className="l" to={`/characters/${c.id}`}>{c.name}</Link><span className="muted small">{` — ${c.how}`}</span></li>)}</ul>}
        </div>
      </div>
      {place.needsUpdate && (
        <div className="bcard"><span className="lbl2">Update this location</span>
          <span className="muted small">Enter the real city, area and country. Every book and character using this one is updated. If that location already exists, the two are combined.</span>
          <LocationDialog inline title="Update location" shared initial={{ city: null, area: null, country: null, fictional: place.fictional }} typed={place.name}
            onSave={async (input) => { const id = await savePlace(db, placeId, input); if (id !== placeId) nav(`/locations/${id}`, { replace: true }); else await reload(); }} onClose={() => undefined} />
        </div>
      )}
      <div className="bcard"><button type="button" className="btn" onClick={async () => { try { await deletePlace(db, placeId); nav('/locations'); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } }}>Delete this location</button>
        <span className="muted small">Books and characters stay; they just lose this place.</span></div>
    </section>
  );
}

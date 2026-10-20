import { assignVoice, unassignVoice } from '../../repo/voicing';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useDb } from '../../db/DbContext';
import { fileToDataUrl, urlToDataUrl } from '../../ui/imageFile';
import * as repo from '../../repo/characters';
import { savePlace } from '../../repo/places';
import CharacterMenu from './CharacterMenu';
import CharacterView, { type CharacterActions, type CharacterLists } from './CharacterView';

const EMPTY: CharacterLists = { sexualities: [], occupations: [], places: [], nameTypes: [], tags: [], characters: [], books: [] };

export default function CharacterPageContainer() {
  const db = useDb();
  const { characterId = '' } = useParams();
  const nav = useNavigate();
  const [d, setD] = useState<repo.CharacterDetail | null | undefined>(undefined);
  const [lists, setLists] = useState<CharacterLists>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [detail, sexualities, occupations, places, nameTypes, tags, characters, books] = await Promise.all([
      repo.getCharacter(db, characterId), repo.listNamed(db, 'sexuality'), repo.listNamed(db, 'occupation'), repo.listNamed(db, 'place'),
      repo.listNamed(db, 'name_type'), repo.listNamed(db, 'character_tag'), repo.listCharacterOptions(db), repo.listBookOptions(db),
    ]);
    setD(detail); setLists({ sexualities, occupations, places, nameTypes, tags, characters, books });
  }, [db, characterId]);
  useEffect(() => { reload().catch((e) => setError(String(e))); }, [reload]);

  const act = useMemo<CharacterActions>(() => {
    const id = characterId;
    const run = async (fn: () => Promise<unknown>) => { try { await fn(); await reload(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); throw e; } };
    const quiet = (fn: () => Promise<unknown>) => { run(fn).catch(() => undefined); };
    return {
      update: (f) => quiet(() => repo.updateCharacter(db, id, f)),
      createSexuality: (n) => quiet(async () => repo.updateCharacter(db, id, { sexuality_id: await repo.findOrCreateNamed(db, 'sexuality', n) })),
      addOccupation: (n) => quiet(() => repo.addOccupation(db, id, n)), removeOccupation: (o) => quiet(() => repo.removeOccupation(db, id, o)),
      renameOccupation: (o, n) => quiet(() => repo.renameNamed(db, 'occupation', o, n)),
      addTag: (n) => quiet(() => repo.addCharacterTag(db, id, n)), removeTag: (t) => quiet(() => repo.removeCharacterTag(db, id, t)),
      renameTag: (t, n) => quiet(() => repo.renameNamed(db, 'character_tag', t, n)),
      addPreviousPlace: (p) => quiet(() => repo.addPreviousPlace(db, id, p)), removePreviousPlace: (p) => quiet(() => repo.removePreviousPlace(db, id, p)),
      saveCurrentPlace: (pid, input) => run(async () => { const saved = await savePlace(db, pid, input); if (!pid) await repo.updateCharacter(db, id, { current_place_id: saved }); }),
      savePreviousPlace: (pid, input) => run(async () => { const saved = await savePlace(db, pid, input); if (!pid) await repo.addPreviousPlace(db, id, saved); }),
      addAltName: (n, t) => quiet(() => repo.addAltName(db, id, n, t)), removeAltName: (a) => quiet(() => repo.removeAltName(db, a)),
      linkCharacter: async (other, kind, label) => { await run(() => repo.addRelationship(db, id, { id: other }, kind.startsWith('partner') ? 'partner' : (kind as 'family' | 'friend' | 'other'), kind === 'partner_current' ? 1 : kind === 'partner_previous' ? 0 : null, label)); },
      addPerson: async (name, kind, label) => { await run(() => repo.addPerson(db, id, name, kind.startsWith('partner') ? 'partner' : (kind as 'family' | 'friend' | 'other'), kind === 'partner_current' ? 1 : kind === 'partner_previous' ? 0 : null, label)); },
      removePerson: (p) => quiet(() => repo.removePerson(db, p)), setPersonLabel: (p, l) => quiet(() => repo.setPersonLabel(db, p, l)),
      convertPerson: (p, t) => quiet(() => repo.convertPerson(db, p, { id: t })),
      addToBook: (b, r) => quiet(() => repo.addCharacterToBook(db, id, b, r)), removeFromBook: (bc) => quiet(() => repo.removeCharacterFromBook(db, bc)),
      removeRelationship: (r) => quiet(() => repo.removeRelationship(db, r)), setRelationshipLabel: (r, l) => quiet(() => repo.setRelationshipLabel(db, r, id, l)),
      voiceAdd: (rn) => quiet(() => assignVoice(db, rn, id)), voiceRemove: (rn) => quiet(() => unassignVoice(db, rn, id)),
      setBookNote: (b, n) => quiet(() => repo.setBookNote(db, b, n)),
      setRelStatus: (rel, st) => quiet(() => repo.setRelationshipStatus(db, rel, id, st)), setPersonStatus: (p, st) => quiet(() => repo.setPersonStatus(db, p, st)),
      addImageUrl: async (url, main) => { const img = await urlToDataUrl(url); await repo.addImage(db, id, img, main); await reload(); },
      addImage: (file, main) => quiet(async () => repo.addImage(db, id, await fileToDataUrl(file), main)),
      setMainImage: (i) => quiet(() => repo.setMainImage(db, id, i)), removeImage: (i) => quiet(() => repo.removeImage(db, id, i)),
      tagImage: (i, c) => quiet(() => repo.tagImage(db, i, c)),
    };
  }, [db, characterId, reload]);

  if (d === undefined) return <p className="muted">Loading...</p>;
  if (d === null) return <p className="muted">That character could not be found.</p>;
  return (
    <section>
      <div className="titlerow">
        <h1 className="pagetitle">CHARACTER</h1>
        <CharacterMenu self={{ id: d.core.id, name: d.core.name }} characters={lists.characters.map((c) => ({ id: c.id, name: c.name }))} act={{
          plan: (keep, dup) => repo.characterMergePlan(db, keep, dup),
          merge: async (keep, dup, choice) => { await repo.mergeCharacters(db, keep, dup, choice); if (keep === characterId) await reload(); else nav(`/characters/${keep}`); },
          remove: async (cid) => { await repo.deleteCharacter(db, cid); nav('/characters'); },
        }} />
      </div>
      {error && <div className="bcard warn" role="alert">{error} <button type="button" className="mini" onClick={() => setError(null)}>Dismiss</button></div>}
      <CharacterView d={d} lists={lists} act={act} />
    </section>
  );
}


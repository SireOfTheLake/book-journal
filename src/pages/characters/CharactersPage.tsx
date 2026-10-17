import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDb } from '../../db/DbContext';
import { createCharacter, listCharacters, type CharacterListRow } from '../../repo/characters';
import CharacterListView from './CharacterListView';

export default function CharactersPage() {
  const db = useDb();
  const nav = useNavigate();
  const [rows, setRows] = useState<CharacterListRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => setRows(await listCharacters(db)), [db]);
  useEffect(() => { reload().catch((e) => setError(String(e))); }, [reload]);
  return (
    <section>
      <h1 className="pagetitle">CHARACTERS <span className="muted small">Everyone in your books</span></h1>
      {error && <div className="bcard warn" role="alert">{error}</div>}
      {rows ? <CharacterListView rows={rows} onCreate={async (n) => { try { nav(`/characters/${await createCharacter(db, n)}`); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } }} /> : <p className="muted">Loading...</p>}
    </section>
  );
}

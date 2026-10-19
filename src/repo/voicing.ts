import type { Db } from '../db/adapter';
import { newId } from '../domain/ids';
import { first } from '../import/writer';

// Which narrator voiced which character on a listen (a read_narrator row is one narrator on one read).
export interface Voice { id: string; name: string }
export interface Voicing { rn_id: string; narrator_id: string; narrator: string; book_id: string; title: string; read_id: string }

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

export async function assignVoice(db: Db, readNarratorId: string, characterId: string) {
  if (await first(db, 'SELECT id FROM read_narrator_character WHERE read_narrator_id = ? AND character_id = ? AND deleted_at IS NULL', [readNarratorId, characterId])) return;
  await db.execute('INSERT INTO read_narrator_character (id, read_narrator_id, character_id) VALUES (?, ?, ?)', [newId(), readNarratorId, characterId]);
}

export const unassignVoice = (db: Db, readNarratorId: string, characterId: string) =>
  db.execute(`UPDATE read_narrator_character SET deleted_at = ${NOW} WHERE read_narrator_id = ? AND character_id = ? AND deleted_at IS NULL`, [readNarratorId, characterId]);

// The characters one narrator voiced on one listen.
export const voicesOf = (db: Db, readNarratorId: string) =>
  db.select<Voice>(
    `SELECT c.id AS id, c.name AS name FROM read_narrator_character rnc JOIN character c ON c.id = rnc.character_id AND c.deleted_at IS NULL
     WHERE rnc.read_narrator_id = ? AND rnc.deleted_at IS NULL ORDER BY CASE WHEN lower(c.name) LIKE \'the %\' THEN lower(substr(c.name, 5)) ELSE lower(c.name) END`, [readNarratorId]);

// Characters in the listen's book that could be given to a narrator.
export const bookCharacters = (db: Db, bookId: string) =>
  db.select<Voice>(
    `SELECT DISTINCT c.id AS id, c.name AS name FROM book_character bc JOIN character c ON c.id = bc.character_id AND c.deleted_at IS NULL
     WHERE bc.book_id = ? AND bc.deleted_at IS NULL ORDER BY CASE WHEN lower(c.name) LIKE \'the %\' THEN lower(substr(c.name, 5)) ELSE lower(c.name) END`, [bookId]);

const VOICING = `SELECT rn.id AS rn_id, n.id AS narrator_id, n.name AS narrator, b.id AS book_id, b.title AS title, r.id AS read_id
  FROM read_narrator rn JOIN read r ON r.id = rn.read_id AND r.deleted_at IS NULL JOIN book b ON b.id = r.book_id AND b.deleted_at IS NULL
  JOIN narrator n ON n.id = rn.narrator_id AND n.deleted_at IS NULL WHERE rn.deleted_at IS NULL`;

// Listens where a narrator voiced this character.
export const voicingsOf = (db: Db, characterId: string) =>
  db.select<Voicing>(`${VOICING} AND EXISTS (SELECT 1 FROM read_narrator_character x WHERE x.read_narrator_id = rn.id AND x.character_id = ? AND x.deleted_at IS NULL) ORDER BY CASE WHEN lower(b.title) LIKE \'the %\' THEN lower(substr(b.title, 5)) ELSE lower(b.title) END, CASE WHEN lower(n.name) LIKE \'the %\' THEN lower(substr(n.name, 5)) ELSE lower(n.name) END`, [characterId]);

// Listens of the books this character is in that could still be given to them.
export const voicingCandidates = (db: Db, characterId: string) =>
  db.select<Voicing>(
    `${VOICING} AND b.id IN (SELECT bc.book_id FROM book_character bc WHERE bc.character_id = ? AND bc.deleted_at IS NULL)
     AND NOT EXISTS (SELECT 1 FROM read_narrator_character x WHERE x.read_narrator_id = rn.id AND x.character_id = ? AND x.deleted_at IS NULL) ORDER BY CASE WHEN lower(b.title) LIKE \'the %\' THEN lower(substr(b.title, 5)) ELSE lower(b.title) END, CASE WHEN lower(n.name) LIKE \'the %\' THEN lower(substr(n.name, 5)) ELSE lower(n.name) END`, [characterId, characterId]);

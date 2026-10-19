import type { Db } from '../db/adapter';
import { newId } from '../domain/ids';
import type { Pick } from '../domain/randomizer';
import { addBookAuthor, createRead, deleteBook, dropPlannedReads } from './bookLog';
import { createBook } from './books';
import { fillSlot, listChallengeChoices, type ChallengeChoice } from './challenges';
import { promptSuggestions, setReason } from './reason';
import { tidyShelf } from './shelf';

export type PromptKind = 'trick' | 'treat';
export interface SavedPrompt { id: string; text: string }
export interface RandomizerData { trick: SavedPrompt[]; treat: SavedPrompt[]; challenges: ChallengeChoice[]; usedBefore: Record<PromptKind, string[]> }

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

export const listPrompts = (db: Db, kind: PromptKind) =>
  db.select<SavedPrompt>('SELECT id, text FROM randomizer_prompt WHERE kind = ? AND deleted_at IS NULL ORDER BY rowid', [kind]);

// Adds a prompt to the randomizer. A prompt you have already completed can be added too. The same words are only kept once per category.
export async function addPrompt(db: Db, kind: PromptKind, text: string): Promise<string> {
  const t = text.trim();
  if (!t) throw new Error('Type the prompt first.');
  const [dupe] = await db.select<{ id: string }>('SELECT id FROM randomizer_prompt WHERE kind = ? AND deleted_at IS NULL AND lower(text) = lower(?)', [kind, t]);
  if (dupe) return dupe.id;
  const id = newId();
  await db.execute('INSERT INTO randomizer_prompt (id, kind, text) VALUES (?, ?, ?)', [id, kind, t]);
  return id;
}
export const removePrompt = (db: Db, id: string) => db.execute(`UPDATE randomizer_prompt SET deleted_at = ${NOW} WHERE id = ?`, [id]);

export async function loadRandomizer(db: Db, year: number): Promise<RandomizerData> {
  const [trick, treat, challenges] = await Promise.all([listPrompts(db, 'trick'), listPrompts(db, 'treat'), listChallengeChoices(db, '', [year])]);
  const unused = async (kind: PromptKind, have: SavedPrompt[]) => {
    const used = new Set(have.map((p) => p.text.toLowerCase()));
    return (await promptSuggestions(db, kind, null, 50)).filter((t) => !used.has(t.toLowerCase())).slice(0, 8);
  };
  return { trick, treat, challenges: challenges.filter((c) => !c.word), usedBefore: { trick: await unused('trick', trick), treat: await unused('treat', treat) } };
}

// ---------- the blank "next book" page ----------
// A reading entry with the reason filled in and a placeholder book, until you choose the book.
export async function startDraft(db: Db, pick: Pick): Promise<{ bookId: string; readId: string }> {
  const bookId = await createBook(db, { title: 'Untitled book' });
  await db.execute('UPDATE book SET is_draft = 1 WHERE id = ?', [bookId]);
  try {
    const readId = await createRead(db, bookId, 'reading');
    if (pick.kind === 'challenge') {
      if (!pick.slotId) throw new Error('That prompt no longer exists.');
      await setReason(db, readId, { kind: 'challenge' });
      await fillSlot(db, pick.slotId, readId);
    } else await setReason(db, readId, { kind: pick.kind, prompt: pick.prompt });
    return { bookId, readId };
  } catch (e) { await deleteBook(db, bookId); throw e; }
}

export interface DraftRow { book_id: string; read_id: string; reason: string | null; prompt: string | null; challenge: string | null }
export const listDrafts = (db: Db) => db.select<DraftRow>(
  `SELECT b.id AS book_id, r.id AS read_id, c.name AS reason, r.prompt AS prompt,
     (SELECT ch.name || ': ' || s.label FROM challenge_completion k JOIN challenge_slot s ON s.id = k.slot_id JOIN challenge ch ON ch.id = k.challenge_id WHERE k.read_id = r.id AND k.deleted_at IS NULL LIMIT 1) AS challenge
   FROM book b JOIN read r ON r.book_id = b.id AND r.deleted_at IS NULL LEFT JOIN category c ON c.id = r.category_id
   WHERE b.is_draft = 1 AND b.deleted_at IS NULL ORDER BY b.rowid`);

async function draftRead(db: Db, bookId: string): Promise<string> {
  const [r] = await db.select<{ id: string; draft: number }>('SELECT r.id AS id, b.is_draft AS draft FROM book b JOIN read r ON r.book_id = b.id AND r.deleted_at IS NULL WHERE b.id = ? AND b.deleted_at IS NULL ORDER BY r.rowid LIMIT 1', [bookId]);
  if (!r?.draft) throw new Error('That page is no longer waiting for a book.');
  return r.id;
}

// The reading entry moves onto a book from your TBR or Up Next, which leaves the shelf. The placeholder goes away.
export async function chooseShelfBook(db: Db, draftBookId: string, chosenBookId: string): Promise<string> {
  const readId = await draftRead(db, draftBookId);
  const [chosen] = await db.select<{ id: string }>('SELECT id FROM book WHERE id = ? AND deleted_at IS NULL AND is_draft = 0', [chosenBookId]);
  if (!chosen) throw new Error('That book is no longer there.');
  // A book on Up Next already has a planned read: what was entered there carries over, then it is replaced by the one being moved in.
  const [mine] = await db.select<{ format: string | null; source_id: string | null }>("SELECT r.format AS format, r.source_id AS source_id FROM read r WHERE r.book_id = ? AND r.status = 'on_hold' AND r.start_date IS NULL AND r.deleted_at IS NULL LIMIT 1", [chosenBookId]);
  await dropPlannedReads(db, chosenBookId);
  if (mine) await db.execute('UPDATE read SET format = COALESCE(format, ?), source_id = COALESCE(source_id, ?) WHERE id = ?', [mine.format, mine.source_id, readId]);
  await db.execute('UPDATE read SET book_id = ? WHERE id = ?', [chosenBookId, readId]);
  const have = await db.select<{ n: number }>('SELECT count(*) AS n FROM read_narrator WHERE read_id = ? AND deleted_at IS NULL', [readId]);
  if (!Number(have[0]?.n)) {
    for (const d of await db.select<{ narrator_id: string; sort_order: number }>('SELECT narrator_id, sort_order FROM book_narrator WHERE book_id = ? AND deleted_at IS NULL ORDER BY sort_order', [chosenBookId])) {
      await db.execute('INSERT INTO read_narrator (id, read_id, narrator_id, sort_order) VALUES (?, ?, ?, ?)', [newId(), readId, d.narrator_id, d.sort_order]);
    }
  }
  await db.execute('UPDATE book SET shelf = NULL, tbr_priority = NULL WHERE id = ?', [chosenBookId]);
  await tidyShelf(db);
  await deleteBook(db, draftBookId);
  return readId;
}

// The placeholder becomes the new book you typed in.
export async function nameDraftBook(db: Db, draftBookId: string, input: { title: string; authors: string[] }): Promise<void> {
  await draftRead(db, draftBookId);
  const title = input.title.trim();
  if (!title) throw new Error('A book needs a title');
  await db.execute('UPDATE book SET title = ?, is_draft = 0 WHERE id = ?', [title, draftBookId]);
  for (const a of input.authors.map((x) => x.trim()).filter(Boolean)) await addBookAuthor(db, draftBookId, { name: a });
}

export async function discardDraft(db: Db, draftBookId: string): Promise<void> {
  await draftRead(db, draftBookId);
  await deleteBook(db, draftBookId);
}

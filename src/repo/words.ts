import type { Db } from '../db/adapter';
import { accentAt, isHexColor } from '../domain/challenges';
import { newId } from '../domain/ids';
import { ALPHABET, cleanWord, hasLetters } from '../domain/words';
import { addPrompt, fillSlot, refreshBonusWords, saveImage, type StickerImage } from './challenges';
import { ensureJournalYear } from './goals';

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const first = async <T,>(db: Db, sql: string, params: (string | number | null)[] = []) => (await db.select<T>(sql, params))[0];

export interface NewWordBuilder { year: number; name: string; color?: string; theme?: string; target?: number | null; letters?: Record<string, StickerImage> }

// A Word Builder is a Sticker challenge with one picture per letter. Its "prompts" are the words you add, so it starts with none. `target` is the most books it can take (empty = no limit).
export async function createWordBuilder(db: Db, input: NewWordBuilder): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new Error('Give the challenge a name.');
  const target = input.target ?? null;
  if (target !== null && (!Number.isInteger(target) || target < 1)) throw new Error('The limit must be a whole number above zero, or empty for no limit.');
  const yearId = await ensureJournalYear(db, input.year);
  const order = (await first<{ n: number | null }>(db, 'SELECT max(sort_order) AS n FROM challenge WHERE journal_year_id = ? AND deleted_at IS NULL', [yearId]))?.n ?? -1;
  const id = newId();
  await db.execute(
    `INSERT INTO challenge (id, journal_year_id, name, color, slot_kind, kind, goal_count, sort_order, word_builder, word_theme, word_target) VALUES (?, ?, ?, ?, 'open', 'sticker', 0, ?, 1, ?, ?)`,
    [id, yearId, name, isHexColor(input.color) ? input.color.toLowerCase() : accentAt(order + 1), order + 1, input.theme?.trim() || null, target]);
  for (const [letter, image] of Object.entries(input.letters ?? {})) await setLetter(db, id, letter, image);
  return id;
}

async function wordBuilder(db: Db, challengeId: string) {
  const c = await first<{ word_builder: number }>(db, 'SELECT word_builder FROM challenge WHERE id = ? AND deleted_at IS NULL', [challengeId]);
  if (!c) throw new Error('That challenge no longer exists.');
  if (!c.word_builder) throw new Error('That is not a Word Builder challenge.');
}

// The sticker picture for one letter (replaces the one it had).
export async function setLetter(db: Db, challengeId: string, letter: string, image: StickerImage) {
  const L = letter.toUpperCase();
  if (!ALPHABET.includes(L)) throw new Error('A letter sticker is for a letter from A to Z.');
  await wordBuilder(db, challengeId);
  const old = await first<{ id: string; image_id: string }>(db, 'SELECT id, image_id FROM challenge_letter WHERE challenge_id = ? AND letter = ? AND deleted_at IS NULL', [challengeId, L]);
  const img = await saveImage(db, image);
  if (old) {
    await db.execute(`UPDATE challenge_letter SET deleted_at = ${NOW} WHERE id = ?`, [old.id]);
    await db.execute(`UPDATE image SET deleted_at = ${NOW} WHERE id = ?`, [old.image_id]);
  }
  await db.execute('INSERT INTO challenge_letter (id, challenge_id, letter, image_id) VALUES (?, ?, ?, ?)', [newId(), challengeId, L, img]);
}
export async function removeLetter(db: Db, challengeId: string, letter: string) {
  const old = await first<{ id: string; image_id: string }>(db, 'SELECT id, image_id FROM challenge_letter WHERE challenge_id = ? AND letter = ? AND deleted_at IS NULL', [challengeId, letter.toUpperCase()]);
  if (!old) return;
  await db.execute(`UPDATE challenge_letter SET deleted_at = ${NOW} WHERE id = ?`, [old.id]);
  await db.execute(`UPDATE image SET deleted_at = ${NOW} WHERE id = ?`, [old.image_id]);
}

export async function setWordSettings(db: Db, challengeId: string, s: { theme?: string | null; target?: number | null; allowBonus?: boolean; bonusLimit?: number | null }) {
  await wordBuilder(db, challengeId);
  if (s.theme !== undefined) await db.execute('UPDATE challenge SET word_theme = ? WHERE id = ?', [s.theme?.trim() || null, challengeId]);
  if (s.allowBonus !== undefined) await db.execute('UPDATE challenge SET allow_bonus = ? WHERE id = ?', [s.allowBonus ? 1 : 0, challengeId]);
  if (s.bonusLimit !== undefined) {
    if (s.bonusLimit !== null && (!Number.isInteger(s.bonusLimit) || s.bonusLimit < 1)) throw new Error('The bonus limit must be a whole number above zero, or empty for no limit.');
    await db.execute('UPDATE challenge SET bonus_limit = ? WHERE id = ?', [s.bonusLimit, challengeId]);
  }
  if (s.target !== undefined) {
    if (s.target !== null && (!Number.isInteger(s.target) || s.target < 1)) throw new Error('The limit must be a whole number above zero, or empty for no limit.');
    const have = (await first<{ n: number }>(db, 'SELECT count(*) AS n FROM challenge_slot WHERE challenge_id = ? AND deleted_at IS NULL', [challengeId]))?.n ?? 0;
    const allow = (await first<{ a: number }>(db, 'SELECT allow_bonus AS a FROM challenge WHERE id = ?', [challengeId]))?.a;
    if (s.target !== null && s.target < have && !allow) throw new Error(`This challenge already has ${have} book${have === 1 ? "" : "s"}. Remove some, or allow bonus words, before setting a limit of ${s.target}.`);
    await db.execute('UPDATE challenge SET word_target = ? WHERE id = ?', [s.target, challengeId]);
  }
  await refreshBonusWords(db, challengeId);
}

// Words that are decided before any book is chosen. They are slots with no book yet, and a book is chosen for them later.
export async function addPresetWords(db: Db, challengeId: string, words: string[]): Promise<number> {
  await wordBuilder(db, challengeId);
  const have = new Set((await db.select<{ label: string }>('SELECT label FROM challenge_slot WHERE challenge_id = ? AND deleted_at IS NULL', [challengeId])).map((r) => r.label.toLowerCase()));
  let n = 0;
  for (const raw of words) {
    const w = cleanWord(raw);
    if (!hasLetters(w) || have.has(w.toLowerCase())) continue;
    have.add(w.toLowerCase());
    await addPrompt(db, challengeId, null, w);
    n++;
  }
  await refreshBonusWords(db, challengeId);
  return n;
}

// The word this read adds to the challenge. A read has one word per challenge, so typing another one changes it.
export async function setWord(db: Db, challengeId: string, readId: string, word: string): Promise<string> {
  await wordBuilder(db, challengeId);
  const w = cleanWord(word);
  if (!hasLetters(w)) throw new Error('Type a word that has letters in it.');
  const cur = await first<{ slot_id: string }>(db, 'SELECT slot_id FROM challenge_completion WHERE challenge_id = ? AND read_id = ? AND deleted_at IS NULL', [challengeId, readId]);
  if (cur) { await db.execute('UPDATE challenge_slot SET label = ? WHERE id = ?', [w, cur.slot_id]); return cur.slot_id; }
  // A word that was decided ahead of time takes the book.
  const preset = await first<{ id: string }>(db, `SELECT s.id AS id FROM challenge_slot s WHERE s.challenge_id = ? AND s.deleted_at IS NULL AND lower(s.label) = lower(?)
    AND NOT EXISTS (SELECT 1 FROM challenge_completion k WHERE k.slot_id = s.id AND k.deleted_at IS NULL)`, [challengeId, w]);
  if (preset) { await fillSlot(db, preset.id, readId); return preset.id; }
  const lim = await first<{ limit: number | null; allow: number; bonusLimit: number | null; n: number; bonus: number }>(db,
    `SELECT word_target AS "limit", allow_bonus AS allow, bonus_limit AS bonusLimit, (SELECT count(*) FROM challenge_slot WHERE challenge_id = ? AND deleted_at IS NULL) AS n,
       (SELECT count(*) FROM challenge_slot WHERE challenge_id = ? AND deleted_at IS NULL AND is_bonus = 1) AS bonus FROM challenge WHERE id = ?`, [challengeId, challengeId, challengeId]);
  if (lim?.limit != null && lim.n >= lim.limit) {
    if (!lim.allow) throw new Error(`This challenge is full: it is limited to ${lim.limit} book${lim.limit === 1 ? '' : 's'}. Allow bonus words in Edit to keep going.`);
    if (lim.bonusLimit != null && lim.bonus >= lim.bonusLimit) throw new Error(`This challenge is full: ${lim.limit} book${lim.limit === 1 ? '' : 's'} and ${lim.bonusLimit} bonus word${lim.bonusLimit === 1 ? '' : 's'}.`);
  }
  const slot = await addPrompt(db, challengeId, null, w);
  try { await fillSlot(db, slot, readId); } catch (e) { await db.execute(`UPDATE challenge_slot SET deleted_at = ${NOW} WHERE id = ?`, [slot]); throw e; }
  await refreshBonusWords(db, challengeId);
  return slot;
}

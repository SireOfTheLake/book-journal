import type { Db } from '../db/adapter';
import { assignColors, DEFAULT_PALETTE, FREE_POSITION, MAX_PALETTE, PLAYABLE } from '../domain/bingo';
import { accentAt, isHexColor } from '../domain/challenges';
import { shuffled } from '../domain/challengeLayout';
import { newId } from '../domain/ids';
import { parsePalette, saveImage, type StickerImage } from './challenges';
import { ensureJournalYear } from './goals';

const first = async <T,>(db: Db, sql: string, params: (string | number | null)[] = []) => (await db.select<T>(sql, params))[0];
const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
type Rng = () => number;

// ---------- prompt banks ----------
export interface BankSummary { id: string; name: string; count: number; lastYear: number | null }
export interface BankPrompt { id: string; text: string; image: string | null; years: number[] }
export interface Bank { id: string; name: string; prompts: BankPrompt[] }

// `year` is the year a new board would be for; lastYear is the most recent earlier year with a board from the bank.
export async function listBanks(db: Db, year: number): Promise<BankSummary[]> {
  const rows = await db.select<{ id: string; name: string; count: number; last: number | null }>(
    `SELECT b.id AS id, b.name AS name, (SELECT count(*) FROM bingo_prompt p WHERE p.bank_id = b.id AND p.deleted_at IS NULL) AS count,
       (SELECT max(y.year) FROM challenge c JOIN journal_year y ON y.id = c.journal_year_id WHERE c.bank_id = b.id AND c.deleted_at IS NULL AND y.year < ?) AS last
     FROM bingo_bank b WHERE b.deleted_at IS NULL ORDER BY CASE WHEN lower(b.name) LIKE \'the %\' THEN lower(substr(b.name, 5)) ELSE lower(b.name) END`, [year]);
  return rows.map((r) => ({ id: r.id, name: r.name, count: r.count, lastYear: r.last }));
}
export async function getBank(db: Db, id: string): Promise<Bank | null> {
  const b = await first<{ id: string; name: string }>(db, 'SELECT id, name FROM bingo_bank WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!b) return null;
  const rows = await db.select<{ id: string; text: string; image: string | null }>(
    `SELECT p.id AS id, p.text AS text, im.file_path AS image FROM bingo_prompt p LEFT JOIN image im ON im.id = p.image_id AND im.deleted_at IS NULL
     WHERE p.bank_id = ? AND p.deleted_at IS NULL ORDER BY p.position, p.rowid`, [id]);
  const used = await db.select<{ pid: string; year: number }>(
    `SELECT DISTINCT s.bank_prompt_id AS pid, y.year AS year FROM challenge_slot s JOIN challenge c ON c.id = s.challenge_id JOIN journal_year y ON y.id = c.journal_year_id
     WHERE c.bank_id = ? AND c.deleted_at IS NULL AND s.deleted_at IS NULL AND s.bank_prompt_id IS NOT NULL ORDER BY y.year`, [id]);
  return { id: b.id, name: b.name, prompts: rows.map((r) => ({ ...r, years: used.filter((u) => u.pid === r.id).map((u) => u.year) })) };
}
const cleanTexts = (texts: string[]) => texts.map((t) => t.trim()).filter(Boolean);
export async function createBank(db: Db, name: string, texts: string[] = []): Promise<string> {
  if (!name.trim()) throw new Error('Give the prompt bank a name.');
  const id = newId();
  await db.execute('INSERT INTO bingo_bank (id, name) VALUES (?, ?)', [id, name.trim()]);
  await addBankPrompts(db, id, texts);
  return id;
}
export async function renameBank(db: Db, id: string, name: string) {
  if (!name.trim()) throw new Error('Give the prompt bank a name.');
  await db.execute('UPDATE bingo_bank SET name = ? WHERE id = ?', [name.trim(), id]);
}
// Boards already made from a bank keep their own copies of the prompts.
export async function deleteBank(db: Db, id: string) {
  await db.execute(`UPDATE image SET deleted_at = ${NOW} WHERE deleted_at IS NULL AND id IN (SELECT image_id FROM bingo_prompt WHERE bank_id = ? AND image_id IS NOT NULL)`, [id]);
  await db.execute(`UPDATE bingo_prompt SET deleted_at = ${NOW} WHERE bank_id = ? AND deleted_at IS NULL`, [id]);
  await db.execute(`UPDATE bingo_bank SET deleted_at = ${NOW} WHERE id = ?`, [id]);
}
export async function addBankPrompts(db: Db, bankId: string, texts: string[]) {
  let n = (await first<{ n: number | null }>(db, 'SELECT max(position) AS n FROM bingo_prompt WHERE bank_id = ? AND deleted_at IS NULL', [bankId]))?.n ?? 0;
  for (const t of cleanTexts(texts)) await db.execute('INSERT INTO bingo_prompt (id, bank_id, text, position) VALUES (?, ?, ?, ?)', [newId(), bankId, t, ++n]);
}
export async function renameBankPrompt(db: Db, id: string, text: string) {
  if (!text.trim()) throw new Error('A prompt cannot be empty.');
  await db.execute('UPDATE bingo_prompt SET text = ? WHERE id = ?', [text.trim(), id]);
}
export async function setBankPromptImage(db: Db, id: string, image: StickerImage | null) {
  const old = await first<{ image_id: string | null }>(db, 'SELECT image_id FROM bingo_prompt WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!old) throw new Error('That prompt no longer exists.');
  const img = image ? await saveImage(db, image) : null;
  await db.execute('UPDATE bingo_prompt SET image_id = ? WHERE id = ?', [img, id]);
  if (old.image_id) await db.execute(`UPDATE image SET deleted_at = ${NOW} WHERE id = ?`, [old.image_id]);
}
export async function deleteBankPrompt(db: Db, id: string) {
  await db.execute(`UPDATE image SET deleted_at = ${NOW} WHERE deleted_at IS NULL AND id = (SELECT image_id FROM bingo_prompt WHERE id = ?)`, [id]);
  await db.execute(`UPDATE bingo_prompt SET deleted_at = ${NOW} WHERE id = ?`, [id]);
}

// ---------- drawing prompts for a board ----------
interface Row { id: string; text: string; image_id: string | null }
async function usedLastYear(db: Db, bankId: string, year: number): Promise<Set<string>> {
  const last = (await first<{ y: number | null }>(db,
    `SELECT max(y.year) AS y FROM challenge c JOIN journal_year y ON y.id = c.journal_year_id WHERE c.bank_id = ? AND c.deleted_at IS NULL AND y.year < ?`, [bankId, year]))?.y;
  if (!last) return new Set();
  const rows = await db.select<{ id: string }>(
    `SELECT DISTINCT s.bank_prompt_id AS id FROM challenge_slot s JOIN challenge c ON c.id = s.challenge_id JOIN journal_year y ON y.id = c.journal_year_id
     WHERE c.bank_id = ? AND y.year = ? AND c.deleted_at IS NULL AND s.deleted_at IS NULL AND s.bank_prompt_id IS NOT NULL`, [bankId, last]);
  return new Set(rows.map((r) => r.id));
}
// Random prompts from the bank, none of `exclude`. With `prefer`, prompts that were not on last year's board come first.
async function draw(db: Db, bankId: string, year: number, n: number, prefer: boolean, exclude: Set<string>, rng: Rng): Promise<Row[]> {
  const all = (await db.select<Row>('SELECT id, text, image_id FROM bingo_prompt WHERE bank_id = ? AND deleted_at IS NULL ORDER BY position, rowid', [bankId])).filter((r) => !exclude.has(r.id));
  const used = prefer ? await usedLastYear(db, bankId, year) : new Set<string>();
  const fresh = shuffled(all.filter((r) => !used.has(r.id)), rng);
  const old = shuffled(all.filter((r) => used.has(r.id)), rng);
  return [...fresh, ...old].slice(0, n);
}
async function copyImage(db: Db, imageId: string | null): Promise<string | null> {
  if (!imageId) return null;
  const im = await first<{ file_path: string; mime_type: string | null; width: number | null; height: number | null }>(db, 'SELECT file_path, mime_type, width, height FROM image WHERE id = ? AND deleted_at IS NULL', [imageId]);
  return im ? saveImage(db, { dataUrl: im.file_path, mime: im.mime_type ?? undefined, width: im.width ?? undefined, height: im.height ?? undefined }) : null;
}

// ---------- boards ----------
export interface NewBingo { year: number; name: string; bankId: string; preferUnused?: boolean; palette?: string[]; freeText?: string; rng?: Rng }
export async function createBingo(db: Db, input: NewBingo): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new Error('Give the challenge a name.');
  const bank = await first<{ id: string }>(db, 'SELECT id FROM bingo_bank WHERE id = ? AND deleted_at IS NULL', [input.bankId]);
  if (!bank) throw new Error('Choose a prompt bank.');
  const rng = input.rng ?? Math.random;
  const prefer = input.preferUnused ?? true;
  const picked = await draw(db, input.bankId, input.year, PLAYABLE, prefer, new Set(), rng);
  if (picked.length < PLAYABLE) throw new Error(`A Bingo board needs ${PLAYABLE} prompts and this bank has ${picked.length}. Add more to the bank first.`);
  const palette = input.palette?.length ? input.palette.filter(isHexColor).slice(0, MAX_PALETTE) : [...DEFAULT_PALETTE];
  const yearId = await ensureJournalYear(db, input.year);
  const order = (await first<{ n: number | null }>(db, 'SELECT max(sort_order) AS n FROM challenge WHERE journal_year_id = ? AND deleted_at IS NULL', [yearId]))?.n ?? -1;
  const id = newId();
  await db.execute(`INSERT INTO challenge (id, journal_year_id, name, color, slot_kind, kind, goal_count, sort_order, published, palette, bank_id, prefer_unused)
    VALUES (?, ?, ?, ?, 'grid', 'bingo', ?, ?, 0, ?, ?, ?)`, [id, yearId, name, palette[0] ?? accentAt(0), PLAYABLE, order + 1, JSON.stringify(palette), input.bankId, prefer ? 1 : 0]);
  const colors = assignColors(palette, 25, rng);
  let k = 0;
  for (let pos = 1; pos <= 25; pos++) {
    if (pos === FREE_POSITION) {
      await db.execute('INSERT INTO challenge_slot (id, challenge_id, label, position, color, is_free) VALUES (?, ?, ?, ?, ?, 1)', [newId(), id, input.freeText?.trim() ?? '', pos, colors[pos - 1]]);
      continue;
    }
    const p = picked[k++];
    await db.execute('INSERT INTO challenge_slot (id, challenge_id, label, position, color, art_image_id, bank_prompt_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [newId(), id, p.text, pos, colors[pos - 1], await copyImage(db, p.image_id), p.id]);
  }
  return id;
}

interface BoardRow { id: string; bank_id: string | null; year: number; published: number; prefer_unused: number; palette: string | null }
async function board(db: Db, challengeId: string): Promise<BoardRow> {
  const b = await first<BoardRow>(db, `SELECT c.id AS id, c.bank_id AS bank_id, y.year AS year, c.published AS published, c.prefer_unused AS prefer_unused, c.palette AS palette
    FROM challenge c JOIN journal_year y ON y.id = c.journal_year_id WHERE c.id = ? AND c.kind = 'bingo' AND c.deleted_at IS NULL`, [challengeId]);
  if (!b) throw new Error('That Bingo board no longer exists.');
  return b;
}
async function squareBoard(db: Db, slotId: string) {
  const s = await first<{ challenge_id: string; is_free: number; art: string | null; bank_prompt_id: string | null }>(db,
    `SELECT s.challenge_id AS challenge_id, s.is_free AS is_free, s.art_image_id AS art, s.bank_prompt_id AS bank_prompt_id FROM challenge_slot s JOIN challenge c ON c.id = s.challenge_id
     WHERE s.id = ? AND s.deleted_at IS NULL AND c.kind = 'bingo' AND c.deleted_at IS NULL`, [slotId]);
  if (!s) throw new Error('That square no longer exists.');
  return s;
}
const dropImage = (db: Db, imageId: string | null) => (imageId ? db.execute(`UPDATE image SET deleted_at = ${NOW} WHERE id = ?`, [imageId]) : Promise.resolve());

// A new random set of prompts for every square (before the board is published).
export async function regenerateBoard(db: Db, challengeId: string, rng: Rng = Math.random) {
  const b = await board(db, challengeId);
  if (b.published) throw new Error('A published board keeps its prompts. Change squares one at a time instead.');
  if (!b.bank_id) throw new Error('This board has no prompt bank.');
  const picked = await draw(db, b.bank_id, b.year, PLAYABLE, !!b.prefer_unused, new Set(), rng);
  if (picked.length < PLAYABLE) throw new Error(`The bank has only ${picked.length} prompts.`);
  const slots = await db.select<{ id: string; art: string | null }>('SELECT id, art_image_id AS art FROM challenge_slot WHERE challenge_id = ? AND deleted_at IS NULL AND is_free = 0 ORDER BY position', [challengeId]);
  for (let i = 0; i < slots.length; i++) {
    await dropImage(db, slots[i].art);
    await db.execute('UPDATE challenge_slot SET label = ?, art_image_id = ?, bank_prompt_id = ? WHERE id = ?', [picked[i].text, await copyImage(db, picked[i].image_id), picked[i].id, slots[i].id]);
  }
}
// The bank's prompts that are not already on the board.
export async function listAvailablePrompts(db: Db, challengeId: string): Promise<{ id: string; text: string; image: string | null }[]> {
  const b = await board(db, challengeId);
  if (!b.bank_id) return [];
  return db.select(`SELECT p.id AS id, p.text AS text, im.file_path AS image FROM bingo_prompt p LEFT JOIN image im ON im.id = p.image_id AND im.deleted_at IS NULL
    WHERE p.bank_id = ? AND p.deleted_at IS NULL AND p.id NOT IN (SELECT bank_prompt_id FROM challenge_slot WHERE challenge_id = ? AND deleted_at IS NULL AND bank_prompt_id IS NOT NULL)
    ORDER BY p.position, p.rowid`, [b.bank_id, challengeId]);
}
async function setFromBank(db: Db, slotId: string, p: Row) {
  const s = await squareBoard(db, slotId);
  await dropImage(db, s.art);
  await db.execute('UPDATE challenge_slot SET label = ?, art_image_id = ?, bank_prompt_id = ? WHERE id = ?', [p.text, await copyImage(db, p.image_id), p.id, slotId]);
}
export async function pickBankPrompt(db: Db, slotId: string, bankPromptId: string) {
  await squareBoard(db, slotId);
  const p = await first<Row>(db, 'SELECT id, text, image_id FROM bingo_prompt WHERE id = ? AND deleted_at IS NULL', [bankPromptId]);
  if (!p) throw new Error('That prompt is no longer in the bank.');
  await setFromBank(db, slotId, p);
}
// Swaps one square for a different random prompt from the bank.
export async function swapForAnother(db: Db, slotId: string, rng: Rng = Math.random) {
  const s = await squareBoard(db, slotId);
  if (s.is_free) throw new Error('The free space does not come from the bank.');
  const b = await board(db, s.challenge_id);
  if (!b.bank_id) throw new Error('This board has no prompt bank.');
  const on = await db.select<{ id: string }>('SELECT bank_prompt_id AS id FROM challenge_slot WHERE challenge_id = ? AND deleted_at IS NULL AND bank_prompt_id IS NOT NULL', [s.challenge_id]);
  const [p] = await draw(db, b.bank_id, b.year, 1, !!b.prefer_unused, new Set(on.map((r) => r.id)), rng);
  if (!p) throw new Error('Every prompt in the bank is already on this board.');
  await setFromBank(db, slotId, p);
}
// Your own words for a square. The free space may be emptied to go back to a plain FREE.
export async function setSquareText(db: Db, slotId: string, text: string) {
  const s = await squareBoard(db, slotId);
  if (!text.trim() && !s.is_free) throw new Error('A square needs some text, or a picture.');
  await db.execute('UPDATE challenge_slot SET label = ?, bank_prompt_id = NULL WHERE id = ?', [text.trim(), slotId]);
}
export async function setSquareImage(db: Db, slotId: string, image: StickerImage | null) {
  const s = await squareBoard(db, slotId);
  const img = image ? await saveImage(db, image) : null;
  if (!img && !s.is_free) {
    const label = (await first<{ label: string }>(db, 'SELECT label FROM challenge_slot WHERE id = ?', [slotId]))?.label ?? '';
    if (!label) throw new Error('A square needs some text, or a picture.');
  }
  await db.execute('UPDATE challenge_slot SET art_image_id = ? WHERE id = ?', [img, slotId]);
  await dropImage(db, s.art);
}

// ---------- colours ----------
export async function setSquareColor(db: Db, slotId: string, color: string) {
  if (!isHexColor(color)) throw new Error('That is not a color.');
  await squareBoard(db, slotId);
  await db.execute('UPDATE challenge_slot SET color = ? WHERE id = ?', [color.toLowerCase(), slotId]);
}
export async function rerollColors(db: Db, challengeId: string, rng: Rng = Math.random) {
  const b = await board(db, challengeId);
  const palette = parsePalette(b.palette);
  const slots = await db.select<{ id: string }>('SELECT id FROM challenge_slot WHERE challenge_id = ? AND deleted_at IS NULL ORDER BY position', [challengeId]);
  const colors = assignColors(palette, slots.length, rng);
  for (let i = 0; i < slots.length; i++) await db.execute('UPDATE challenge_slot SET color = ? WHERE id = ?', [colors[i], slots[i].id]);
}
// The set of colours the squares are drawn from. Squares with a colour that is no longer in the set get a new one.
export async function setPalette(db: Db, challengeId: string, colors: string[], rng: Rng = Math.random) {
  const b = await board(db, challengeId);
  const palette = [...new Set(colors.filter(isHexColor).map((c) => c.toLowerCase()))];
  if (!palette.length) throw new Error('Keep at least one color.');
  if (palette.length > MAX_PALETTE) throw new Error(`Use at most ${MAX_PALETTE} colors.`);
  await db.execute('UPDATE challenge SET palette = ?, color = ? WHERE id = ?', [JSON.stringify(palette), palette[0], challengeId]);
  const slots = await db.select<{ id: string; color: string | null }>('SELECT id, color FROM challenge_slot WHERE challenge_id = ? AND deleted_at IS NULL ORDER BY position', [challengeId]);
  const fresh = assignColors(palette, slots.length, rng);
  for (let i = 0; i < slots.length; i++) if (!slots[i].color || !palette.includes(slots[i].color!.toLowerCase())) await db.execute('UPDATE challenge_slot SET color = ? WHERE id = ?', [fresh[i], slots[i].id]);
  void b;
}

// ---------- arranging and publishing ----------
export async function publishBingo(db: Db, challengeId: string) {
  await board(db, challengeId);
  await db.execute('UPDATE challenge SET published = 1 WHERE id = ?', [challengeId]);
}
async function renumber(db: Db, ids: string[]) {
  for (let i = 0; i < ids.length; i++) await db.execute('UPDATE challenge_slot SET position = ? WHERE id = ?', [-(i + 1), ids[i]]);
  for (let i = 0; i < ids.length; i++) await db.execute('UPDATE challenge_slot SET position = ? WHERE id = ?', [i + 1, ids[i]]);
}
const order = (db: Db, challengeId: string) => db.select<{ id: string; is_free: number }>('SELECT id, is_free FROM challenge_slot WHERE challenge_id = ? AND deleted_at IS NULL ORDER BY position', [challengeId]);
// Two squares trade places. The free space stays in the middle.
export async function swapSquares(db: Db, a: string, b: string) {
  const sa = await squareBoard(db, a); await squareBoard(db, b);
  if (a === b) return;
  const all = await order(db, sa.challenge_id);
  const ia = all.findIndex((x) => x.id === a), ib = all.findIndex((x) => x.id === b);
  if (ia < 0 || ib < 0) throw new Error('Those squares are not on the same board.');
  if (all[ia].is_free || all[ib].is_free) throw new Error('The free space stays in the middle.');
  const ids = all.map((x) => x.id); [ids[ia], ids[ib]] = [ids[ib], ids[ia]];
  await renumber(db, ids);
}
export async function shuffleBoard(db: Db, challengeId: string, rng: Rng = Math.random) {
  await board(db, challengeId);
  const all = await order(db, challengeId);
  const mixed = shuffled(all.filter((x) => !x.is_free).map((x) => x.id), rng);
  let k = 0;
  await renumber(db, all.map((x) => (x.is_free ? x.id : mixed[k++])));
}

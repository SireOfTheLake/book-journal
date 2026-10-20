import type { Db } from '../db/adapter';
import { accentAt, isHexColor, tracker, TOTAL_SQL, type Tracker } from '../domain/challenges';
import { DEFAULT_PALETTE } from '../domain/bingo';
import { moveBefore, resolveLayout, serializeLayout, shuffled, MAX_COLS, type Layout } from '../domain/challengeLayout';
import { newId } from '../domain/ids';
import { pickMapColor } from '../domain/usMap';
import { ensureJournalYear } from './goals';

const first = async <T,>(db: Db, sql: string, params: (string | number | null)[] = []) => (await db.select<T>(sql, params))[0];
const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
export type ChallengeKind = 'grid' | 'sticker' | 'bingo';

export interface ChallengeSummary extends Tracker { id: string; name: string; kind: ChallengeKind; color: string | null; published: boolean; word: boolean; usMap: boolean } // usMap = a US map challenge (a Grid of the 50 states); word = a Word Builder (a kind of Sticker challenge)
export interface SlotFill { read_id: string; book_id: string; title: string; authors: string | null; status: string }
export interface Slot { id: string; label: string; position: number; group_id: string | null; art: string | null; color: string | null; is_free: boolean; bank_prompt_id: string | null; fill: SlotFill | null; askNote: boolean | null; note: string | null } // askNote: true / false = this prompt decides, null = follows the challenge; note = what you wrote for the book on it
export interface BingoInfo { published: boolean; palette: string[]; bankId: string | null; bankName: string | null; preferUnused: boolean }
// The free space of a Bingo board does not count toward the tracker until it is given a prompt.
export const countsTowardTracker = (s: { is_free: boolean; label: string; art: string | null }) => !s.is_free || s.label !== '' || !!s.art;
export interface Group { id: string; name: string; color: string; slots: Slot[] }
export interface Challenge extends Tracker {
  id: string; name: string; kind: ChallengeKind; color: string; year: number;
  bingo: BingoInfo | null; layout: Layout; groups: Group[]; loose: Slot[]; // loose = prompts that belong to the main category only
  usMap: boolean; description: string | null; askNote: boolean; noteLabel: string; // askNote: every prompt asks for a short note; noteLabel: what it is called
  word: boolean; theme: string | null; target: number | null; letters: Record<string, string>; // Word Builder: the theme of the words, how many words to aim for, and the sticker picture for each letter
}

export const parsePalette = (text: string | null): string[] => {
  try { const v = text ? JSON.parse(text) : null; const ok = Array.isArray(v) ? v.filter(isHexColor) : []; if (ok.length) return ok; } catch { /* default */ }
  return [...DEFAULT_PALETTE];
};

export async function listChallenges(db: Db, year: number): Promise<ChallengeSummary[]> {
  const rows = await db.select<{ id: string; name: string; kind: ChallengeKind; color: string | null; published: number; word: number; usMap: number; total: number; done: number }>(
    `SELECT c.us_map AS usMap, c.id AS id, c.name AS name, c.kind AS kind, c.color AS color, c.published AS published, c.word_builder AS word,
       ${TOTAL_SQL} AS total,
       (SELECT count(*) FROM challenge_slot s JOIN challenge_completion k ON k.slot_id = s.id AND k.deleted_at IS NULL
          JOIN read kr ON kr.id = k.read_id AND kr.deleted_at IS NULL AND kr.status = 'finished'
          WHERE s.challenge_id = c.id AND s.deleted_at IS NULL AND (s.is_free = 0 OR s.label <> '' OR s.art_image_id IS NOT NULL)) AS done
     FROM challenge c JOIN journal_year y ON y.id = c.journal_year_id
     WHERE y.year = ? AND y.deleted_at IS NULL AND c.deleted_at IS NULL ORDER BY c.sort_order, c.created_at, c.rowid`, [year]);
  return rows.map((r) => ({ id: r.id, name: r.name, kind: r.kind, color: r.color, published: !!r.published, word: !!r.word, usMap: !!r.usMap, ...tracker(r.done, r.total) }));
}

export async function getChallenge(db: Db, id: string): Promise<Challenge | null> {
  const c = await first<{ id: string; name: string; kind: ChallengeKind; color: string | null; year: number; layout: string | null; published: number; palette: string | null; bank_id: string | null; bank_name: string | null; prefer_unused: number; word: number; usMap: number; description: string | null; ask_note: number; note_label: string | null; theme: string | null; target: number | null }>(
    db, `SELECT c.us_map AS usMap, c.description AS description, c.ask_note AS ask_note, c.note_label AS note_label, c.word_builder AS word, c.word_theme AS theme, c.word_target AS target, c.id AS id, c.name AS name, c.kind AS kind, c.color AS color, c.layout AS layout, c.published AS published, c.palette AS palette, c.bank_id AS bank_id, c.prefer_unused AS prefer_unused,
       (SELECT b.name FROM bingo_bank b WHERE b.id = c.bank_id AND b.deleted_at IS NULL) AS bank_name, y.year AS year FROM challenge c JOIN journal_year y ON y.id = c.journal_year_id WHERE c.id = ? AND c.deleted_at IS NULL`, [id]);
  if (!c) return null;
  const groups = await db.select<{ id: string; name: string; color: string | null }>(
    'SELECT id, name, color FROM challenge_group WHERE challenge_id = ? AND deleted_at IS NULL ORDER BY position, created_at, rowid', [id]);
  const rows = await db.select<{ id: string; label: string; position: number; group_id: string | null; art: string | null; color: string | null; is_free: number; bank_prompt_id: string | null; ask_note: number | null; note: string | null; read_id: string | null; book_id: string | null; title: string | null; authors: string | null; status: string | null }>(
    `SELECT s.id AS id, s.label AS label, s.position AS position, s.group_id AS group_id, im.file_path AS art, s.color AS color, s.is_free AS is_free, s.bank_prompt_id AS bank_prompt_id, s.ask_note AS ask_note, k.note AS note, k.read_id AS read_id, r.book_id AS book_id, b.title AS title, r.status AS status,
       (SELECT group_concat(x.name, ', ') FROM (SELECT au.name AS name FROM book_author ba JOIN author au ON au.id = ba.author_id WHERE ba.book_id = b.id AND ba.deleted_at IS NULL AND au.deleted_at IS NULL ORDER BY ba.sort_order) x) AS authors
     FROM challenge_slot s
     LEFT JOIN image im ON im.id = s.art_image_id AND im.deleted_at IS NULL
     LEFT JOIN challenge_completion k ON k.slot_id = s.id AND k.deleted_at IS NULL
     LEFT JOIN read r ON r.id = k.read_id AND r.deleted_at IS NULL
     LEFT JOIN book b ON b.id = r.book_id AND b.deleted_at IS NULL
     WHERE s.challenge_id = ? AND s.deleted_at IS NULL ORDER BY s.position`, [id]);
  const slots: Slot[] = rows.map((r) => ({
    id: r.id, label: r.label, position: r.position, group_id: r.group_id, art: r.art, color: r.color, is_free: !!r.is_free, bank_prompt_id: r.bank_prompt_id, askNote: r.ask_note === null ? null : !!r.ask_note, note: r.note,
    fill: r.read_id && r.book_id ? { read_id: r.read_id, book_id: r.book_id, title: r.title ?? '', authors: r.authors, status: r.status ?? '' } : null,
  }));
  const counted = slots.filter(countsTowardTracker);
  const done = counted.filter((s) => s.fill?.status === 'finished').length; // a book on a prompt only counts once it has been read
  return {
    id: c.id, name: c.name, kind: c.kind, color: c.color && isHexColor(c.color) ? c.color : accentAt(0), year: c.year, layout: resolveLayout(c.kind, groups.map((g) => g.id), c.layout),
    groups: groups.map((g, i) => ({ id: g.id, name: g.name, color: g.color && isHexColor(g.color) ? g.color : accentAt(i + 1), slots: slots.filter((s) => s.group_id === g.id) })),
    loose: slots.filter((s) => !s.group_id || !groups.some((g) => g.id === s.group_id)),
    bingo: c.kind === 'bingo' ? { published: !!c.published, palette: parsePalette(c.palette), bankId: c.bank_id, bankName: c.bank_name, preferUnused: !!c.prefer_unused } : null,
    usMap: !!c.usMap, description: c.description, askNote: !!c.ask_note, noteLabel: c.note_label?.trim() || 'Note', word: !!c.word, theme: c.theme, target: c.target, letters: c.word ? await letterMap(db, id) : {},
    ...tracker(done, c.word ? Math.max(c.target ?? 0, counted.length) : counted.length),
  };
}

export const letterMap = async (db: Db, challengeId: string): Promise<Record<string, string>> => Object.fromEntries(
  (await db.select<{ letter: string; file_path: string }>(
    'SELECT l.letter AS letter, i.file_path AS file_path FROM challenge_letter l JOIN image i ON i.id = l.image_id AND i.deleted_at IS NULL WHERE l.challenge_id = ? AND l.deleted_at IS NULL', [challengeId])).map((r) => [r.letter, r.file_path]));

// ---------- creating ----------
export interface NewGrid { year: number; name: string; color?: string; prompts?: string[]; groups?: { name: string; color?: string; prompts: string[] }[] }
export async function createGrid(db: Db, input: NewGrid): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new Error('Give the challenge a name.');
  const groups = (input.groups ?? []).filter((g) => g.name.trim() || g.prompts.length);
  const total = (input.prompts ?? []).length + groups.reduce((n, g) => n + g.prompts.length, 0);
  if (!total) throw new Error('Add at least one prompt.');
  if (groups.some((g) => !g.name.trim())) throw new Error('Every sub-category needs a name.');
  const yearId = await ensureJournalYear(db, input.year);
  const order = (await first<{ n: number | null }>(db, 'SELECT max(sort_order) AS n FROM challenge WHERE journal_year_id = ? AND deleted_at IS NULL', [yearId]))?.n ?? -1;
  const id = newId();
  await db.execute(`INSERT INTO challenge (id, journal_year_id, name, color, slot_kind, kind, goal_count, sort_order) VALUES (?, ?, ?, ?, 'grid', 'grid', ?, ?)`,
    [id, yearId, name, isHexColor(input.color) ? input.color.toLowerCase() : accentAt(order + 1), total, order + 1]);
  let pos = 1;
  for (const label of input.prompts ?? []) await db.execute(`INSERT INTO challenge_slot (id, challenge_id, label, position) VALUES (?, ?, ?, ?)`, [newId(), id, label.trim(), pos++]);
  let gi = 0;
  for (const g of groups) {
    const gid = newId();
    await db.execute('INSERT INTO challenge_group (id, challenge_id, name, color, position) VALUES (?, ?, ?, ?, ?)', [gid, id, g.name.trim(), isHexColor(g.color) ? g.color.toLowerCase() : accentAt(gi + 1), gi]);
    gi++;
    for (const label of g.prompts) await db.execute(`INSERT INTO challenge_slot (id, challenge_id, label, group_id, position) VALUES (?, ?, ?, ?, ?)`, [newId(), id, label.trim(), gid, pos++]);
  }
  return id;
}

// ---------- sticker challenges ----------
// A sticker is a small picture kept inside the database (already shrunk by the screen), the same way other pictures are.
export interface StickerImage { dataUrl: string; width?: number; height?: number; mime?: string }
// A sticker can sit in a sub-category: `group` is the name of one of the challenge's groups (empty or missing = the main prompts).
export interface NewSticker { year: number; name: string; color?: string; groups?: { name: string; color?: string }[]; stickers: { prompt: string; image: StickerImage; group?: string }[] }
export const saveImage = async (db: Db, img: StickerImage) => {
  const id = newId();
  await db.execute('INSERT INTO image (id, file_path, mime_type, width, height) VALUES (?, ?, ?, ?, ?)', [id, img.dataUrl, img.mime ?? null, img.width ?? null, img.height ?? null]);
  return id;
};
export async function createSticker(db: Db, input: NewSticker): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new Error('Give the challenge a name.');
  if (!input.stickers.length) throw new Error('Add at least one sticker.');
  if (input.stickers.some((s) => !s.prompt.trim())) throw new Error('Every sticker needs a prompt.');
  const yearId = await ensureJournalYear(db, input.year);
  const order = (await first<{ n: number | null }>(db, 'SELECT max(sort_order) AS n FROM challenge WHERE journal_year_id = ? AND deleted_at IS NULL', [yearId]))?.n ?? -1;
  const id = newId();
  await db.execute(`INSERT INTO challenge (id, journal_year_id, name, color, slot_kind, kind, goal_count, sort_order) VALUES (?, ?, ?, ?, 'numbered', 'sticker', ?, ?)`,
    [id, yearId, name, isHexColor(input.color) ? input.color.toLowerCase() : accentAt(order + 1), input.stickers.length, order + 1]);
  const groupIds = new Map<string, string>();
  let gi = 0;
  for (const g of input.groups ?? []) {
    const gname = g.name.trim();
    if (!gname || groupIds.has(gname.toLowerCase())) continue;
    const gid = newId();
    groupIds.set(gname.toLowerCase(), gid);
    await db.execute('INSERT INTO challenge_group (id, challenge_id, name, color, position) VALUES (?, ?, ?, ?, ?)', [gid, id, gname, isHexColor(g.color) ? g.color.toLowerCase() : accentAt(gi + 1), gi]);
    gi++;
  }
  let pos = 1;
  for (const st of input.stickers) {
    const img = await saveImage(db, st.image);
    const gid = st.group?.trim() ? groupIds.get(st.group.trim().toLowerCase()) ?? null : null;
    if (st.group?.trim() && !gid) throw new Error(`There is no sub-category called "${st.group.trim()}".`);
    await db.execute('INSERT INTO challenge_slot (id, challenge_id, label, position, art_image_id, group_id) VALUES (?, ?, ?, ?, ?, ?)', [newId(), id, st.prompt.trim(), pos++, img, gid]);
  }
  return id;
}
export async function addStickers(db: Db, challengeId: string, stickers: { prompt: string; image: StickerImage; groupId?: string | null }[]) {
  if (stickers.some((s) => !s.prompt.trim())) throw new Error('Every sticker needs a prompt.');
  const groups = new Set((await db.select<{ id: string }>('SELECT id FROM challenge_group WHERE challenge_id = ? AND deleted_at IS NULL', [challengeId])).map((g) => g.id));
  if (stickers.some((s) => s.groupId && !groups.has(s.groupId))) throw new Error('That sub-category no longer exists.');
  for (const st of stickers) {
    const n = (await first<{ n: number | null }>(db, 'SELECT max(position) AS n FROM challenge_slot WHERE challenge_id = ? AND deleted_at IS NULL', [challengeId]))?.n ?? 0;
    const img = await saveImage(db, st.image);
    await db.execute('INSERT INTO challenge_slot (id, challenge_id, label, position, art_image_id, group_id) VALUES (?, ?, ?, ?, ?, ?)', [newId(), challengeId, st.prompt.trim(), n + 1, img, st.groupId || null]);
  }
  await syncCount(db, challengeId);
}
export async function replaceSticker(db: Db, slotId: string, image: StickerImage) {
  const old = await first<{ art_image_id: string | null }>(db, 'SELECT art_image_id FROM challenge_slot WHERE id = ? AND deleted_at IS NULL', [slotId]);
  if (!old) throw new Error('That prompt no longer exists.');
  const img = await saveImage(db, image);
  await db.execute('UPDATE challenge_slot SET art_image_id = ? WHERE id = ?', [img, slotId]);
  if (old.art_image_id) await db.execute(`UPDATE image SET deleted_at = ${NOW} WHERE id = ?`, [old.art_image_id]);
}

// ---------- editing (any time) ----------
const syncCount = (db: Db, challengeId: string) => db.execute(
  `UPDATE challenge SET goal_count = (SELECT count(*) FROM challenge_slot WHERE challenge_id = ? AND deleted_at IS NULL) WHERE id = ?`, [challengeId, challengeId]);
// ---------- notes on prompts ----------
// Not for Bingo or US map challenges, which have no use for one.
export async function setChallengeNotes(db: Db, id: string, ask: boolean, label: string) {
  const c = await first<{ kind: string; us_map: number }>(db, 'SELECT kind, us_map FROM challenge WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!c) throw new Error('That challenge no longer exists.');
  if (c.kind === 'bingo' || c.us_map) throw new Error('Bingo and US map challenges do not take notes on their prompts.');
  await db.execute('UPDATE challenge SET ask_note = ?, note_label = ? WHERE id = ?', [ask ? 1 : 0, label.trim() || null, id]);
}
export const setPromptAsk = (db: Db, slotId: string, ask: boolean | null) =>
  db.execute('UPDATE challenge_slot SET ask_note = ? WHERE id = ?', [ask === null ? null : ask ? 1 : 0, slotId]);
export const setPromptNote = (db: Db, slotId: string, note: string) =>
  db.execute('UPDATE challenge_completion SET note = ? WHERE slot_id = ? AND deleted_at IS NULL', [note.trim() || null, slotId]);

export async function renameChallenge(db: Db, id: string, name: string) {
  if (!name.trim()) throw new Error('Give the challenge a name.');
  await db.execute('UPDATE challenge SET name = ? WHERE id = ?', [name.trim(), id]);
}
export const setChallengeDescription = (db: Db, id: string, text: string) =>
  db.execute('UPDATE challenge SET description = ? WHERE id = ?', [text.trim() || null, id]);
export async function setChallengeColor(db: Db, id: string, color: string) {
  if (!isHexColor(color)) throw new Error('That is not a color.');
  await db.execute('UPDATE challenge SET color = ? WHERE id = ?', [color.toLowerCase(), id]);
}
export async function deleteChallenge(db: Db, id: string) {
  for (const sql of [
    `UPDATE challenge_completion SET deleted_at = ${NOW} WHERE challenge_id = ? AND deleted_at IS NULL`,
    `UPDATE image SET deleted_at = ${NOW} WHERE deleted_at IS NULL AND id IN (SELECT art_image_id FROM challenge_slot WHERE challenge_id = ? AND art_image_id IS NOT NULL)`,
    `UPDATE image SET deleted_at = ${NOW} WHERE deleted_at IS NULL AND id IN (SELECT image_id FROM challenge_letter WHERE challenge_id = ?)`,
    `UPDATE challenge_letter SET deleted_at = ${NOW} WHERE challenge_id = ? AND deleted_at IS NULL`,
    `UPDATE challenge_slot SET deleted_at = ${NOW} WHERE challenge_id = ? AND deleted_at IS NULL`,
    `UPDATE challenge_group SET deleted_at = ${NOW} WHERE challenge_id = ? AND deleted_at IS NULL`,
    `UPDATE challenge SET deleted_at = ${NOW} WHERE id = ? AND deleted_at IS NULL`,
  ]) await db.execute(sql, [id]);
}

export async function addGroup(db: Db, challengeId: string, name: string): Promise<string> {
  if (!name.trim()) throw new Error('Give the sub-category a name.');
  const n = (await first<{ n: number | null }>(db, 'SELECT max(position) AS n FROM challenge_group WHERE challenge_id = ? AND deleted_at IS NULL', [challengeId]))?.n ?? -1;
  const id = newId();
  await db.execute('INSERT INTO challenge_group (id, challenge_id, name, color, position) VALUES (?, ?, ?, ?, ?)', [id, challengeId, name.trim(), accentAt(n + 2), n + 1]);
  return id;
}
export async function renameGroup(db: Db, id: string, name: string) {
  if (!name.trim()) throw new Error('Give the sub-category a name.');
  await db.execute('UPDATE challenge_group SET name = ? WHERE id = ?', [name.trim(), id]);
}
export async function setGroupColor(db: Db, id: string, color: string) {
  if (!isHexColor(color)) throw new Error('That is not a color.');
  await db.execute('UPDATE challenge_group SET color = ? WHERE id = ?', [color.toLowerCase(), id]);
}
// Removes the sub-category with its prompts (and the books placed on them; the reads themselves stay).
export async function deleteGroup(db: Db, id: string) {
  const g = await first<{ challenge_id: string }>(db, 'SELECT challenge_id FROM challenge_group WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!g) return;
  await db.execute(`UPDATE challenge_completion SET deleted_at = ${NOW} WHERE deleted_at IS NULL AND slot_id IN (SELECT id FROM challenge_slot WHERE group_id = ?)`, [id]);
  await db.execute(`UPDATE image SET deleted_at = ${NOW} WHERE deleted_at IS NULL AND id IN (SELECT art_image_id FROM challenge_slot WHERE group_id = ? AND art_image_id IS NOT NULL)`, [id]);
  await db.execute(`UPDATE challenge_slot SET deleted_at = ${NOW} WHERE group_id = ? AND deleted_at IS NULL`, [id]);
  await db.execute(`UPDATE challenge_group SET deleted_at = ${NOW} WHERE id = ?`, [id]);
  await syncCount(db, g.challenge_id);
}

export async function addPrompt(db: Db, challengeId: string, groupId: string | null, label: string): Promise<string> {
  if (!label.trim()) throw new Error('Write the prompt first.');
  const n = (await first<{ n: number | null }>(db, 'SELECT max(position) AS n FROM challenge_slot WHERE challenge_id = ? AND deleted_at IS NULL', [challengeId]))?.n ?? 0;
  const id = newId();
  await db.execute('INSERT INTO challenge_slot (id, challenge_id, label, group_id, position) VALUES (?, ?, ?, ?, ?)', [id, challengeId, label.trim(), groupId, n + 1]);
  await syncCount(db, challengeId);
  return id;
}
export async function renamePrompt(db: Db, slotId: string, label: string) {
  if (!label.trim()) throw new Error('A prompt cannot be empty.');
  await db.execute('UPDATE challenge_slot SET label = ? WHERE id = ?', [label.trim(), slotId]);
}
export async function deletePrompt(db: Db, slotId: string) {
  const s = await first<{ challenge_id: string }>(db, 'SELECT challenge_id FROM challenge_slot WHERE id = ? AND deleted_at IS NULL', [slotId]);
  if (!s) return;
  await db.execute(`UPDATE challenge_completion SET deleted_at = ${NOW} WHERE slot_id = ? AND deleted_at IS NULL`, [slotId]);
  await db.execute(`UPDATE image SET deleted_at = ${NOW} WHERE deleted_at IS NULL AND id = (SELECT art_image_id FROM challenge_slot WHERE id = ?)`, [slotId]);
  await db.execute(`UPDATE challenge_slot SET deleted_at = ${NOW} WHERE id = ?`, [slotId]);
  await syncCount(db, s.challenge_id);
}

// ---------- placing books ----------
// Puts a read on a prompt. The read leaves any other prompt in the same challenge (a read fills one slot per challenge); a book already on this prompt is replaced.
export async function fillSlot(db: Db, slotId: string, readId: string, rng: () => number = Math.random) {
  const s = await first<{ challenge_id: string; is_free: number; label: string; art: string | null; published: number; us_map: number; color: string | null }>(db,
    'SELECT c.us_map AS us_map, s.color AS color, s.challenge_id AS challenge_id, s.is_free AS is_free, s.label AS label, s.art_image_id AS art, c.published AS published FROM challenge_slot s JOIN challenge c ON c.id = s.challenge_id WHERE s.id = ? AND s.deleted_at IS NULL', [slotId]);
  if (!s) throw new Error('That prompt no longer exists.');
  if (!s.published) throw new Error('Publish the board before placing books on it.');
  if (!countsTowardTracker({ is_free: !!s.is_free, label: s.label, art: s.art })) throw new Error('The free space is free. Give it a prompt if you want a book on it.');
  const r = await first<{ id: string }>(db, 'SELECT id FROM read WHERE id = ? AND deleted_at IS NULL', [readId]);
  if (!r) throw new Error('That read no longer exists.');
  const same = await first<{ note: string | null }>(db, 'SELECT note FROM challenge_completion WHERE deleted_at IS NULL AND challenge_id = ? AND slot_id = ? AND read_id = ?', [s.challenge_id, slotId, readId]); // choosing the same book again keeps its note
  await db.execute(`UPDATE challenge_completion SET deleted_at = ${NOW} WHERE deleted_at IS NULL AND challenge_id = ? AND (slot_id = ? OR read_id = ?)`, [s.challenge_id, slotId, readId]);
  await db.execute('INSERT INTO challenge_completion (id, read_id, challenge_id, slot_id, note) VALUES (?, ?, ?, ?, ?)', [newId(), readId, s.challenge_id, slotId, same?.note ?? null]);
  // A state on a US map is filled in with a random color the first time it gets a book (a different book on the same state keeps its color). A state the read just left goes back to empty.
  if (s.us_map) {
    await db.execute('UPDATE challenge_slot SET color = NULL WHERE challenge_id = ? AND color IS NOT NULL AND id NOT IN (SELECT slot_id FROM challenge_completion WHERE challenge_id = ? AND deleted_at IS NULL)', [s.challenge_id, s.challenge_id]);
    if (!s.color) {
      const used = (await db.select<{ color: string | null }>('SELECT color FROM challenge_slot WHERE challenge_id = ? AND deleted_at IS NULL AND color IS NOT NULL', [s.challenge_id])).map((r) => r.color);
      await db.execute('UPDATE challenge_slot SET color = ? WHERE id = ?', [pickMapColor(used, rng), slotId]);
    }
  }
}
// Takes the book off a prompt. A Word Builder word has no life of its own without its book, so that word goes too.
export async function clearSlot(db: Db, slotId: string) {
  const w = await first<{ n: number }>(db, 'SELECT c.word_builder AS n FROM challenge_slot s JOIN challenge c ON c.id = s.challenge_id WHERE s.id = ?', [slotId]);
  if (w?.n) { await deletePrompt(db, slotId); return; }
  await db.execute(`UPDATE challenge_completion SET deleted_at = ${NOW} WHERE slot_id = ? AND deleted_at IS NULL`, [slotId]);
  await db.execute('UPDATE challenge_slot SET color = NULL WHERE id = ? AND challenge_id IN (SELECT id FROM challenge WHERE us_map = 1)', [slotId]);
}

export interface Candidate { read_id: string; book_id: string; title: string; authors: string | null; series: string | null; status: string; when: string | null; used_on: string | null }
// Reads you can put on a prompt: in progress and paused first, then everything else, newest first. Every word typed must be found in the title, author or series.
export async function searchReads(db: Db, challengeId: string, query: string, limit = 30): Promise<Candidate[]> {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const where = words.map(() => `lower(b.title || ' ' || COALESCE((SELECT group_concat(au.name, ' ') FROM book_author ba JOIN author au ON au.id = ba.author_id WHERE ba.book_id = b.id AND ba.deleted_at IS NULL), '') || ' ' || COALESCE((SELECT s.title FROM series s WHERE s.id = b.series_id), '')) LIKE ?`).join(' AND ');
  return db.select<Candidate>(
    `SELECT r.id AS read_id, b.id AS book_id, b.title AS title, CASE WHEN b.shelf IS NOT NULL AND r.status = 'on_hold' AND r.start_date IS NULL THEN 'up_next' ELSE r.status END AS status, COALESCE(r.finish_date, r.start_date) AS "when",
       (SELECT group_concat(x.name, ', ') FROM (SELECT au.name AS name FROM book_author ba JOIN author au ON au.id = ba.author_id WHERE ba.book_id = b.id AND ba.deleted_at IS NULL AND au.deleted_at IS NULL ORDER BY ba.sort_order) x) AS authors,
       (SELECT s.title FROM series s WHERE s.id = b.series_id) AS series,
       (SELECT cs.label FROM challenge_completion k JOIN challenge_slot cs ON cs.id = k.slot_id WHERE k.read_id = r.id AND k.challenge_id = ? AND k.deleted_at IS NULL AND cs.deleted_at IS NULL) AS used_on
     FROM read r JOIN book b ON b.id = r.book_id AND b.deleted_at IS NULL
     WHERE r.deleted_at IS NULL ${where ? `AND ${where}` : ''}
     ORDER BY (r.status IN ('reading','on_hold') AND b.shelf IS NULL) DESC, COALESCE(r.finish_date, r.start_date, '') DESC, r.created_at DESC, r.rowid DESC LIMIT ?`,
    [challengeId, ...words.map((w) => `%${w}%`), limit]);
}

// ---------- arranging (order and size) ----------
async function loadLayout(db: Db, challengeId: string): Promise<Layout> {
  const c = await first<{ kind: ChallengeKind; layout: string | null }>(db, 'SELECT kind, layout FROM challenge WHERE id = ? AND deleted_at IS NULL', [challengeId]);
  if (!c) throw new Error('That challenge no longer exists.');
  const groups = await db.select<{ id: string }>('SELECT id FROM challenge_group WHERE challenge_id = ? AND deleted_at IS NULL ORDER BY position, created_at, rowid', [challengeId]);
  return resolveLayout(c.kind, groups.map((g) => g.id), c.layout);
}
const saveLayout = (db: Db, challengeId: string, l: Layout) => db.execute('UPDATE challenge SET layout = ? WHERE id = ?', [serializeLayout(l), challengeId]);

// How many books wide a card is (1 to 12), or 0 for the full width.
export async function setCardCols(db: Db, challengeId: string, key: string, cols: number) {
  if (!Number.isInteger(cols) || cols < 0 || cols > MAX_COLS) throw new Error(`A card can be 1 to ${MAX_COLS} books wide, or full width.`);
  const l = await loadLayout(db, challengeId);
  if (!(key in l.cols)) throw new Error('That card no longer exists.');
  await saveLayout(db, challengeId, { ...l, cols: { ...l.cols, [key]: cols } });
}
// Puts a card before another card (or last when `beforeKey` is null).
export async function moveCard(db: Db, challengeId: string, key: string, beforeKey: string | null) {
  const l = await loadLayout(db, challengeId);
  await saveLayout(db, challengeId, { ...l, order: moveBefore(l.order, key, beforeKey) });
}
export async function shuffleCards(db: Db, challengeId: string, rng: () => number = Math.random) {
  const l = await loadLayout(db, challengeId);
  await saveLayout(db, challengeId, { ...l, order: shuffled(l.order, rng) });
}

// Positions are unique per challenge, so renumber in two steps.
async function renumber(db: Db, orderedIds: string[]) {
  for (let i = 0; i < orderedIds.length; i++) await db.execute('UPDATE challenge_slot SET position = ? WHERE id = ?', [-(i + 1), orderedIds[i]]);
  for (let i = 0; i < orderedIds.length; i++) await db.execute('UPDATE challenge_slot SET position = ? WHERE id = ?', [i + 1, orderedIds[i]]);
}
const slotsInOrder = (db: Db, challengeId: string) => db.select<{ id: string; group_id: string | null }>(
  'SELECT id, group_id FROM challenge_slot WHERE challenge_id = ? AND deleted_at IS NULL ORDER BY position', [challengeId]);

// Moves a prompt (with its sticker and book) before another prompt, or to the end of a sub-category (groupId null = the main prompts).
export async function movePrompt(db: Db, slotId: string, groupId: string | null, beforeSlotId: string | null) {
  const s = await first<{ challenge_id: string }>(db, 'SELECT challenge_id FROM challenge_slot WHERE id = ? AND deleted_at IS NULL', [slotId]);
  if (!s) throw new Error('That prompt no longer exists.');
  if (groupId && !(await first(db, 'SELECT id FROM challenge_group WHERE id = ? AND challenge_id = ? AND deleted_at IS NULL', [groupId, s.challenge_id]))) throw new Error('That sub-category no longer exists.');
  const all = await slotsInOrder(db, s.challenge_id);
  let ids = all.map((x) => x.id);
  if (beforeSlotId) {
    const target = all.find((x) => x.id === beforeSlotId);
    if (!target) throw new Error('That prompt no longer exists.');
    groupId = target.group_id;
    ids = moveBefore(ids, slotId, beforeSlotId);
  } else {
    const rest = all.filter((x) => x.id !== slotId);
    const last = [...rest].reverse().find((x) => x.group_id === groupId);
    ids = moveBefore(ids, slotId, last ? (rest[rest.indexOf(last) + 1]?.id ?? null) : null);
  }
  await renumber(db, ids);
  await db.execute('UPDATE challenge_slot SET group_id = ? WHERE id = ?', [groupId, slotId]);
}
// Random order for the prompts of one card (groupId null = the main prompts). They keep to the places that card already uses.
export async function shufflePrompts(db: Db, challengeId: string, groupId: string | null, rng: () => number = Math.random) {
  const all = await slotsInOrder(db, challengeId);
  const inCard = (x: { group_id: string | null }) => x.group_id === groupId;
  const mixed = shuffled(all.filter(inCard).map((x) => x.id), rng);
  let k = 0;
  await renumber(db, all.map((x) => (inCard(x) ? mixed[k++] : x.id)));
}

// ---------- challenges on the Book Log ----------
// A read can count toward several challenges, but fills only one prompt in each.
export interface ReadChallenge { challenge_id: string; name: string; kind: ChallengeKind; color: string | null; year: number; slot_id: string; label: string; group: string | null; done: number; total: number; word: boolean; planned: boolean; note: string | null }

export async function listReadChallenges(db: Db, readId: string): Promise<ReadChallenge[]> {
  const rows = await db.select<{ challenge_id: string; name: string; kind: ChallengeKind; color: string | null; year: number; slot_id: string; label: string; position: number; group: string | null; word: number; rstatus: string; note: string | null }>(
    `SELECT k.note AS note, (SELECT r.status FROM read r WHERE r.id = k.read_id) AS rstatus, c.word_builder AS word, c.id AS challenge_id, c.name AS name, c.kind AS kind, c.color AS color, y.year AS year, s.id AS slot_id, s.label AS label, s.position AS position,
       (SELECT g.name FROM challenge_group g WHERE g.id = s.group_id AND g.deleted_at IS NULL) AS "group"
     FROM challenge_completion k JOIN challenge_slot s ON s.id = k.slot_id AND s.deleted_at IS NULL
       JOIN challenge c ON c.id = k.challenge_id AND c.deleted_at IS NULL JOIN journal_year y ON y.id = c.journal_year_id
     WHERE k.read_id = ? AND k.deleted_at IS NULL ORDER BY y.year DESC, c.sort_order, c.created_at, c.rowid`, [readId]);
  if (!rows.length) return [];
  const progress = new Map((await listChallengesAnyYear(db)).map((c) => [c.id, c]));
  return rows.map(({ rstatus, ...r }) => ({ ...r, planned: rstatus !== 'finished', word: !!r.word, label: r.label || `Square ${r.position + 1}`, done: progress.get(r.challenge_id)?.done ?? 0, total: progress.get(r.challenge_id)?.total ?? 0 }));
}

async function listChallengesAnyYear(db: Db) {
  const years = await db.select<{ year: number }>('SELECT year FROM journal_year WHERE deleted_at IS NULL');
  return (await Promise.all(years.map((y) => listChallenges(db, y.year)))).flat();
}

export interface ChoiceSlot { id: string; label: string; group: string | null; taken: string | null }
export interface ChallengeChoice { id: string; name: string; kind: ChallengeKind; color: string | null; year: number; current_slot_id: string | null; slots: ChoiceSlot[]; word: boolean; theme: string | null; letters: Record<string, string>; limit: number | null; used: number }

// Every published challenge in the given years with its prompts, saying which prompt this read is on and which prompts already hold another book.
export async function listChallengeChoices(db: Db, readId: string, years: number[]): Promise<ChallengeChoice[]> {
  if (!years.length) return [];
  const cs = await db.select<{ id: string; name: string; kind: ChallengeKind; color: string | null; year: number; word: number; theme: string | null; limit: number | null }>(
    `SELECT c.word_builder AS word, c.word_theme AS theme, c.word_target AS "limit", c.id AS id, c.name AS name, c.kind AS kind, c.color AS color, y.year AS year FROM challenge c JOIN journal_year y ON y.id = c.journal_year_id
     WHERE c.deleted_at IS NULL AND y.deleted_at IS NULL AND c.published = 1 AND y.year IN (${years.map(() => '?').join(',')}) ORDER BY y.year DESC, c.sort_order, c.created_at, c.rowid`, years);
  const out: ChallengeChoice[] = [];
  for (const c of cs) {
    const rows = await db.select<{ id: string; label: string; position: number; is_free: number; art: string | null; group: string | null; taken: string | null; taken_read: string | null }>(
      `SELECT s.id AS id, s.label AS label, s.position AS position, s.is_free AS is_free, s.art_image_id AS art,
         (SELECT g.name FROM challenge_group g WHERE g.id = s.group_id AND g.deleted_at IS NULL) AS "group",
         (SELECT b.title FROM challenge_completion k JOIN read r ON r.id = k.read_id AND r.deleted_at IS NULL JOIN book b ON b.id = r.book_id WHERE k.slot_id = s.id AND k.deleted_at IS NULL) AS taken,
         (SELECT k.read_id FROM challenge_completion k WHERE k.slot_id = s.id AND k.deleted_at IS NULL) AS taken_read
       FROM challenge_slot s LEFT JOIN challenge_group g ON g.id = s.group_id AND g.deleted_at IS NULL
       WHERE s.challenge_id = ? AND s.deleted_at IS NULL ORDER BY (g.id IS NOT NULL), g.position, g.created_at, g.rowid, s.position`, [c.id]);
    const counted = rows.filter((r) => countsTowardTracker({ is_free: !!r.is_free, label: r.label, art: r.art }));
    out.push({
      id: c.id, name: c.name, kind: c.kind, color: c.color, year: c.year, word: !!c.word, theme: c.theme, limit: c.word ? c.limit : null, used: counted.length, letters: c.word ? await letterMap(db, c.id) : {}, current_slot_id: counted.find((r) => r.taken_read === readId)?.id ?? null,
      slots: counted.map((r) => ({ id: r.id, label: r.label || `Square ${r.position + 1}`, group: r.group, taken: r.taken_read && r.taken_read !== readId ? r.taken : null })),
    });
  }
  return out;
}

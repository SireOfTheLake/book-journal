import type { Db } from '../db/adapter';
import { BINGO_OUT_OF_WINDOW_SQL, fillSlot } from './challenges';
import type { Fit, SlotInfo } from '../domain/boardGame/challengePrompts';
import type { Extras } from '../domain/boardGame/prompts';
import type { Board, Pick, Pools } from '../domain/boardGame/board';

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const PREFIX = 'boardgame_board_';

// Boards are kept as settings (one per board), so they sync with the rest of the journal's settings and need no new table.
export async function saveBoard(db: Db, b: Board): Promise<void> {
  await db.execute(`INSERT INTO app_setting (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = ${NOW}`, [PREFIX + b.id, JSON.stringify(b)]);
}
export async function listBoards(db: Db): Promise<Board[]> {
  const rows = await db.select<{ value: string }>('SELECT value FROM app_setting WHERE key LIKE ? ORDER BY key', [`${PREFIX}%`]);
  const out: Board[] = [];
  for (const r of rows) { try { const b = JSON.parse(r.value) as Board; if (b?.v === 1 && Array.isArray(b.tiles)) out.push(b); } catch { /* a damaged board is skipped */ } }
  return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}
export const deleteBoard = (db: Db, id: string) => db.execute('DELETE FROM app_setting WHERE key = ?', [PREFIX + id]);

const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
/** The things in your own journal that boards draw on: tags, jobs and places you use, unfinished challenge prompts, and the prompts you saved. */
export async function loadExtras(db: Db, year: number): Promise<Extras> {
  const names = async (sql: string, params: (string | number)[] = []) => (await db.select<{ n: string }>(sql, params)).map((r) => r.n);
  const [occupations, tropes, places, yours, rows, tours] = await Promise.all([
    names(`SELECT o.name AS n FROM character_occupation co JOIN occupation o ON o.id = co.occupation_id WHERE co.deleted_at IS NULL AND o.deleted_at IS NULL GROUP BY o.name HAVING count(*) >= 2 ORDER BY count(*) DESC LIMIT 80`),
    names('SELECT name AS n FROM trope WHERE deleted_at IS NULL'),
    names(`SELECT DISTINCT country AS n FROM place WHERE deleted_at IS NULL AND country IS NOT NULL AND country <> '' LIMIT 60`),
    names('SELECT text AS n FROM randomizer_prompt WHERE deleted_at IS NULL'),
    // Every open prompt of a published challenge: not filled, not a bonus or free square, and a bingo only while its dates are on.
    db.select<{ challengeId: string; slotId: string; challenge: string; label: string; kind: string; categoryId: string | null; categoryName: string | null; grp: string | null; optional: number; sticker: number }>(
      `SELECT c.id AS challengeId, s.id AS slotId, c.name AS challenge, s.label AS label, c.kind AS kind, c.category_id AS categoryId, cat.name AS categoryName,
         (SELECT g.name FROM challenge_group g WHERE g.id = s.group_id AND g.deleted_at IS NULL) AS grp, COALESCE(s.is_optional, 0) AS optional, (s.art_image_id IS NOT NULL) AS sticker
       FROM challenge_slot s JOIN challenge c ON c.id = s.challenge_id JOIN journal_year y ON y.id = c.journal_year_id
         LEFT JOIN challenge_category cat ON cat.id = c.category_id AND cat.deleted_at IS NULL
       WHERE y.year = ? AND y.deleted_at IS NULL AND c.deleted_at IS NULL AND c.published = 1 AND s.deleted_at IS NULL AND s.is_free = 0 AND COALESCE(s.is_bonus, 0) = 0 AND lower(s.label) NOT LIKE 'bonus%' AND NOT ${BINGO_OUT_OF_WINDOW_SQL}
         AND NOT EXISTS (SELECT 1 FROM challenge_completion cc WHERE cc.slot_id = s.id AND cc.deleted_at IS NULL)
       ORDER BY c.sort_order, s.position`, [year, localToday(), localToday()]),
    // A World Tour: a Word Builder of countries has no prompts to list, but a space can say "read a book from a new country, then add it".
    db.select<{ challengeId: string; challenge: string; categoryId: string | null; categoryName: string | null }>(
      `SELECT c.id AS challengeId, c.name AS challenge, c.category_id AS categoryId, cat.name AS categoryName FROM challenge c JOIN journal_year y ON y.id = c.journal_year_id
         LEFT JOIN challenge_category cat ON cat.id = c.category_id AND cat.deleted_at IS NULL
       WHERE y.year = ? AND y.deleted_at IS NULL AND c.deleted_at IS NULL AND c.published = 1 AND c.word_builder = 1 AND (lower(COALESCE(c.word_theme, '')) LIKE '%countr%' OR lower(c.name) LIKE '%world tour%')
         AND (c.word_target IS NULL OR c.allow_bonus = 1 OR (SELECT count(*) FROM challenge_slot x WHERE x.challenge_id = c.id AND x.deleted_at IS NULL AND x.is_free = 0) < c.word_target)`, [year]),
  ]);
  const slots: SlotInfo[] = [
    ...rows.map((r) => ({ challengeId: r.challengeId, slotId: r.slotId, challenge: r.challenge, label: r.label, group: r.grp, kind: r.kind, categoryId: r.categoryId, categoryName: r.categoryName, optional: !!r.optional, sticker: !!r.sticker })),
    ...tours.map((r) => ({ challengeId: r.challengeId, slotId: null, challenge: r.challenge, label: 'a new country', group: null, kind: 'sticker', categoryId: r.categoryId, categoryName: r.categoryName, word: true })),
  ];
  return { occupations, tropes, places, yours, slots, challenge: rows.map((s) => ({ challenge: s.challenge, label: s.label })) };
}

/** The sticker pictures of some prompts (slot id to picture), for showing next to a prompt. Only the ones asked for are read, since stickers are large. */
export async function getStickers(db: Db, slotIds: string[]): Promise<Record<string, string>> {
  const ids = [...new Set(slotIds.filter(Boolean))];
  if (!ids.length) return {};
  const rows = await db.select<{ id: string; art: string }>(
    `SELECT s.id AS id, im.file_path AS art FROM challenge_slot s JOIN image im ON im.id = s.art_image_id AND im.deleted_at IS NULL WHERE s.id IN (${ids.map(() => '?').join(',')}) AND im.file_path <> ''`, ids);
  return Object.fromEntries(rows.map((r) => [r.id, r.art]));
}

export interface FitResult { added: string[]; skipped: string[] }
/** Puts a book on every challenge prompt a space also fills. A prompt that already holds another book, or sits in a category the book is already in, is left alone and reported. */
export async function applyFits(db: Db, fits: Fit[], readId: string): Promise<FitResult> {
  const out: FitResult = { added: [], skipped: [] };
  for (const f of fits) {
    if (!f.auto || !f.slotId) continue;
    const name = `${f.challenge}: ${f.label}`;
    try {
      const [taken] = await db.select<{ n: number }>('SELECT count(*) AS n FROM challenge_completion WHERE slot_id = ? AND deleted_at IS NULL AND read_id <> ?', [f.slotId, readId]);
      if (Number(taken?.n)) { out.skipped.push(`${name} (already has a book)`); continue; }
      await fillSlot(db, f.slotId, readId);
      out.added.push(name);
    } catch (e) { out.skipped.push(`${name} (${e instanceof Error ? e.message.replace(/^This book is already on /, 'already on ').replace(/\. A book counts.*$/, '') : 'could not be added'})`); }
  }
  return out;
}

interface SeriesBook { id: string; title: string; position: number | null; series: string; finished: number; active: number }
/** The next unread book of each series you have started, and a sample of the TBR. */
export async function loadPools(db: Db): Promise<Pools> {
  const books = await db.select<SeriesBook>(
    `SELECT b.id AS id, b.title AS title, b.series_position AS position, s.title AS series,
       (SELECT count(*) FROM read r WHERE r.book_id = b.id AND r.deleted_at IS NULL AND r.status = 'finished') AS finished,
       (SELECT count(*) FROM read r WHERE r.book_id = b.id AND r.deleted_at IS NULL AND r.status IN ('reading', 'on_hold', 'dnf')) AS active
     FROM book b JOIN series s ON s.id = b.series_id AND s.deleted_at IS NULL WHERE b.deleted_at IS NULL AND COALESCE(b.is_draft, 0) = 0 ORDER BY s.title, b.series_position`);
  const bySeries = new Map<string, SeriesBook[]>();
  for (const b of books) bySeries.set(b.series, [...(bySeries.get(b.series) ?? []), b]);
  const series: Pick[] = [];
  for (const [name, list] of bySeries) {
    const finished = list.filter((b) => b.finished > 0 && b.position !== null);
    if (finished.length === 0) continue;
    const top = Math.max(...finished.map((b) => b.position as number));
    const next = list.filter((b) => b.finished === 0 && b.active === 0 && b.position !== null && (b.position as number) > top).sort((a, b) => (a.position as number) - (b.position as number))[0];
    if (next) series.push({ title: next.title, detail: `${name}, book ${next.position}`, bookId: next.id });
  }
  const tbr = (await db.select<{ id: string; title: string; authors: string | null }>(
    `SELECT b.id AS id, b.title AS title,
       (SELECT group_concat(x.name, ', ') FROM (SELECT au.name AS name FROM book_author ba JOIN author au ON au.id = ba.author_id WHERE ba.book_id = b.id AND ba.deleted_at IS NULL AND au.deleted_at IS NULL ORDER BY ba.sort_order) x) AS authors
     FROM book b WHERE b.deleted_at IS NULL AND b.shelf = 'tbr' AND COALESCE(b.is_draft, 0) = 0 ORDER BY random() LIMIT 150`)).map((b) => ({ title: b.title, detail: b.authors ?? undefined, bookId: b.id }));
  return { series, tbr };
}

export interface ReadChoice { readId: string; bookId: string; title: string; authors: string | null; status: string; date: string | null }
/** Reads you could use for a space: recent ones first, or the ones matching what you type. */
export async function findReads(db: Db, query: string, since: string | null, exclude: string[], limit = 20): Promise<ReadChoice[]> {
  const q = query.trim().toLowerCase();
  const rows = await db.select<ReadChoice>(
    `SELECT r.id AS readId, b.id AS bookId, b.title AS title, r.status AS status, COALESCE(r.finish_date, r.start_date) AS date,
       (SELECT group_concat(x.name, ', ') FROM (SELECT au.name AS name FROM book_author ba JOIN author au ON au.id = ba.author_id WHERE ba.book_id = b.id AND ba.deleted_at IS NULL AND au.deleted_at IS NULL ORDER BY ba.sort_order) x) AS authors
     FROM read r JOIN book b ON b.id = r.book_id WHERE r.deleted_at IS NULL AND b.deleted_at IS NULL AND r.status IN ('finished', 'reading')
       ${q ? 'AND lower(b.title) LIKE ?' : since ? 'AND COALESCE(r.finish_date, r.start_date) >= ?' : ''}
     ORDER BY COALESCE(r.finish_date, r.start_date) DESC, r.created_at DESC LIMIT 200`, q ? [`%${q}%`] : since ? [since] : []);
  return rows.filter((r) => !exclude.includes(r.readId)).slice(0, limit);
}

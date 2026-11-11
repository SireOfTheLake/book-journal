import type { Db } from '../db/adapter';

// Everything about the challenges, as plain data, so it can be saved to a file and analysed elsewhere.
export interface ExportedPrompt {
  position: number; prompt: string; kind: 'required' | 'bonus' | 'optional'; subcategory: string | null; note: string | null;
  sticker: string | null; // the sticker picture as a data URL, when pictures are included
  has_sticker: boolean;
  book: { title: string; authors: string | null; status: string; started: string | null; finished: string | null; rating_stars: number | null } | null;
}
export interface ExportedChallenge {
  year: number; name: string; type: string; description: string | null; color: string | null;
  prompts_needed: number | null; bingo_goal: number | null; word_theme: string | null; word_target: number | null; bingo_bank: string | null;
  subcategories: string[]; prompts: ExportedPrompt[]; letters: Record<string, string> | null;
  totals: { prompts: number; with_book: number; finished: number };
}
export interface ChallengeExport { exported_at: string; includes_sticker_pictures: boolean; challenges: ExportedChallenge[] }

const TYPE: Record<string, string> = { grid: 'Grid', sticker: 'Sticker', bingo: 'Bingo' };

export async function exportChallenges(db: Db, opts: { pictures: boolean; year?: number }): Promise<ChallengeExport> {
  const cs = await db.select<{ id: string; year: number; name: string; kind: string; color: string | null; description: string | null; word: number; pyramid: number; theme: string | null; target: number | null; usMap: number; region: string | null; required: number | null; goal: number | null; bank: string | null }>(
    `SELECT c.id AS id, y.year AS year, c.name AS name, c.kind AS kind, c.color AS color, c.description AS description, c.word_builder AS word, c.pyramid AS pyramid, c.word_theme AS theme, c.word_target AS target,
       c.us_map AS usMap, c.map_region AS region, c.required_count AS required, c.bingo_goal AS goal, (SELECT b.name FROM bingo_bank b WHERE b.id = c.bank_id AND b.deleted_at IS NULL) AS bank
     FROM challenge c JOIN journal_year y ON y.id = c.journal_year_id
     WHERE c.deleted_at IS NULL AND y.deleted_at IS NULL${opts.year === undefined ? '' : ' AND y.year = ?'} ORDER BY y.year, c.sort_order, c.created_at, c.rowid`, opts.year === undefined ? [] : [opts.year]);
  const out: ExportedChallenge[] = [];
  for (const c of cs) {
    const groups = await db.select<{ id: string; name: string }>('SELECT id, name FROM challenge_group WHERE challenge_id = ? AND deleted_at IS NULL ORDER BY position, created_at, rowid', [c.id]);
    const rows = await db.select<{ label: string; position: number; group_id: string | null; is_bonus: number; is_optional: number; art: string | null; note: string | null; title: string | null; status: string | null; started: string | null; finished: string | null; rating: number | null; authors: string | null }>(
      `SELECT s.label AS label, s.position AS position, s.group_id AS group_id, s.is_bonus AS is_bonus, s.is_optional AS is_optional, im.file_path AS art, k.note AS note,
         b.title AS title, r.status AS status, r.start_date AS started, r.finish_date AS finished, r.rating AS rating,
         (SELECT group_concat(x.name, ', ') FROM (SELECT au.name AS name FROM book_author ba JOIN author au ON au.id = ba.author_id WHERE ba.book_id = b.id AND ba.deleted_at IS NULL AND au.deleted_at IS NULL ORDER BY ba.sort_order) x) AS authors
       FROM challenge_slot s
       LEFT JOIN image im ON im.id = s.art_image_id AND im.deleted_at IS NULL
       LEFT JOIN challenge_completion k ON k.slot_id = s.id AND k.deleted_at IS NULL
       LEFT JOIN read r ON r.id = k.read_id AND r.deleted_at IS NULL
       LEFT JOIN book b ON b.id = r.book_id AND b.deleted_at IS NULL
       WHERE s.challenge_id = ? AND s.deleted_at IS NULL ORDER BY s.position`, [c.id]);
    const letters = c.word ? (await db.select<{ letter: string; file_path: string }>(
      'SELECT l.letter AS letter, i.file_path AS file_path FROM challenge_letter l JOIN image i ON i.id = l.image_id AND i.deleted_at IS NULL WHERE l.challenge_id = ? AND l.deleted_at IS NULL ORDER BY l.letter', [c.id])) : [];
    const prompts: ExportedPrompt[] = rows.map((r) => ({
      position: Number(r.position), prompt: r.label, kind: r.is_optional ? 'optional' : r.is_bonus ? 'bonus' : 'required',
      subcategory: groups.find((g) => g.id === r.group_id)?.name ?? null, note: r.note,
      sticker: opts.pictures ? r.art : null, has_sticker: !!r.art,
      book: r.title ? { title: r.title, authors: r.authors, status: r.status ?? '', started: r.started, finished: r.finished, rating_stars: r.rating === null ? null : r.rating / 4 } : null,
    }));
    out.push({
      year: Number(c.year), name: c.name,
      type: c.word ? 'Word Builder' : c.pyramid ? 'Pyramid' : c.usMap ? `Map${c.region ? ` (${c.region})` : ''}` : TYPE[c.kind] ?? c.kind,
      description: c.description, color: c.color, prompts_needed: c.required, bingo_goal: c.goal, word_theme: c.theme, word_target: c.target, bingo_bank: c.bank,
      subcategories: groups.map((g) => g.name), prompts,
      letters: c.word ? Object.fromEntries(letters.map((l) => [l.letter, opts.pictures ? l.file_path : 'picture'])) : null,
      totals: { prompts: prompts.length, with_book: prompts.filter((p) => p.book).length, finished: prompts.filter((p) => p.book?.status === 'finished').length },
    });
  }
  return { exported_at: new Date().toISOString(), includes_sticker_pictures: opts.pictures, challenges: out };
}

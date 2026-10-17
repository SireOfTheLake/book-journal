import type { Db } from '../db/adapter';
import { newId } from '../domain/ids';
import { first } from '../import/writer';

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
export interface Cand { read_id: string; book_id: string; title: string; authors: string | null; stars: number | null; finish_date: string; cover: string | null }
export interface BracketMonth { month: number; candidates: Cand[]; pick: Cand | null; suggested: string | null }
export interface BracketQuarter { quarter: number; months: BracketMonth[]; w1: Cand | null; w2: Cand | null; best: Cand | null; w1Options: Cand[]; w2Options: Cand[]; bestOptions: Cand[] }
export interface BracketHalf { half: number; best: Cand | null; options: Cand[] }
export interface Bracket { year: number; yearId: string; quarters: BracketQuarter[]; halves: BracketHalf[]; champion: Cand | null; championOptions: Cand[] }

export async function ensureJournalYear(db: Db, year: number): Promise<string> {
  const id = await first(db, 'SELECT id FROM journal_year WHERE year = ? AND deleted_at IS NULL', [year]);
  if (id) return id;
  const nid = newId();
  await db.execute('INSERT INTO journal_year (id, year) VALUES (?, ?)', [nid, year]);
  return nid;
}

interface Raw {
  yearId: string; candidates: Cand[][]; month: Map<number, string>; match: Map<string, string>; quarter: Map<number, string>; half: Map<number, string>; year: string | null;
}

async function loadRaw(db: Db, year: number): Promise<Raw> {
  const yearId = await ensureJournalYear(db, year);
  const rows = await db.select<Cand>(
    `SELECT r.id AS read_id, b.id AS book_id, b.title AS title, r.finish_date AS finish_date, r.rating / 4.0 AS stars,
       (SELECT group_concat(x.name, ', ') FROM (SELECT au.name AS name FROM book_author ba JOIN author au ON au.id = ba.author_id WHERE ba.book_id = b.id AND ba.deleted_at IS NULL ORDER BY ba.sort_order) x) AS authors,
       (SELECT i.file_path FROM image i WHERE i.id = b.cover_image_id AND i.deleted_at IS NULL) AS cover
     FROM read r JOIN book b ON b.id = r.book_id WHERE r.deleted_at IS NULL AND b.deleted_at IS NULL AND r.status = 'finished' AND substr(r.finish_date, 1, 4) = ?
     ORDER BY r.rating IS NULL, r.rating DESC, r.finish_date, r.rowid`, [String(year)]);
  const candidates: Cand[][] = Array.from({ length: 12 }, () => []);
  for (const r of rows) candidates[Number(r.finish_date.slice(5, 7)) - 1].push(r);
  const raw: Raw = { yearId, candidates, month: new Map(), match: new Map(), quarter: new Map(), half: new Map(), year: null };
  for (const p of await db.select<{ level: string; period: number; read_id: string }>('SELECT level, period, read_id FROM bracket_pick WHERE journal_year_id = ? AND deleted_at IS NULL', [yearId])) {
    if (p.level === 'month') raw.month.set(p.period, p.read_id);
    else if (p.level === 'quarter') raw.quarter.set(p.period, p.read_id);
    else if (p.level === 'half') raw.half.set(p.period, p.read_id);
    else if (p.level === 'year') raw.year = p.read_id;
  }
  for (const m of await db.select<{ quarter: number; match: number; read_id: string }>('SELECT quarter, match, read_id FROM bracket_match_winner WHERE journal_year_id = ? AND deleted_at IS NULL', [yearId])) raw.match.set(`${m.quarter}.${m.match}`, m.read_id);
  return raw;
}

// Works out the bracket from what is stored, dropping any pick that is no longer allowed
// (for example a winner whose book was replaced as the month's best).
function resolve(raw: Raw, year: number): { bracket: Bracket; stale: { table: 'pick' | 'match'; level?: string; period: number; match?: number }[] } {
  const stale: { table: 'pick' | 'match'; level?: string; period: number; match?: number }[] = [];
  const months: BracketMonth[] = raw.candidates.map((cands, i) => {
    const want = raw.month.get(i + 1);
    const pick = cands.find((c) => c.read_id === want) ?? null;
    if (want && !pick) stale.push({ table: 'pick', level: 'month', period: i + 1 });
    return { month: i + 1, candidates: cands, pick, suggested: cands.find((c) => c.stars !== null)?.read_id ?? null };
  });
  // The books in a match, without listing the same book twice (a book can win both of its matches).
  const present = (...xs: (Cand | null)[]) => xs.filter((x, i): x is Cand => x !== null && xs.findIndex((y) => y?.read_id === x.read_id) === i);
  const choose = (want: string | undefined, options: Cand[], drop: () => void): Cand | null => {
    const hit = options.find((o) => o.read_id === want) ?? null;
    if (want && !hit) drop();
    return hit;
  };
  const quarters: BracketQuarter[] = [1, 2, 3, 4].map((q) => {
    const [a, b, c] = months.slice((q - 1) * 3, q * 3);
    const w1Options = present(a.pick, b.pick), w2Options = present(b.pick, c.pick);
    const w1 = choose(raw.match.get(`${q}.1`), w1Options, () => stale.push({ table: 'match', period: q, match: 1 }));
    const w2 = choose(raw.match.get(`${q}.2`), w2Options, () => stale.push({ table: 'match', period: q, match: 2 }));
    const bestOptions = present(w1, w2);
    const best = choose(raw.quarter.get(q), bestOptions, () => stale.push({ table: 'pick', level: 'quarter', period: q }));
    return { quarter: q, months: [a, b, c], w1, w2, best, w1Options, w2Options, bestOptions };
  });
  const halves: BracketHalf[] = [1, 2].map((h) => {
    const options = present(quarters[2 * h - 2].best, quarters[2 * h - 1].best);
    return { half: h, options, best: choose(raw.half.get(h), options, () => stale.push({ table: 'pick', level: 'half', period: h })) };
  });
  const championOptions = present(halves[0].best, halves[1].best);
  const champion = choose(raw.year ?? undefined, championOptions, () => stale.push({ table: 'pick', level: 'year', period: 1 }));
  return { bracket: { year, yearId: raw.yearId, quarters, halves, champion, championOptions }, stale };
}

export async function getBracket(db: Db, year: number): Promise<Bracket> {
  return resolve(await loadRaw(db, year), year).bracket;
}

async function save(db: Db, yearId: string, level: string, period: number, readId: string | null) {
  const existing = await first(db, 'SELECT id FROM bracket_pick WHERE journal_year_id = ? AND level = ? AND period = ? AND deleted_at IS NULL', [yearId, level, period]);
  if (!readId) { if (existing) await db.execute(`UPDATE bracket_pick SET deleted_at = ${NOW} WHERE id = ?`, [existing]); return; }
  if (existing) await db.execute('UPDATE bracket_pick SET read_id = ? WHERE id = ?', [readId, existing]);
  else await db.execute('INSERT INTO bracket_pick (id, journal_year_id, level, period, read_id) VALUES (?, ?, ?, ?, ?)', [newId(), yearId, level, period, readId]);
}
async function saveMatch(db: Db, yearId: string, quarter: number, match: number, readId: string | null) {
  const existing = await first(db, 'SELECT id FROM bracket_match_winner WHERE journal_year_id = ? AND quarter = ? AND match = ? AND deleted_at IS NULL', [yearId, quarter, match]);
  if (!readId) { if (existing) await db.execute(`UPDATE bracket_match_winner SET deleted_at = ${NOW} WHERE id = ?`, [existing]); return; }
  if (existing) await db.execute('UPDATE bracket_match_winner SET read_id = ? WHERE id = ?', [readId, existing]);
  else await db.execute('INSERT INTO bracket_match_winner (id, journal_year_id, quarter, match, read_id) VALUES (?, ?, ?, ?, ?)', [newId(), yearId, quarter, match, readId]);
}

// After any change, remove picks that depend on a book that is no longer in their match.
async function prune(db: Db, year: number) {
  for (let i = 0; i < 6; i++) {
    const raw = await loadRaw(db, year);
    const { stale } = resolve(raw, year);
    if (!stale.length) return;
    for (const s of stale) {
      if (s.table === 'match') await saveMatch(db, raw.yearId, s.period, s.match!, null);
      else await save(db, raw.yearId, s.level!, s.period, null);
    }
  }
}

function allow(options: Cand[], readId: string | null) {
  if (readId !== null && !options.some((o) => o.read_id === readId)) throw new Error('That book is not in this match.');
}

export async function setMonthPick(db: Db, year: number, month: number, readId: string | null) {
  const b = await getBracket(db, year);
  allow(b.quarters[Math.floor((month - 1) / 3)].months[(month - 1) % 3].candidates, readId);
  await save(db, b.yearId, 'month', month, readId);
  await prune(db, year);
}
export async function setMatchWinner(db: Db, year: number, quarter: number, match: 1 | 2, readId: string | null) {
  const b = await getBracket(db, year);
  const q = b.quarters[quarter - 1];
  allow(match === 1 ? q.w1Options : q.w2Options, readId);
  await saveMatch(db, b.yearId, quarter, match, readId);
  await prune(db, year);
}
export async function setQuarterPick(db: Db, year: number, quarter: number, readId: string | null) {
  const b = await getBracket(db, year);
  allow(b.quarters[quarter - 1].bestOptions, readId);
  await save(db, b.yearId, 'quarter', quarter, readId);
  await prune(db, year);
}
export async function setHalfPick(db: Db, year: number, half: number, readId: string | null) {
  const b = await getBracket(db, year);
  allow(b.halves[half - 1].options, readId);
  await save(db, b.yearId, 'half', half, readId);
  await prune(db, year);
}
export async function setYearPick(db: Db, year: number, readId: string | null) {
  const b = await getBracket(db, year);
  allow(b.championOptions, readId);
  await save(db, b.yearId, 'year', 1, readId);
  await prune(db, year);
}

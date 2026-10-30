import type { Db } from '../db/adapter';
import { SHOWN_SQL } from '../domain/challenges';
import { isMapId, type MapId } from '../domain/maps';
import { BOOK_GENRE_ROLLUP } from './genreRollup';
import { challengeMix, type ChallengeMix, countMakeups, dayBefore, firstName, nonUsCountry, usState, monthRange, pageDots, sourceMix, splitProgress, starDots, topCounts, uniqueCounts, type Counted, type DotColumn, type Split, type SourceMix } from '../domain/dashboard';
import { metricInfo, type Metric } from '../domain/goals';
import { getCovers } from './library';
import { letterMap, listChallenges } from './challenges';
import { wordLetters } from '../domain/words';
import { listGoals, loadFacts, measure, seriesContinued, seriesFinishedIn, seriesStarted, streaksForYear, type Facts } from './goals';
import { getMonthChart } from './monthChart';
import type { Run } from '../domain/streaks';

export interface MonthBook {
  read_id: string; book_id: string; title: string; authors: string[]; pages: number | null; audio_seconds: number | null; rating: number | null;
  format: 'physical' | 'audio' | 'ebook' | null; source: string | null; source_color: string | null; start_date: string | null; finish_date: string; favorite: boolean; bucket: string;
}
export interface GoalSplit {
  id: string; label: string; metric: Metric; unit: string; target: number; timed: boolean; from: string; to: string;
  before: number; month: number; total: number; split: Split;
}
export type WordTile = { letter: string; src: string | null } | null; // null = the blank for a space
export interface Sticker { region?: MapId; challenge_id: string; challenge: string; kind: string; label: string; art: string | null; cover: string | null; color: string | null; book_id: string; title: string; note?: string | null; word?: WordTile[]; usMap?: boolean } // word: a Word Builder entry, spelled out in letter stickers
export interface ChallengeMonth { id: string; name: string; kind: string; color: string | null; total: number; before: number; month: number; split: Split }

export interface DashboardCore {
  year: number; from: string; to: string;
  books: MonthBook[]; covers: Record<string, string>;
  totals: { books: number; pages: number; audioHours: number; dnf: number; avgStars: number | null; rated: number; avgPages: number | null; avgDays: number | null };
  goals: GoalSplit[];
  challenges: ChallengeMonth[]; stickers: Sticker[];
  top: { authors: Counted[]; genres: Counted[]; tropes: Counted[]; states: Counted[]; countries: Counted[]; characters: Counted[]; jobs: Counted[] };
  favorites: MonthBook[];
  shortest: MonthBook | null; longest: MonthBook | null; shortestAudio: MonthBook | null; longestAudio: MonthBook | null;
  makeups: Counted[]; pageDots: { columns: DotColumn[]; max: number }; starDots: DotColumn[]; sourceMix: SourceMix[]; challengeMix: ChallengeMix[];
  series: { started: { id: string; title: string }[]; continued: { id: string; title: string; books: number }[]; finished: { id: string; title: string }[] };
}

const marks = (ids: string[]) => ids.map(() => '?').join(',');
const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000) + 1;

async function loadMonthBooks(db: Db, from: string, to: string): Promise<MonthBook[]> {
  const rows = await db.select<{ read_id: string; book_id: string; title: string; pages: number | null; audio: number | null; rating: number | null; format: MonthBook['format']; source: string | null; source_color: string | null; start_date: string | null; finish_date: string; favorite: number; bucket: string | null }>(
    `SELECT r.id AS read_id, b.id AS book_id, b.title AS title, b.page_count AS pages, r.audio_length_seconds AS audio, r.rating AS rating, r.format AS format,
       (SELECT s.name FROM source s WHERE s.id = r.source_id) AS source, (SELECT s.color FROM source s WHERE s.id = r.source_id) AS source_color, r.start_date AS start_date, r.finish_date AS finish_date, b.is_favorite AS favorite,
       (SELECT v.dashboard_bucket FROM v_book_bucket v WHERE v.book_id = b.id) AS bucket
     FROM read r JOIN book b ON b.id = r.book_id AND b.deleted_at IS NULL
     WHERE r.deleted_at IS NULL AND r.status = 'finished' AND r.finish_date BETWEEN ? AND ? ORDER BY r.finish_date, COALESCE(r.finish_time, ''), r.created_at, r.rowid`, [from, to]);
  if (!rows.length) return [];
  const ids = [...new Set(rows.map((r) => r.book_id))];
  const authors = await db.select<{ b: string; n: string }>(`SELECT ba.book_id AS b, au.name AS n FROM book_author ba JOIN author au ON au.id = ba.author_id AND au.deleted_at IS NULL WHERE ba.deleted_at IS NULL AND ba.book_id IN (${marks(ids)}) ORDER BY ba.sort_order`, ids);
  return rows.map((r) => ({
    read_id: r.read_id, book_id: r.book_id, title: r.title, authors: authors.filter((a) => a.b === r.book_id).map((a) => a.n), pages: r.pages, audio_seconds: r.audio, rating: r.rating,
    format: r.format, source: r.source, source_color: r.source_color, start_date: r.start_date, finish_date: r.finish_date, favorite: !!r.favorite, bucket: r.bucket ?? 'unknown',
  }));
}

// Per-book tag lists for the month's books: { bookId: [names] }.
async function perBook(db: Db, sql: string, ids: string[], pick: (r: { n: string | null; c: string | null }) => string | null = (r) => r.n) {
  const map = new Map<string, string[]>();
  if (!ids.length) return map;
  for (const r of await db.select<{ b: string; n: string | null; c: string | null }>(sql, ids)) { const v = pick(r); if (v) (map.get(r.b) ?? map.set(r.b, []).get(r.b)!).push(v); }
  return map;
}

// Challenge prompts filled by reads, with the date of the read (finish date, else start date).
async function loadCompletions(db: Db, year: number) {
  return db.select<{ challenge_id: string; slot_id: string; label: string; position: number; slot_color: string | null; kind: string; read_id: string; book_id: string; title: string; date: string | null; art_id: string | null; cover_id: string | null; word: number; us_map: number; map_region: string | null; note: string | null }>(
    `SELECT k.note AS note, c.us_map AS us_map, c.map_region AS map_region, c.word_builder AS word, c.id AS challenge_id, s.id AS slot_id, s.label AS label, s.position AS position, s.color AS slot_color, c.kind AS kind, k.read_id AS read_id, b.id AS book_id, b.title AS title,
       COALESCE(r.finish_date, r.start_date) AS date, s.art_image_id AS art_id, b.cover_image_id AS cover_id
     FROM challenge_completion k JOIN challenge_slot s ON s.id = k.slot_id AND s.deleted_at IS NULL
       JOIN challenge c ON c.id = k.challenge_id AND c.deleted_at IS NULL JOIN journal_year y ON y.id = c.journal_year_id AND y.year = ? AND y.deleted_at IS NULL
       JOIN read r ON r.id = k.read_id AND r.deleted_at IS NULL JOIN book b ON b.id = r.book_id AND b.deleted_at IS NULL
     WHERE k.deleted_at IS NULL AND r.status = 'finished' AND ${SHOWN_SQL} ORDER BY COALESCE(r.finish_date, r.start_date), COALESCE(r.finish_time, ''), r.created_at, r.rowid, c.sort_order, c.created_at, c.rowid, s.position`, [year]);
}

function goalSplit(f: Facts, g: Awaited<ReturnType<typeof listGoals>>[number], year: number, from: string, to: string, prevEnd: string, completions: Awaited<ReturnType<typeof loadCompletions>>, totals: Map<string, number>): GoalSplit | null {
  const gFrom = g.start_date ?? `${year}-01-01`;
  const gTo = g.end_date ?? `${year}-12-31`;
  if (gFrom > to || gTo < from) return null; // the goal does not cover this month
  let before: number; let through: number; let target = g.target;
  if (g.metric === 'challenges') {
    const mine = g.challenge_ids;
    const ids = new Set([...totals.keys()].filter((id) => !mine || mine.includes(id)));
    target = [...ids].reduce((n, id) => n + (totals.get(id) ?? 0), 0);
    const done = completions.filter((c) => ids.has(c.challenge_id));
    before = done.filter((c) => !c.date || c.date <= prevEnd).length;
    through = done.filter((c) => !c.date || c.date <= to).length;
  } else {
    const upTo = (end: string) => (end < gFrom ? 0 : measure(f, g.metric, g.filters, gFrom, end < gTo ? end : gTo));
    before = upTo(prevEnd); through = upTo(to);
  }
  const round = (n: number) => (g.metric === 'audio_hours' ? Math.round(n * 10) / 10 : Math.round(n));
  const b = round(before); const t = round(through);
  const m = Math.max(0, round(t - b));
  return { id: g.id, label: g.label, metric: g.metric, unit: metricInfo(g.metric).unit, target, timed: !!(g.start_date || g.end_date), from: gFrom, to: gTo, before: b, month: m, total: t, split: splitProgress({ before: b, month: m, target }) };
}

export interface MonthlyDashboard extends DashboardCore { month: number }
export const getMonthlyDashboard = async (db: Db, year: number, month: number): Promise<MonthlyDashboard> => {
  const { from, to } = monthRange(year, month);
  return { ...(await buildDashboard(db, year, from, to, 3)).core, month };
};

interface Built { core: DashboardCore; f: Facts; completions: Awaited<ReturnType<typeof loadCompletions>>; totals: Map<string, number>; summaries: Awaited<ReturnType<typeof listChallenges>> }

// Everything on a dashboard for the period from..to. Goals and challenges are split into progress made before the period and within it.
async function buildDashboard(db: Db, year: number, from: string, to: string, topN: number): Promise<Built> {
  const prevEnd = dayBefore(from);
  const books = await loadMonthBooks(db, from, to);
  const bookIds = [...new Set(books.map((b) => b.book_id))];
  const covers = await getCovers(db, bookIds);
  const ids = bookIds;
  const q = marks(ids);
  const genres = await perBook(db, `SELECT bg.book_id AS b, g.name AS n FROM ${BOOK_GENRE_ROLLUP} bg JOIN genre g ON g.id = bg.genre_id AND g.deleted_at IS NULL WHERE bg.deleted_at IS NULL AND bg.book_id IN (${q})`, ids);
  const tropes = await perBook(db, `SELECT bt.book_id AS b, t.name AS n FROM book_trope bt JOIN trope t ON t.id = bt.trope_id AND t.deleted_at IS NULL WHERE bt.deleted_at IS NULL AND bt.book_id IN (${q})`, ids);
  const states = await perBook(db, `SELECT bp.book_id AS b, p.state_region AS n, p.country AS c FROM book_place bp JOIN place p ON p.id = bp.place_id AND p.deleted_at IS NULL WHERE bp.deleted_at IS NULL AND bp.book_id IN (${q})`, ids, (r) => usState(r.n, r.c));
  const countries = await perBook(db, `SELECT bp.book_id AS b, p.country AS n FROM book_place bp JOIN place p ON p.id = bp.place_id AND p.deleted_at IS NULL WHERE bp.deleted_at IS NULL AND bp.book_id IN (${q})`, ids, (r) => nonUsCountry(r.n));
  // main characters, each counted once however many of the month's books they are in (Carl in two Dungeon Crawler Carl books is one Carl)
  const chars = ids.length ? await db.select<{ id: string; n: string }>(`SELECT DISTINCT c.id AS id, c.name AS n FROM book_character bc JOIN character c ON c.id = bc.character_id AND c.deleted_at IS NULL WHERE bc.deleted_at IS NULL AND bc.role = 'main' AND bc.book_id IN (${q})`, ids) : [];
  const jobs = ids.length ? await db.select<{ id: string; n: string }>(`SELECT DISTINCT c.id AS id, o.name AS n FROM book_character bc JOIN character c ON c.id = bc.character_id AND c.deleted_at IS NULL JOIN character_occupation co ON co.character_id = c.id AND co.deleted_at IS NULL JOIN occupation o ON o.id = co.occupation_id AND o.deleted_at IS NULL WHERE bc.deleted_at IS NULL AND bc.role = 'main' AND bc.book_id IN (${q})`, ids) : [];
  // each book counts once per value, however many reads of it there were
  const per = (m: Map<string, string[]>) => bookIds.flatMap((id) => [...new Set(m.get(id) ?? [])]);

  const rated = books.filter((b) => b.rating !== null && b.rating > 0);
  const withPages = books.filter((b) => b.pages);
  const withDays = books.filter((b) => b.start_date && b.start_date <= b.finish_date);
  const [{ n: dnf }] = await db.select<{ n: number }>("SELECT count(*) AS n FROM read WHERE deleted_at IS NULL AND status = 'dnf' AND COALESCE(finish_date, start_date) BETWEEN ? AND ?", [from, to]);
  const f = await loadFacts(db);
  const audioSecs = books.filter((b) => b.format === 'audio').reduce((n, b) => n + (b.audio_seconds ?? 0), 0);

  const completions = await loadCompletions(db, year);
  const summaries = await listChallenges(db, year);
  const totals = new Map(summaries.map((c) => [c.id, c.total]));
  const goals = (await listGoals(db, year)).map((g) => goalSplit(f, g, year, from, to, prevEnd, completions, totals)).filter((g): g is GoalSplit => !!g);

  const challenges: ChallengeMonth[] = summaries.map((c) => {
    const mine = completions.filter((k) => k.challenge_id === c.id);
    const before = mine.filter((k) => !k.date || k.date <= prevEnd).length;
    const through = mine.filter((k) => !k.date || k.date <= to).length;
    return { id: c.id, name: c.name, kind: c.kind, color: c.color, total: c.total, before, month: through - before, split: splitProgress({ before, month: through - before, target: c.total }) };
  });
  const inMonth = completions.filter((k) => k.date && k.date >= from && k.date <= to);
  const imgIds = [...new Set(inMonth.flatMap((k) => [k.art_id, k.cover_id]).filter((x): x is string => !!x))];
  const imgs = imgIds.length ? new Map((await db.select<{ id: string; file_path: string }>(`SELECT id, file_path FROM image WHERE deleted_at IS NULL AND id IN (${marks(imgIds)})`, imgIds)).map((i) => [i.id, i.file_path])) : new Map<string, string>();
  const nameOf = new Map(summaries.map((c) => [c.id, c.name]));
  const colorOf = new Map(summaries.map((c) => [c.id, c.color]));
  const letterSets = new Map<string, Record<string, string>>();
  for (const id of new Set(inMonth.filter((k) => k.word).map((k) => k.challenge_id))) letterSets.set(id, await letterMap(db, id));
  const stickers: Sticker[] = inMonth.map((k) => ({
    usMap: k.us_map ? true : undefined, region: k.us_map ? (isMapId(k.map_region) ? k.map_region : 'us') : undefined,
    word: k.word ? wordLetters(k.label).map((l) => (l === null ? null : { letter: l, src: letterSets.get(k.challenge_id)?.[l] ?? null })) : undefined,
    challenge_id: k.challenge_id, challenge: nameOf.get(k.challenge_id) ?? '', kind: k.kind, label: k.label || `Square ${k.position + 1}`,
    // a Grid shows the book's cover; Sticker and Bingo show the prompt's picture (Bingo falls back to its colored words)
    art: k.kind === 'grid' ? null : k.art_id ? imgs.get(k.art_id) ?? null : null, cover: k.kind === 'grid' ? (k.cover_id ? imgs.get(k.cover_id) ?? null : null) : null,
    color: k.slot_color, book_id: k.book_id, title: k.title, note: k.note,
  }));

  const byPages = [...withPages].sort((a, b) => a.pages! - b.pages!);
  const audio = books.filter((b) => b.format === 'audio' && b.audio_seconds).sort((a, b) => a.audio_seconds! - b.audio_seconds!);
  const core: DashboardCore = {
    year, from, to, books, covers,
    totals: {
      books: books.length, pages: Math.round(withPages.reduce((n, b) => n + b.pages!, 0)), audioHours: Math.round((audioSecs / 3600) * 10) / 10, dnf: Number(dnf),
      avgStars: rated.length ? rated.reduce((n, b) => n + b.rating!, 0) / rated.length / 4 : null, rated: rated.length,
      avgPages: withPages.length ? Math.round(withPages.reduce((n, b) => n + b.pages!, 0) / withPages.length) : null,
      avgDays: withDays.length ? Math.round((withDays.reduce((n, b) => n + days(b.start_date!, b.finish_date), 0) / withDays.length) * 10) / 10 : null,
    },
    goals, challenges, stickers,
    top: {
      authors: topCounts(books.flatMap((b) => b.authors), topN), genres: topCounts(per(genres), topN), tropes: topCounts(per(tropes), topN), states: topCounts(per(states), topN), countries: topCounts(per(countries), topN),
      characters: uniqueCounts(chars.map((c) => ({ id: c.id, value: firstName(c.n) })), topN), jobs: uniqueCounts(jobs.map((c) => ({ id: c.id, value: c.n })), topN),
    },
    favorites: books.filter((b) => b.favorite || (b.rating ?? 0) >= 20),
    shortest: byPages[0] ?? null, longest: byPages[byPages.length - 1] ?? null, shortestAudio: audio[0] ?? null, longestAudio: audio[audio.length - 1] ?? null,
    makeups: countMakeups(books.map((b) => b.bucket)), pageDots: pageDots(books.map((b) => b.pages)), starDots: starDots(books.map((b) => b.rating)),
    challengeMix: challengeMix(inMonth.map((k) => ({ id: k.challenge_id, name: nameOf.get(k.challenge_id) ?? '', color: colorOf.get(k.challenge_id) ?? null }))),
    sourceMix: sourceMix(books.map((b) => ({ format: b.format, source: b.source, color: b.source_color }))),
    series: {
      started: seriesStarted(f, from, to).map((s) => ({ id: s.id, title: s.title })),
      continued: seriesContinued(f, from, to), finished: seriesFinishedIn(f, from, to).map((s) => ({ id: s.id, title: s.title })),
    },
  };
  return { core, f, completions, totals, summaries };
}


// ---------- the yearly dashboard ----------
export interface YearGoal extends GoalSplit { byMonth: number[] } // byMonth[0] is January; GoalSplit.before holds anything with no date
export interface YearChallenge extends ChallengeMonth { byMonth: number[] }
export interface YearlyDashboard extends DashboardCore {
  months: { month: number; books: number; pages: number }[];
  bestMonth: { month: number; books: number } | null; quietestMonth: { month: number; books: number } | null;
  goals: YearGoal[]; challenges: YearChallenge[];
  streaks: { longestReading: Run | null; longestFinishing: Run | null; longestBreak: Run | null };
}

const monthEnd = (year: number, m: number) => monthRange(year, m).to;

export async function getYearlyDashboard(db: Db, year: number, today: string): Promise<YearlyDashboard> {
  const { from, to } = { from: `${year}-01-01`, to: `${year}-12-31` };
  const { core, f, completions, totals } = await buildDashboard(db, year, from, to, 5);
  const chart = await getMonthChart(db, year);
  const months = chart.map((m) => ({ month: m.month, books: m.books.length, pages: m.pages }));
  const withBooks = months.filter((m) => m.books > 0);
  const best = withBooks.length ? withBooks.reduce((a, b) => (b.books > a.books ? b : a)) : null;
  const quiet = withBooks.length ? withBooks.reduce((a, b) => (b.books < a.books ? b : a)) : null;

  const rows = await listGoals(db, year);
  const goals: YearGoal[] = yearGoals(core, rows, f, completions, totals, year);
  const inYear = (d: string | null, m: number) => !!d && d.slice(0, 7) === `${year}-${String(m).padStart(2, '0')}`;
  const challenges: YearChallenge[] = (await listChallenges(db, year)).map((c) => {
    const mine = completions.filter((k) => k.challenge_id === c.id);
    const byMonth = Array.from({ length: 12 }, (_, i) => mine.filter((k) => inYear(k.date, i + 1)).length);
    const undated = mine.filter((k) => !k.date || k.date < from || k.date > to).length;
    const monthSum = byMonth.reduce((n, x) => n + x, 0);
    return { id: c.id, name: c.name, kind: c.kind, color: c.color, total: c.total, before: undated, month: monthSum, byMonth, split: splitProgress({ before: undated, month: monthSum, target: c.total }) };
  });
  const s = streaksForYear(f, year, today).year;
  return { ...core, months, bestMonth: best ? { month: best.month, books: best.books } : null, quietestMonth: quiet ? { month: quiet.month, books: quiet.books } : null, goals, challenges, streaks: { longestReading: s.any, longestFinishing: s.finished, longestBreak: s.notReading } };
}

// The year's goals with how much each month added (the month before has to be subtracted from the one after).
function yearGoals(core: DashboardCore, rows: Awaited<ReturnType<typeof listGoals>>, f: Facts, completions: Awaited<ReturnType<typeof loadCompletions>>, totals: Map<string, number>, year: number): YearGoal[] {
  const out: YearGoal[] = [];
  for (const g of rows) {
    const split = goalSplit(f, g, year, core.from, core.to, dayBefore(core.from), completions, totals);
    if (!split) continue;
    const gFrom = g.start_date ?? `${year}-01-01`; const gTo = g.end_date ?? `${year}-12-31`;
    let upTo: (end: string) => number;
    if (g.metric === 'challenges') {
      const ids = new Set([...totals.keys()].filter((id) => !g.challenge_ids || g.challenge_ids.includes(id)));
      const mine = completions.filter((c) => ids.has(c.challenge_id));
      upTo = (end) => mine.filter((c) => c.date && c.date <= end).length;
    } else upTo = (end) => (end < gFrom ? 0 : measure(f, g.metric, g.filters, gFrom, end < gTo ? end : gTo));
    const round = (n: number) => (g.metric === 'audio_hours' ? Math.round(n * 10) / 10 : Math.round(n));
    const byMonth: number[] = []; let prev = 0;
    for (let m = 1; m <= 12; m++) { const t = upTo(monthEnd(year, m)); byMonth.push(Math.max(0, round(t - prev))); prev = t; }
    out.push({ ...split, byMonth });
  }
  return out;
}

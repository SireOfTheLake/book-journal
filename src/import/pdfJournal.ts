import type { Db, SqlValue } from '../db/adapter';
import { randomTagColor } from '../domain/colors';
import { first, finishBatch, startBatch } from './writer';

// The paper journal's handwriting cannot be read by the app, so the pages are transcribed into a small JSON file
// (see tests/fixtures/journal-2026-sample.json) and that file is what gets imported.
export const TRANSCRIPTION_FORMAT = 'book-journal-pdf-transcription';

export interface PdfNarrator { name: string; accent?: string | null; style?: string | null; thumb?: 'up' | 'down' | null }
export interface PdfEntry {
  page: number;
  title: string;
  authors: string[];
  series?: { name: string; position: number | null; total: number | null } | null;
  interconnected?: boolean;
  started?: string | null;
  finished?: string | null;
  pages?: number | null;
  audioMinutes?: number | null;
  format?: 'physical' | 'audio' | 'ebook' | null;
  source?: string | null;
  pov?: 'single' | 'dual' | 'multi' | null;
  perspective?: '1st' | '2nd' | '3rd' | null;
  main?: string[];
  genres?: string[];
  category?: string | null;
  challenge?: string | null;
  prompt?: string | null;
  slot?: string | null;
  settings?: string[];
  timePeriod?: string | null;
  narrators?: PdfNarrator[];
  stars?: number | null;
  notes?: string | null;
  flags?: string[];
}

export interface Transcription { entries: PdfEntry[]; warnings: string[] }

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const blank = (v: unknown): string | null => { const t = typeof v === 'string' ? v.trim() : ''; return t === '' || t === '/' || t.toLowerCase() === 'n/a' ? null : t; };
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => blank(x)).filter((x): x is string => !!x) : []);

// A narrator who voices both leads is often written in twice; one entry is kept so the book is not linked to them twice.
function dedupeNarrators(list: PdfNarrator[]): PdfNarrator[] {
  const out: PdfNarrator[] = [];
  for (const n of list) {
    const same = out.find((m) => m.name.trim().toLowerCase() === n.name.trim().toLowerCase());
    if (!same) { out.push(n); continue; }
    same.accent = same.accent ?? n.accent; same.style = same.style ?? n.style; same.thumb = same.thumb ?? n.thumb;
  }
  return out;
}

export function parseTranscription(text: string): Transcription {
  let raw: any;
  try { raw = JSON.parse(text); } catch { throw new Error('That file is not a journal transcription (it is not valid JSON).'); }
  if (!raw || raw.format !== TRANSCRIPTION_FORMAT || !Array.isArray(raw.entries)) throw new Error('That file is not a journal transcription. It should be the .json file made from your journal pages.');
  const warnings: string[] = [];
  const entries: PdfEntry[] = [];
  for (const [i, e] of raw.entries.entries()) {
    const title = blank(e?.title);
    if (!title) { warnings.push(`Entry ${i + 1} has no title, so it was skipped.`); continue; }
    const date = (v: unknown, label: string) => {
      const d = blank(v);
      if (d && !ISO.test(d)) { warnings.push(`${title}: the ${label} date "${d}" is not a date (use 2026-07-21), so it was left blank.`); return null; }
      return d;
    };
    const stars = typeof e.stars === 'number' && e.stars >= 0 && e.stars <= 5 ? Math.round(e.stars * 4) / 4 : null;
    entries.push({
      page: Number(e.page) || i + 1, title, authors: list(e.authors),
      series: blank(e.series?.name) ? { name: blank(e.series.name)!, position: typeof e.series.position === 'number' ? e.series.position : null, total: typeof e.series.total === 'number' ? e.series.total : null } : null,
      interconnected: !!e.interconnected, started: date(e.started, 'start'), finished: date(e.finished, 'finish'),
      pages: Number.isInteger(e.pages) && e.pages > 0 ? e.pages : null, audioMinutes: Number.isInteger(e.audioMinutes) && e.audioMinutes > 0 ? e.audioMinutes : null,
      format: ['physical', 'audio', 'ebook'].includes(e.format) ? e.format : null, source: blank(e.source),
      pov: ['single', 'dual', 'multi'].includes(e.pov) ? e.pov : null, perspective: ['1st', '2nd', '3rd'].includes(e.perspective) ? e.perspective : null,
      main: list(e.main), genres: list(e.genres), category: blank(e.category), challenge: blank(e.challenge), prompt: blank(e.prompt), slot: blank(e.slot),
      settings: list(e.settings), timePeriod: blank(e.timePeriod),
      narrators: dedupeNarrators(Array.isArray(e.narrators) ? e.narrators.filter((n: any) => blank(n?.name)).map((n: any) => ({ name: blank(n.name)!, accent: blank(n.accent), style: blank(n.style), thumb: n.thumb === 'up' || n.thumb === 'down' ? n.thumb : null })) : []),
      stars, notes: blank(e.notes), flags: list(e.flags),
    });
  }
  return { entries, warnings };
}

// ---------- the plan: what each entry would do, worked out before anything is written ----------
export type NotesChoice = 'set' | 'append' | 'replace' | 'keep' | 'same' | 'none';
export interface PlannedEntry {
  index: number;
  entry: PdfEntry;
  bookId: string | null;       // null: a new book
  readId: string | null;       // null: a new read
  kind: 'new-book' | 'new-read' | 'match';
  existingNotes: string | null;
  notes: NotesChoice;          // what happens to the notes by default
  problems: string[];          // things to look at before importing
  dateDiffers: string | null;  // matched a read whose finish date is a little different
}
export interface PdfPlan { entries: PlannedEntry[]; warnings: string[] }

const dayDiff = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;
const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

async function findBook(db: Db, e: PdfEntry): Promise<string | null> {
  const a = e.authors[0];
  if (a) {
    const hit = await first(db, `SELECT b.id AS id FROM book b JOIN book_author ba ON ba.book_id = b.id AND ba.deleted_at IS NULL JOIN author au ON au.id = ba.author_id
      WHERE lower(b.title) = lower(?) AND lower(au.name) = lower(?) AND b.deleted_at IS NULL LIMIT 1`, [e.title, a]);
    if (hit) return hit;
  }
  const rows = await db.select<{ id: string }>('SELECT id FROM book WHERE lower(title) = lower(?) AND deleted_at IS NULL', [e.title]);
  return rows.length === 1 ? rows[0].id : null; // a title shared by several books is not guessed
}

export async function planPdfJournal(db: Db, t: Transcription): Promise<PdfPlan> {
  const out: PlannedEntry[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of t.entries.entries()) {
    const problems = [...(entry.flags ?? [])];
    const key = `${normalize(entry.title)}|${entry.finished ?? ''}`;
    if (seen.has(key)) problems.push('The same title and finish date appear twice in this file.');
    seen.add(key);
    if (entry.started && entry.finished && entry.finished < entry.started) problems.push(`Finished (${entry.finished}) is before started (${entry.started}). Fix the finish date below, or the dates are left out.`);
    if (!entry.authors.length) problems.push('No author was read for this page.');
    const bookId = await findBook(db, entry);
    let readId: string | null = null;
    let dateDiffers: string | null = null;
    let existingNotes: string | null = null;
    if (bookId) {
      const reads = await db.select<{ id: string; finish_date: string | null; start_date: string | null; notes: string | null }>('SELECT id, finish_date, start_date, notes FROM read WHERE book_id = ? AND deleted_at IS NULL ORDER BY finish_date', [bookId]);
      const exact = entry.finished ? reads.find((r) => r.finish_date === entry.finished) : undefined;
      const near = !exact && entry.finished ? reads.filter((r) => r.finish_date && dayDiff(r.finish_date, entry.finished!) <= 3) : [];
      const sameStart = !exact && !near.length && entry.started ? reads.filter((r) => r.start_date === entry.started) : [];
      const pick = exact ?? (near.length === 1 ? near[0] : sameStart.length === 1 ? sameStart[0] : undefined);
      if (pick) { readId = pick.id; existingNotes = pick.notes; if (!exact) dateDiffers = pick.finish_date; }
    }
    const kind = !bookId ? 'new-book' : readId ? 'match' : 'new-read';
    const mine = (existingNotes ?? '').trim();
    const theirs = (entry.notes ?? '').trim();
    const notes: NotesChoice = !theirs ? 'none' : !mine ? 'set' : normalize(mine) === normalize(theirs) ? 'same' : normalize(mine).includes(normalize(theirs)) ? 'same' : 'append';
    out.push({ index, entry, bookId, readId, kind, existingNotes, notes, problems, dateDiffers });
  }
  return { entries: out, warnings: t.warnings };
}

// ---------- applying ----------
export interface PdfChoices {
  skip: Set<number>;                       // entries not to import
  notes: Map<number, NotesChoice>;         // a different choice for an entry's notes
  finished: Map<number, string | null>;    // a corrected finish date
}
export interface PdfResult {
  batchId: string; booksCreated: number; booksMatched: number; readsCreated: number; readsUpdated: number;
  notesAdded: number; notesAppended: number; notesReplaced: number; charactersCreated: number; skipped: number;
}

const GENERIC_CATEGORY: Record<string, string> = { treat: 'Treat', trick: 'Trick', tbr: 'TBR', 'next in series': 'Next in Series' };
const STYLE: Record<string, string> = { solo: 'solo', dual: 'dual', duet: 'duet', 'full cast': 'full_cast', 'full_cast': 'full_cast', immersive: 'immersive' };

export async function applyPdfJournal(db: Db, plan: PdfPlan, choices: PdfChoices, onProgress?: (done: number, total: number) => void): Promise<PdfResult> {
  const todo = plan.entries.filter((p) => !choices.skip.has(p.index));
  const w = await startBatch(db, 'pdf_journal', `${todo.length} journal pages`);
  const cache = new Map<string, string>();
  const named = async (table: string, nameCol: string, name: string, extra: Record<string, SqlValue> = {}): Promise<string> => {
    const key = `${table}:${normalize(name)}`;
    let id = cache.get(key) ?? (await first(db, `SELECT id FROM ${table} WHERE lower(${nameCol}) = lower(?) AND deleted_at IS NULL LIMIT 1`, [name.trim()]));
    if (!id) id = await w.insert(table, { [nameCol]: name.trim(), ...extra });
    cache.set(key, id);
    return id;
  };
  const character = async (name: string): Promise<string> => {
    const key = `character:${normalize(name)}`;
    let id = cache.get(key) ?? (await first(db, 'SELECT id FROM character WHERE lower(name) = lower(?) AND deleted_at IS NULL ORDER BY is_featured DESC LIMIT 1', [name.trim()]));
    if (!id) id = await w.insert('character', { name: name.trim(), is_featured: 1 });
    cache.set(key, id);
    return id;
  };
  const link = async (table: string, owner: string, ownerId: string, other: string, otherId: string, extra: Record<string, SqlValue> = {}) => {
    if (await first(db, `SELECT id FROM ${table} WHERE ${owner} = ? AND ${other} = ? AND deleted_at IS NULL`, [ownerId, otherId])) return;
    await w.insert(table, { [owner]: ownerId, [other]: otherId, ...extra });
  };

  const r: PdfResult = { batchId: w.batchId, booksCreated: 0, booksMatched: 0, readsCreated: 0, readsUpdated: 0, notesAdded: 0, notesAppended: 0, notesReplaced: 0, charactersCreated: 0, skipped: plan.entries.length - todo.length };
  const charsBefore = () => w.created.character ?? 0;
  let done = 0;

  for (const p of todo) {
    const e = p.entry;
    const finished = choices.finished.has(p.index) ? choices.finished.get(p.index)! : e.finished ?? null;
    const started = e.started ?? null;
    const datesOk = !(started && finished && finished < started);

    // ----- the book -----
    let bookId = p.bookId;
    const seriesId = e.series ? await named('series', 'title', e.series.name) : null;
    if (seriesId && e.series) {
      const [s] = await db.select<{ total_books: number | null; interconnected_standalones: number }>('SELECT total_books, interconnected_standalones FROM series WHERE id = ?', [seriesId]);
      const ch: Record<string, SqlValue> = {};
      if (s.total_books === null && e.series.total) ch.total_books = e.series.total;
      if (e.interconnected && !s.interconnected_standalones) ch.interconnected_standalones = 1;
      await w.updateRow('series', seriesId, ch);
    }
    const timePeriodId = e.timePeriod ? await named('time_period', 'name', e.timePeriod) : null;
    if (!bookId) {
      bookId = await w.insert('book', { title: e.title, series_id: seriesId, series_position: seriesId ? e.series?.position ?? null : null, page_count: e.pages ?? null, pov: e.pov ?? null, perspective: e.perspective ?? null, time_period_id: timePeriodId });
      for (const [i, a] of e.authors.entries()) await w.insert('book_author', { book_id: bookId, author_id: await named('author', 'name', a), sort_order: i });
      for (const [i, n] of (e.narrators ?? []).entries()) await w.insert('book_narrator', { book_id: bookId, narrator_id: await named('narrator', 'name', n.name), sort_order: i });
      r.booksCreated++;
    } else {
      // An existing book keeps what it has; only empty fields are filled in.
      const [b] = await db.select<{ series_id: string | null; page_count: number | null; pov: string | null; perspective: string | null; time_period_id: string | null }>('SELECT series_id, page_count, pov, perspective, time_period_id FROM book WHERE id = ?', [bookId]);
      const ch: Record<string, SqlValue> = {};
      if (!b.page_count && e.pages) ch.page_count = e.pages;
      if (!b.pov && e.pov) ch.pov = e.pov;
      if (!b.perspective && e.perspective) ch.perspective = e.perspective;
      if (!b.time_period_id && timePeriodId) ch.time_period_id = timePeriodId;
      if (!b.series_id && seriesId) { ch.series_id = seriesId; ch.series_position = e.series?.position ?? null; }
      await w.updateRow('book', bookId, ch);
      r.booksMatched++;
    }
    const hadGenre = await first(db, 'SELECT id FROM book_genre WHERE book_id = ? AND deleted_at IS NULL LIMIT 1', [bookId]);
    for (const g of e.genres ?? []) {
      if (!hadGenre) await link('book_genre', 'book_id', bookId, 'genre_id', await named('genre', 'name', g, { color: randomTagColor() }));
    }
    for (const [i, s] of (e.settings ?? []).entries()) await link('book_place', 'book_id', bookId, 'place_id', await named('place', 'name', s), { sort_order: i });
    const hasMain = await first(db, "SELECT id FROM book_character WHERE book_id = ? AND role = 'main' AND deleted_at IS NULL LIMIT 1", [bookId]);
    if (!hasMain) for (const [i, c] of (e.main ?? []).entries()) await link('book_character', 'book_id', bookId, 'character_id', await character(c), { role: 'main', sort_order: i });

    // ----- the read -----
    // In the paper journal "Next in Series" and "TBR" are stickers in the prompt box, with the category left as N/A.
    const catKey = (e.category ? GENERIC_CATEGORY[normalize(e.category)] : undefined) ?? (e.prompt ? GENERIC_CATEGORY[normalize(e.prompt)] : undefined);
    const categoryId = catKey ? await first(db, 'SELECT id FROM category WHERE lower(name) = lower(?) AND deleted_at IS NULL LIMIT 1', [catKey]) : null;
    const keepPrompt = (catKey === 'Treat' || catKey === 'Trick') && !!e.category && !!GENERIC_CATEGORY[normalize(e.category)];
    const legacy = { legacy_category: e.category ?? null, legacy_challenge: e.challenge ?? null, legacy_prompt: e.prompt ?? null, legacy_slot: e.slot ?? null };
    const sourceId = e.source ? await named('source', 'name', e.source) : null;
    const rating = e.stars === null || e.stars === undefined ? null : Math.round(e.stars * 4);
    const style = (e.narrators ?? []).map((n) => (n.style ? STYLE[normalize(n.style)] : null)).find(Boolean) ?? null;
    const base: Record<string, SqlValue> = {
      start_date: datesOk ? started : null, finish_date: datesOk ? finished : null, format: e.format ?? null, source_id: sourceId,
      audio_length_seconds: e.audioMinutes ? e.audioMinutes * 60 : null, narration_style: style, rating,
      category_id: categoryId, prompt: keepPrompt ? e.prompt ?? null : null, ...legacy,
    };
    const choice = choices.notes.get(p.index) ?? p.notes;
    let readId = p.readId;
    if (!readId) {
      const n = finished ? Number((await db.select<{ n: number }>("SELECT count(*) AS n FROM read WHERE deleted_at IS NULL AND status = 'finished' AND finish_date <= ?", [finished]))[0].n) : 0;
      readId = await w.insert('read', { book_id: bookId, status: finished ? 'finished' : started ? 'reading' : 'finished', ...base, notes: e.notes ?? null, color_index: n % 10 });
      if (e.notes) r.notesAdded++;
      r.readsCreated++;
    } else {
      const [cur] = await db.select<Record<string, SqlValue>>('SELECT start_date, finish_date, format, source_id, audio_length_seconds, narration_style, rating, category_id, prompt, notes, legacy_category, legacy_challenge, legacy_prompt, legacy_slot FROM read WHERE id = ?', [readId]);
      const ch: Record<string, SqlValue> = {};
      for (const [k, v] of Object.entries(base)) if ((cur[k] === null || cur[k] === '') && v !== null) ch[k] = v;
      if (p.dateDiffers) { delete ch.finish_date; delete ch.start_date; } // matched by closeness: the dates already there stay
      const mine = String(cur.notes ?? '').trim();
      if (e.notes) {
        if (choice === 'set' && !mine) { ch.notes = e.notes; r.notesAdded++; }
        else if (choice === 'append' && mine) { ch.notes = `${mine}\n\n${e.notes}`; r.notesAppended++; }
        else if (choice === 'replace') { ch.notes = e.notes; r.notesReplaced++; }
      }
      await w.updateRow('read', readId, ch);
      r.readsUpdated++;
    }
    for (const [i, n] of (e.narrators ?? []).entries()) {
      const nid = await named('narrator', 'name', n.name);
      if (await first(db, 'SELECT id FROM read_narrator WHERE read_id = ? AND narrator_id = ? AND deleted_at IS NULL', [readId, nid])) continue;
      const rnId = await w.insert('read_narrator', { read_id: readId, narrator_id: nid, rating: n.thumb ?? null, sort_order: i });
      if (n.accent) await w.insert('read_narrator_accent', { read_narrator_id: rnId, accent_id: await named('accent', 'name', n.accent) });
    }
    onProgress?.(++done, todo.length);
  }
  r.charactersCreated = charsBefore();
  await finishBatch(db, w.batchId);
  return r;
}

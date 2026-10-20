import type { Db } from '../db/adapter';
import { bestMatch, nameKey } from '../domain/nameMatch';
import { parseCsv } from './csv';
import { finishBatch, startBatch } from './writer';

// Importing a plain list of books from a spreadsheet: Title, Author, Series, Position, Page Number, Copies I Own.

export const TEMPLATE_HEADERS = ['Title', 'Author', 'Series', 'Position', 'Page Number', 'Copies I Own'];
const TEMPLATE_ROWS: string[][] = [
  ['The Prince Pact', 'A.J. Sherwood', 'Royal Bargains', '1', '384', 'Physical'],
  ['Crown of Salt', 'A.J. Sherwood', 'Royal Bargains', '2', '412', 'Physical; Audio'],
  ['Winter Harbour', 'Mara Quill', '', '', '340', 'Ebook'],
  ['Salt and Smoke', 'Ines Calder; Dana Vale', 'Harbour Tales', '1.5', '96', 'Ebook; Audio'],
];
const cell = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
/** The example file people can download, fill in and upload again. */
export const templateCsv = (): string => [TEMPLATE_HEADERS, ...TEMPLATE_ROWS].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';

export type Copies = { physical: boolean; audio: boolean; ebook: boolean };
export interface CsvBook {
  index: number; // the row number in the file, counting the header as row 1
  title: string; authors: string[]; series: string; position: number | null; pages: number | null; copies: Copies;
  warnings: string[]; // something in the row was not understood and was left out
}

const FIELD_NAMES: Record<'title' | 'author' | 'series' | 'position' | 'pages' | 'copies', string[]> = {
  title: ['title', 'booktitle', 'book', 'name'],
  author: ['author', 'authors', 'authorname', 'authornames'],
  series: ['series', 'seriesname'],
  position: ['position', 'seriesposition', 'number', 'seriesnumber', 'booknumber', 'bookinseries', 'seriesno'],
  pages: ['pagenumber', 'pagenumbers', 'pages', 'pagecount', 'numberofpages', 'page'],
  copies: ['copiesiown', 'copiesown', 'copies', 'owned', 'iown', 'ownedcopies', 'ownedformats', 'format', 'formats'],
};
const squash = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');

const COPY_WORDS: Record<string, keyof Copies> = {
  physical: 'physical', print: 'physical', paperback: 'physical', hardcover: 'physical', hardback: 'physical', paper: 'physical', book: 'physical',
  audio: 'audio', audiobook: 'audio', audible: 'audio', listen: 'audio', cd: 'audio',
  ebook: 'ebook', 'e-book': 'ebook', kindle: 'ebook', digital: 'ebook', epub: 'ebook', kobo: 'ebook',
};

export function parseCopies(text: string): { copies: Copies; unknown: string[] } {
  const copies: Copies = { physical: false, audio: false, ebook: false };
  const unknown: string[] = [];
  for (const raw of text.split(/[;,/+&|]|\band\b/i)) {
    const w = raw.trim().toLowerCase();
    if (!w) continue;
    const hit = COPY_WORDS[w] ?? COPY_WORDS[w.replace(/\s+/g, '')];
    if (hit) copies[hit] = true; else unknown.push(raw.trim());
  }
  return { copies, unknown };
}

export const splitAuthors = (text: string): string[] => [...new Map(text.split(/;|\s&\s|\sand\s/i).map((a) => a.trim()).filter(Boolean).map((a) => [nameKey(a) || a, a])).values()];

export interface ParsedCsv { books: CsvBook[]; missingTitleColumn: boolean; ignoredColumns: string[] }

export function parseBookCsv(text: string): ParsedCsv {
  const [head, ...rest] = parseCsv(text);
  if (!head) return { books: [], missingTitleColumn: true, ignoredColumns: [] };
  const col: Partial<Record<keyof typeof FIELD_NAMES, number>> = {};
  const used = new Set<number>();
  head.forEach((h, i) => {
    const k = squash(h);
    for (const f of Object.keys(FIELD_NAMES) as (keyof typeof FIELD_NAMES)[]) {
      if (col[f] === undefined && FIELD_NAMES[f].includes(k)) { col[f] = i; used.add(i); break; }
    }
  });
  const ignoredColumns = head.map((h, i) => (used.has(i) || !h.trim() ? '' : h.trim())).filter(Boolean);
  const get = (r: string[], f: keyof typeof FIELD_NAMES) => (col[f] === undefined ? '' : (r[col[f]!] ?? '').trim());
  const books: CsvBook[] = rest.map((r, n) => {
    const warnings: string[] = [];
    const series = get(r, 'series');
    let position: number | null = null;
    const posText = get(r, 'position');
    if (posText) {
      const m = posText.replace(',', '.').match(/\d+(\.\d+)?/);
      if (m) position = Number(m[0]); else warnings.push(`Position "${posText}" is not a number, so it was left blank.`);
      if (position !== null && !series) { warnings.push('A position was given with no series, so it was left blank.'); position = null; }
    }
    let pages: number | null = null;
    const pageText = get(r, 'pages');
    if (pageText) {
      const m = pageText.match(/\d[\d,]*/);
      const v = m ? parseInt(m[0].replace(/,/g, ''), 10) : NaN;
      if (v > 0) pages = v; else warnings.push(`Page number "${pageText}" is not a number, so it was left blank.`);
    }
    const { copies, unknown } = parseCopies(get(r, 'copies'));
    if (unknown.length) warnings.push(`Did not recognise ${unknown.map((u) => `"${u}"`).join(', ')} in Copies I Own. Use Physical, Audio or Ebook.`);
    return { index: n + 2, title: get(r, 'title'), authors: splitAuthors(get(r, 'author')), series, position, pages, copies, warnings };
  });
  return { books, missingTitleColumn: col.title === undefined, ignoredColumns };
}

// ---------- matching against what is already in the journal ----------

export interface Existing { id: string; name: string }
export interface EntityReview {
  key: string; // the same author or series spelled differently shares one key
  typed: string; count: number; // how the first row spelled it, and how many rows use it
  match: Existing | null; // the author or series already in the journal that this looks like
  by?: string[]; // for a matched series: who writes it
}
export interface ReviewRow extends CsvBook {
  authorKeys: string[]; seriesKey: string | null;
  duplicateOf: string | null; // set when the book looks like one already in the library (or an earlier row)
}
export interface BookCsvReview { rows: ReviewRow[]; authors: EntityReview[]; series: EntityReview[]; authorOptions: Existing[]; seriesOptions: Existing[] }

export async function reviewBookCsv(db: Db, books: CsvBook[]): Promise<BookCsvReview> {
  const authorRows = await db.select<Existing>('SELECT id, name FROM author WHERE deleted_at IS NULL ORDER BY name');
  const seriesRows = await db.select<{ id: string; name: string; by: string | null }>(
    `SELECT s.id AS id, s.title AS name,
       (SELECT group_concat(x.name, '|') FROM (SELECT DISTINCT au.name AS name FROM book b JOIN book_author ba ON ba.book_id = b.id AND ba.deleted_at IS NULL JOIN author au ON au.id = ba.author_id AND au.deleted_at IS NULL WHERE b.series_id = s.id AND b.deleted_at IS NULL) x) AS by
     FROM series s WHERE s.deleted_at IS NULL ORDER BY s.title`);
  const existingBooks = await db.select<{ title: string; authors: string | null }>(
    `SELECT b.title AS title, (SELECT group_concat(au.name, '|') FROM book_author ba JOIN author au ON au.id = ba.author_id WHERE ba.book_id = b.id AND ba.deleted_at IS NULL AND au.deleted_at IS NULL) AS authors FROM book b WHERE b.deleted_at IS NULL`);

  const authorNames = authorRows.map((a) => a.name);
  const seriesTitles = [...new Set(seriesRows.map((s) => s.name))];
  const authors = new Map<string, EntityReview>();
  const series = new Map<string, EntityReview>();

  // An author you already have wins ("AJ Sherwood" is "A.J. Sherwood"); otherwise rows spelling a new name the same way share it.
  const authorKey = (name: string): string => {
    const m = bestMatch(authorNames, name);
    const key = nameKey(m ?? name) || name.toLowerCase();
    const found = authors.get(key);
    if (found) { found.count++; return key; }
    authors.set(key, { key, typed: name, count: 1, match: m ? authorRows.find((a) => a.name === m) ?? null : null });
    return key;
  };
  const seriesKeyOf = (title: string, rowAuthors: string[]): string => {
    const m = bestMatch(seriesTitles, title);
    const key = nameKey(m ?? title) || title.toLowerCase();
    const found = series.get(key);
    if (found) { found.count++; return key; }
    let match: Existing | null = null; let by: string[] | undefined;
    if (m) {
      // Two series can share a title; the one by this row's author wins.
      const same = seriesRows.filter((s) => s.name === m);
      const mine = new Set(rowAuthors.map((a) => nameKey(a)));
      const pick = same.find((s) => (s.by ?? '').split('|').some((n) => mine.has(nameKey(n)))) ?? same[0];
      match = { id: pick.id, name: pick.name }; by = pick.by ? pick.by.split('|') : [];
    }
    series.set(key, { key, typed: title, count: 1, match, by });
    return key;
  };

  const seen = new Map<string, number>();
  const rows: ReviewRow[] = books.map((b) => {
    const aKeys = b.authors.map(authorKey);
    const sKey = b.series ? seriesKeyOf(b.series, b.authors) : null;
    let duplicateOf: string | null = null;
    const tk = nameKey(b.title);
    if (tk) {
      const there = existingBooks.find((e) => nameKey(e.title) === tk && (!aKeys.length || !e.authors || e.authors.split('|').some((n) => aKeys.includes(nameKey(bestMatch(authorNames, n) ?? n)))));
      if (there) duplicateOf = `Already in your library${there.authors ? ` (${there.authors.split('|').join(', ')})` : ''}`;
      const sig = `${tk}|${aKeys[0] ?? ''}`;
      if (!duplicateOf && seen.has(sig)) duplicateOf = `Same as row ${seen.get(sig)} of this file`;
      if (!seen.has(sig)) seen.set(sig, b.index);
    }
    return { ...b, authorKeys: aKeys, seriesKey: sKey, duplicateOf };
  });
  return { rows, authors: [...authors.values()], series: [...series.values()], authorOptions: authorRows, seriesOptions: seriesRows.map((x) => ({ id: x.id, name: x.name })) };
}

// ---------- saving ----------

/** What to do with a name that is not (or not clearly) in the journal yet: use an existing one, or make a new one. */
export type Decision = { kind: 'existing'; id: string; name: string } | { kind: 'new' };
export interface BookCsvResult { batchId: string; booksCreated: number; authorsCreated: number; seriesCreated: number }

export async function applyBookCsv(db: Db, input: {
  rows: ReviewRow[]; authors: Record<string, Decision | undefined>; series: Record<string, Decision | undefined>;
  authorNames: Record<string, string>; seriesNames: Record<string, string>; shelf: 'tbr' | 'up_next' | null;
  onProgress?: (done: number, total: number) => void;
}): Promise<BookCsvResult> {
  // Nothing is written until every name has an answer.
  for (const r of input.rows) {
    for (const k of r.authorKeys) if (!input.authors[k]) throw new Error(`Decide what to do with the author "${input.authorNames[k] ?? k}" first.`);
    if (r.seriesKey && !input.series[r.seriesKey]) throw new Error(`Decide what to do with the series "${input.seriesNames[r.seriesKey] ?? r.seriesKey}" first.`);
  }
  const w = await startBatch(db, 'other', `${input.rows.length} books from a spreadsheet`);
  const authorIds = new Map<string, string>();
  const seriesIds = new Map<string, string>();
  const author = async (key: string) => {
    let id = authorIds.get(key);
    if (id) return id;
    const d = input.authors[key]!;
    id = d.kind === 'existing' ? d.id : await w.insert('author', { name: input.authorNames[key] });
    authorIds.set(key, id);
    return id;
  };
  const seriesId = async (key: string) => {
    let id = seriesIds.get(key);
    if (id) return id;
    const d = input.series[key]!;
    id = d.kind === 'existing' ? d.id : await w.insert('series', { title: input.seriesNames[key] });
    seriesIds.set(key, id);
    return id;
  };
  let done = 0;
  for (const r of input.rows) {
    const sId = r.seriesKey ? await seriesId(r.seriesKey) : null;
    const bookId = await w.insert('book', {
      title: r.title, series_id: sId, series_position: sId ? r.position : null, page_count: r.pages, shelf: input.shelf,
      own_physical: r.copies.physical ? 1 : 0, own_audio: r.copies.audio ? 1 : 0, own_ebook: r.copies.ebook ? 1 : 0,
    });
    for (const [i, k] of r.authorKeys.entries()) await w.insert('book_author', { book_id: bookId, author_id: await author(k), sort_order: i });
    input.onProgress?.(++done, input.rows.length);
  }
  await finishBatch(db, w.batchId);
  return { batchId: w.batchId, booksCreated: w.created.book ?? 0, authorsCreated: w.created.author ?? 0, seriesCreated: w.created.series ?? 0 };
}

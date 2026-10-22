import type { Db } from '../db/adapter';
import { bestMatch, nameKey } from '../domain/nameMatch';
import { downloadCover } from '../lookup/download';
import type { BookClip } from '../clip/types';
import { addTag, createNarrator, ensureBookNarrator, setBookCover, setStatus, updateBook } from './bookLog';
import { newId } from '../domain/ids';
import { createBook } from './books';
import { createSeries, setBookSeries } from './series';

// Adding a book that was read off a web page (see src/clip): matching it to what the journal already has, then saving it.

export type TagKind = 'genre' | 'trope' | 'mood' | 'pace' | 'content_warning';
export const TAG_KINDS: TagKind[] = ['genre', 'trope', 'mood', 'pace', 'content_warning'];
const KIND_WORD: Record<TagKind, string> = { genre: 'Genre', trope: 'Trope', mood: 'Mood', pace: 'Pace', content_warning: 'Content warning' };
export const kindWord = (k: TagKind) => KIND_WORD[k];

interface Named { id: string; name: string }
export interface NameMatch { name: string; match: Named | null }
export interface ClipReview {
  existing: { id: string; title: string; authors: string | null } | null;
  authors: NameMatch[];
  narrators: NameMatch[];
  series: NameMatch | null;
  tags: { name: string; votes?: number; known: TagKind | null; hint?: TagKind }[];
}

const HINT_KIND: Record<string, TagKind> = { genre: 'genre', trope: 'trope', mood: 'mood', pace: 'pace', warning: 'content_warning' };

export async function reviewClip(db: Db, clip: BookClip): Promise<ClipReview> {
  const names = async (table: string, col = 'name') => db.select<Named>(`SELECT id, ${col} AS name FROM ${table} WHERE deleted_at IS NULL`);
  const match = (list: Named[], typed: string): Named | null => {
    const m = bestMatch(list.map((x) => x.name), typed);
    return m ? list.find((x) => x.name === m) ?? null : null;
  };
  const authors = await names('author'); const narrators = await names('narrator'); const series = await names('series', 'title');

  // Is this book already here? The ISBN or ASIN decides it; otherwise the same title by the same author.
  let existing: ClipReview['existing'] = null;
  const byId = async (key: string, value: string) => (await db.select<{ id: string }>(`SELECT id FROM book WHERE deleted_at IS NULL AND json_extract(external_ids, '$.${key}') = ? LIMIT 1`, [value]))[0]?.id;
  let bookId = (clip.isbn && await byId('isbn', clip.isbn)) || (clip.asin && await byId('asin', clip.asin)) || null;
  const aKeys = clip.authors.map((a) => nameKey(match(authors, a)?.name ?? a));
  if (!bookId) {
    const tk = nameKey(clip.title);
    for (const b of await db.select<{ id: string; title: string; authors: string | null }>(
      `SELECT b.id AS id, b.title AS title, (SELECT group_concat(au.name, '|') FROM book_author ba JOIN author au ON au.id = ba.author_id WHERE ba.book_id = b.id AND ba.deleted_at IS NULL AND au.deleted_at IS NULL) AS authors FROM book b WHERE b.deleted_at IS NULL`)) {
      if (nameKey(b.title) !== tk) continue;
      if (!aKeys.length || !b.authors || b.authors.split('|').some((n) => aKeys.includes(nameKey(match(authors, n)?.name ?? n)))) { bookId = b.id; break; }
    }
  }
  if (bookId) {
    const [b] = await db.select<{ id: string; title: string; authors: string | null }>(
      `SELECT b.id AS id, b.title AS title, (SELECT group_concat(au.name, ', ') FROM book_author ba JOIN author au ON au.id = ba.author_id WHERE ba.book_id = b.id AND ba.deleted_at IS NULL AND au.deleted_at IS NULL) AS authors FROM book b WHERE b.id = ?`, [bookId]);
    if (b) existing = b;
  }

  // Tags that are already one of your genres, tropes and so on keep that meaning.
  const lists = new Map<TagKind, Map<string, string>>();
  for (const k of TAG_KINDS) lists.set(k, new Map((await names(k)).map((x) => [nameKey(x.name), x.name])));
  const tags = clip.tags.map((t) => {
    const key = nameKey(t.name);
    const hint = t.hint ? HINT_KIND[t.hint] : undefined;
    const order: TagKind[] = hint ? [hint, ...TAG_KINDS.filter((k) => k !== hint)] : TAG_KINDS;
    const known = order.find((k) => lists.get(k)!.has(key)) ?? null;
    return { name: t.name, votes: t.votes, known, hint };
  });
  return {
    existing,
    authors: clip.authors.map((name) => ({ name, match: match(authors, name) })),
    narrators: (clip.narrators ?? []).map((name) => ({ name, match: match(narrators, name) })),
    series: clip.series ? { name: clip.series, match: match(series, clip.series) } : null,
    tags,
  };
}

// ---------- saving ----------
export interface ClipSave {
  mode: { kind: 'new' } | { kind: 'fill'; bookId: string };
  title: string;
  authors: string[]; // exactly as they should be filed (an existing author's own spelling)
  narrators: string[];
  series: { id: string | null; name: string } | null;
  position: number | null;
  pages: number | null;
  published: string | null;
  heat: number | null;
  synopsis: string | null;
  cover: string | null;
  shelf: 'tbr' | 'up_next';
  plannedFormat: 'audio' | 'ebook' | 'physical' | null;
  audioSeconds?: number | null;
  tags: { name: string; kind: TagKind }[];
  ids: { isbn?: string; asin?: string; sources: Record<string, string> };
  authorLinks: Record<string, string>;
}
export interface ClipSaved { bookId: string; created: boolean; coverError: string | null; added: string[] }

const isPlaceholderAudibleLink = (url: string) => /^https:\/\/www\.audible\.[a-z.]+\/search\?searchAuthor=/.test(url) || /^https:\/\/www\.audible\.[a-z.]+\/author\/[^/?]+\/?$/.test(url);

/** Puts an author's real Audible page in their "Audible Page" link, when that link is still the one the app made itself. */
export async function setAuthorAudibleLink(db: Db, authorId: string, url: string): Promise<boolean> {
  const [a] = await db.select<{ links: string | null }>('SELECT links FROM author WHERE id = ?', [authorId]);
  let links: { label: string; url: string }[] = [];
  try { links = a?.links ? JSON.parse(a.links) : []; } catch { links = []; }
  const at = links.findIndex((l) => l.label === 'Audible Page');
  if (at === -1) links.push({ label: 'Audible Page', url });
  else if (isPlaceholderAudibleLink(links[at].url) && links[at].url !== url) links[at] = { label: 'Audible Page', url };
  else return false;
  await db.execute('UPDATE author SET links = ? WHERE id = ?', [JSON.stringify(links), authorId]);
  return true;
}

export async function saveClip(db: Db, input: ClipSave): Promise<ClipSaved> {
  const fill = input.mode.kind === 'fill';
  const added: string[] = [];
  let bookId: string;
  if (input.mode.kind === 'fill') bookId = input.mode.bookId;
  else bookId = await createBook(db, { title: input.title, authors: input.authors });
  const [row] = await db.select<{ audio_length_seconds: number | null; page_count: number | null; synopsis: string | null; heat_level: number | null; original_publication_date: string | null; series_id: string | null; planned_format: string | null; external_ids: string | null; cover_image_id: string | null }>(
    'SELECT audio_length_seconds, page_count, synopsis, heat_level, original_publication_date, series_id, planned_format, external_ids, cover_image_id FROM book WHERE id = ?', [bookId]);

  // Authors, for a book that is already here: the ones it does not have yet.
  if (fill) {
    const have = new Set((await db.select<{ name: string }>('SELECT au.name AS name FROM book_author ba JOIN author au ON au.id = ba.author_id WHERE ba.book_id = ? AND ba.deleted_at IS NULL', [bookId])).map((r) => nameKey(r.name)));
    if (!have.size) {
      const { findOrCreateAuthor } = await import('./books');
      for (const [i, n] of input.authors.entries()) { const id = await findOrCreateAuthor(db, n); await db.execute('INSERT INTO book_author (id, book_id, author_id, sort_order) VALUES (?, ?, ?, ?)', [newId(), bookId, id, i]); }
      if (input.authors.length) added.push('authors');
    }
  }

  const fields: Record<string, string | number | null> = {};
  const put = (col: string, value: string | number | null, current: unknown, label: string) => {
    if (value === null || value === '') return;
    if (fill && current !== null && current !== undefined && current !== '') return;
    fields[col] = value; added.push(label);
  };
  put('page_count', input.pages, row?.page_count, 'page count');
  put('synopsis', input.synopsis, row?.synopsis, 'synopsis');
  put('audio_length_seconds', input.audioSeconds ?? null, row?.audio_length_seconds, 'audiobook length');
  put('heat_level', input.heat, row?.heat_level, 'heat level');
  put('original_publication_date', input.published, row?.original_publication_date, 'publication date');
  if (Object.keys(fields).length) await updateBook(db, bookId, fields);

  if (input.series && !(fill && row?.series_id)) {
    const sid = input.series.id ?? (await db.select<{ id: string }>('SELECT id FROM series WHERE lower(title) = lower(?) AND deleted_at IS NULL LIMIT 1', [input.series.name]))[0]?.id ?? await createSeries(db, input.series.name, { authors: input.authors });
    await setBookSeries(db, bookId, sid, input.position);
    added.push('series');
  }
  // Narrators first, so the placeholder read of an Up Next book starts with them.
  for (const n of input.narrators) {
    const found = (await db.select<{ id: string }>('SELECT id FROM narrator WHERE lower(name) = lower(?) AND deleted_at IS NULL LIMIT 1', [n]))[0]?.id;
    await ensureBookNarrator(db, bookId, found ?? await createNarrator(db, n));
  }
  if (input.narrators.length) added.push('narrators');
  if (!fill) await setStatus(db, bookId, null, input.shelf);

  if (input.plannedFormat && (!fill || !row?.planned_format)) { await db.execute('UPDATE book SET planned_format = ? WHERE id = ?', [input.plannedFormat, bookId]); if (fill) added.push('planned format'); }

  // The ISBN, ASIN and the pages it came from, kept so the same book is recognised next time.
  let ext: Record<string, unknown> = {};
  try { ext = row?.external_ids ? JSON.parse(row.external_ids) : {}; } catch { ext = {}; }
  const before = JSON.stringify(ext);
  if (input.ids.isbn && !ext.isbn) ext.isbn = input.ids.isbn;
  if (input.ids.asin && !ext.asin) ext.asin = input.ids.asin;
  ext.web_pages = { ...((ext.web_pages as Record<string, string>) ?? {}), ...input.ids.sources };
  if (JSON.stringify(ext) !== before) await db.execute('UPDATE book SET external_ids = ? WHERE id = ?', [JSON.stringify(ext), bookId]);

  for (const t of input.tags) { await addTag(db, bookId, t.kind, t.name); }
  if (input.tags.length) added.push(`${input.tags.length} tag${input.tags.length === 1 ? '' : 's'}`);

  for (const [name, url] of Object.entries(input.authorLinks)) {
    const a = (await db.select<{ id: string }>('SELECT id FROM author WHERE lower(name) = lower(?) AND deleted_at IS NULL LIMIT 1', [name]))[0]?.id;
    if (a) await setAuthorAudibleLink(db, a, url);
  }

  let coverError: string | null = null;
  if (input.cover && !(fill && row?.cover_image_id)) {
    try {
      const img = await downloadCover({ id: 'web', source: 'openlibrary', title: input.title, authors: input.authors, year: null, imageUrl: input.cover, fallbackUrl: null, thumbUrl: input.cover, score: 1, confidence: 'high' });
      await setBookCover(db, bookId, img);
      if (fill) added.push('cover');
    } catch (e) { coverError = e instanceof Error ? e.message : String(e); }
  }
  return { bookId, created: !fill, coverError, added };
}

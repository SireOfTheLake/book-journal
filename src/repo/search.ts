import type { Db } from '../db/adapter';
import { BOOK_GENRE_ROLLUP } from './genreRollup';
import type { SearchItem } from '../domain/search';

// Everything that can be searched, in one list. A personal library is small, so this is loaded once and filtered in memory.
export async function loadSearchIndex(db: Db): Promise<SearchItem[]> {
  const q = <T,>(sql: string) => db.select<T>(sql);
  const [books, series, authors, aAlias, narrators, nAlias, chars, universes, genres, tropes, themes] = await Promise.all([
    q<{ id: string; label: string; sub: string | null }>(`SELECT b.id AS id, b.title AS label,
       (SELECT group_concat(x.name, ', ') FROM (SELECT au.name AS name FROM book_author ba JOIN author au ON au.id = ba.author_id WHERE ba.book_id = b.id AND ba.deleted_at IS NULL AND au.deleted_at IS NULL ORDER BY ba.sort_order) x) AS sub
       FROM book b WHERE b.deleted_at IS NULL`),
    q<{ id: string; label: string }>(`SELECT id, title AS label FROM series WHERE deleted_at IS NULL`),
    q<{ id: string; label: string }>(`SELECT id, name AS label FROM author WHERE deleted_at IS NULL`),
    q<{ id: string; name: string }>(`SELECT author_id AS id, name FROM author_alias WHERE deleted_at IS NULL`),
    q<{ id: string; label: string }>(`SELECT id, name AS label FROM narrator WHERE deleted_at IS NULL`),
    q<{ id: string; name: string }>(`SELECT narrator_id AS id, name FROM narrator_alias WHERE deleted_at IS NULL`),
    q<{ id: string; label: string }>(`SELECT id, name AS label FROM character WHERE deleted_at IS NULL`),
    q<{ id: string; label: string }>(`SELECT id, name AS label FROM universe WHERE deleted_at IS NULL`),
    q<{ id: string; label: string }>(`SELECT id, name AS label FROM genre WHERE deleted_at IS NULL`),
    q<{ id: string; label: string }>(`SELECT id, name AS label FROM trope WHERE deleted_at IS NULL`),
    q<{ id: string; label: string }>(`SELECT id, name AS label FROM theme WHERE deleted_at IS NULL`),
  ]);
  const withAlias = (rows: { id: string; label: string }[], al: { id: string; name: string }[]) =>
    rows.map((r) => ({ id: r.id, label: r.label, extra: al.filter((a) => a.id === r.id).map((a) => a.name) }));
  return [
    ...books.map((b) => ({ kind: 'book' as const, ...b })),
    ...series.map((r) => ({ kind: 'series' as const, ...r })),
    ...withAlias(authors, aAlias).map((r) => ({ kind: 'author' as const, ...r })),
    ...withAlias(narrators, nAlias).map((r) => ({ kind: 'narrator' as const, ...r })),
    ...chars.map((r) => ({ kind: 'character' as const, ...r })),
    ...universes.map((r) => ({ kind: 'universe' as const, ...r })),
    ...genres.map((r) => ({ kind: 'genre' as const, ...r })),
    ...tropes.map((r) => ({ kind: 'trope' as const, ...r })),
    ...themes.map((r) => ({ kind: 'theme' as const, ...r })),
  ];
}

export interface TagOption { kind: 'genre' | 'trope' | 'theme'; id: string; name: string; color: string | null; count: number }

// Every genre, trope and theme that at least one book uses, with how many books.
export async function listTagOptions(db: Db): Promise<TagOption[]> {
  const out: TagOption[] = [];
  for (const [kind, join, col] of [['genre', BOOK_GENRE_ROLLUP, 'genre_id'], ['trope', 'book_trope', 'trope_id'], ['theme', 'book_theme', 'theme_id']] as const) {
    const rows = await db.select<{ id: string; name: string; color: string | null; count: number }>(
      `SELECT t.id AS id, t.name AS name, t.color AS color, COUNT(DISTINCT j.book_id) AS count FROM ${kind} t
       JOIN ${join} j ON j.${col} = t.id AND j.deleted_at IS NULL JOIN book b ON b.id = j.book_id AND b.deleted_at IS NULL
       WHERE t.deleted_at IS NULL GROUP BY t.id ORDER BY CASE WHEN lower(t.name) LIKE \'the %\' THEN lower(substr(t.name, 5)) ELSE lower(t.name) END`);
    out.push(...rows.map((r) => ({ kind, ...r })));
  }
  return out;
}

// { 'genre:<id>': [bookId, …] } for every tag in use.
export async function listBookTags(db: Db): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  for (const [kind, join, col] of [['genre', BOOK_GENRE_ROLLUP, 'genre_id'], ['trope', 'book_trope', 'trope_id'], ['theme', 'book_theme', 'theme_id']] as const) {
    const rows = await db.select<{ t: string; b: string }>(`SELECT ${col} AS t, book_id AS b FROM ${join} j WHERE deleted_at IS NULL`);
    for (const r of rows) (out[`${kind}:${r.t}`] ??= []).push(r.b);
  }
  return out;
}

// What advanced search needs to know about every book, in one go. Loaded when the advanced panel is opened.
const SEP = '\u001f';
export async function listBookFacts(db: Db): Promise<import('../domain/advancedSearch').BookFacts[]> {
  const join = (sql: string) => `(SELECT group_concat(x.n, char(31)) FROM (${sql}) x)`;
  const rows = await db.select<{ id: string; title: string; position: number | null; pages: number | null; rating: number | null; series: string | null; authors: string | null; characters: string | null; narrators: string | null; genres: string | null; tropes: string | null; themes: string | null }>(
    `SELECT b.id AS id, b.title AS title, b.series_position AS position, b.page_count AS pages,
       (SELECT v.avg_stars FROM v_book_rating v WHERE v.book_id = b.id) AS rating,
       (SELECT s.title FROM series s WHERE s.id = b.series_id AND s.deleted_at IS NULL) AS series,
       ${join(`SELECT au.name AS n FROM book_author ba JOIN author au ON au.id = ba.author_id WHERE ba.book_id = b.id AND ba.deleted_at IS NULL AND au.deleted_at IS NULL ORDER BY ba.sort_order`)} AS authors,
       ${join(`SELECT c.name AS n FROM book_character bc JOIN character c ON c.id = bc.character_id WHERE bc.book_id = b.id AND bc.deleted_at IS NULL AND c.deleted_at IS NULL`)} AS characters,
       ${join(`SELECT DISTINCT n.name AS n FROM read_narrator rn JOIN read r ON r.id = rn.read_id JOIN narrator n ON n.id = rn.narrator_id WHERE r.book_id = b.id AND rn.deleted_at IS NULL AND r.deleted_at IS NULL AND n.deleted_at IS NULL`)} AS narrators,
       ${join(`SELECT g.name AS n FROM ${BOOK_GENRE_ROLLUP} j JOIN genre g ON g.id = j.genre_id AND g.deleted_at IS NULL WHERE j.book_id = b.id AND j.deleted_at IS NULL`)} AS genres,
       ${join(`SELECT t.name AS n FROM book_trope j JOIN trope t ON t.id = j.trope_id AND t.deleted_at IS NULL WHERE j.book_id = b.id AND j.deleted_at IS NULL`)} AS tropes,
       ${join(`SELECT t.name AS n FROM book_theme j JOIN theme t ON t.id = j.theme_id AND t.deleted_at IS NULL WHERE j.book_id = b.id AND j.deleted_at IS NULL`)} AS themes
     FROM book b WHERE b.deleted_at IS NULL`);
  const list = (s: string | null) => (s ? s.split(SEP) : []);
  return rows.map((r) => ({ id: r.id, title: r.title, position: r.position, pages: r.pages, rating: r.rating, series: r.series, authors: list(r.authors), characters: list(r.characters), narrators: list(r.narrators), genres: list(r.genres), tropes: list(r.tropes), themes: list(r.themes) }));
}

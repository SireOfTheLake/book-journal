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

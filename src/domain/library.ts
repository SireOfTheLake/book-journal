import { byTitle } from './sortKey';
import type { LibraryBook, LibraryStatus } from '../repo/library';

export type StatusFilter = 'all' | LibraryStatus | 'none';
export type SortKey = 'title' | 'author' | 'finished' | 'added' | 'rating';

export const STATUS_LABEL: Record<LibraryStatus | 'none', string> = {
  finished: 'Read', reading: 'In progress', on_hold: 'Paused', dnf: 'DNF', up_next: 'Up Next', tbr: 'TBR', none: 'Not started',
};

const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Every word you type must be found somewhere in the title, authors, series, narrators, or characters.
export function matchesSearch(b: LibraryBook, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = fold([b.title, b.authors, b.series, b.narrators, b.characters].filter(Boolean).join(' | '));
  return words.every((w) => hay.includes(w));
}

export type TagMode = 'all' | 'any';
export interface LibraryFilters {
  query: string; status: StatusFilter; favorites: boolean; noCover: boolean;
  tags?: string[]; tagMode?: TagMode; bookTags?: Record<string, string[]>; // tags are 'genre:<id>' keys; bookTags maps a key to the books that have it
}

export function filterLibrary(books: LibraryBook[], f: LibraryFilters): LibraryBook[] {
  const lookup = new Map((f.tags ?? []).map((t) => [t, new Set(f.bookTags?.[t] ?? [])]));
  const tagOk = (id: string) => { const t = f.tags ?? []; if (!t.length) return true; const has = (k: string) => lookup.get(k)?.has(id) ?? false; return (f.tagMode ?? 'all') === 'all' ? t.every(has) : t.some(has); };
  return books.filter((b) => tagOk(b.id) && matchesSearch(b, f.query)
    && (f.status === 'all' || (f.status === 'none' ? b.status === null : b.status === f.status))
    && (!f.favorites || b.is_favorite === 1) && (!f.noCover || (b.has_cover === 0 && !b.placeholder_permanent)));
}

const text = (a: string | null, b: string | null) => (a == null || b == null) ? (a == null ? (b == null ? 0 : 1) : -1) : byTitle(a, b);
const newestFirst = (a: string | null, b: string | null) => (a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? 1 : -1); // blanks last

export function sortLibrary(books: LibraryBook[], key: SortKey): LibraryBook[] {
  const by: Record<SortKey, (a: LibraryBook, b: LibraryBook) => number> = {
    title: (a, b) => text(a.title, b.title),
    author: (a, b) => text(a.authors, b.authors) || text(a.title, b.title),
    finished: (a, b) => newestFirst(a.finish_date, b.finish_date) || text(a.title, b.title),
    added: (a, b) => newestFirst(a.added, b.added) || text(a.title, b.title),
    rating: (a, b) => (a.rating === b.rating ? text(a.title, b.title) : a.rating === null ? 1 : b.rating === null ? -1 : b.rating - a.rating),
  };
  return [...books].sort(by[key]);
}

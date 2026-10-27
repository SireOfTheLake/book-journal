// The random book options of the prompt randomizer: which books can come up. Pure functions, tested with plain lists.
// A "main" book has a whole-number place in its series (1, 2, 3...); a novella has a fractional one (0.5, 1.5).
export interface LibBook {
  id: string; title: string; authors: string | null;
  series_id: string | null; series: string | null; position: number | null;
  shelf: 'tbr' | 'up_next' | null;
  read: boolean; // finished, or being read now
  unreleased: boolean;
}
export type RandomType = 'book' | 'series_book' | 'series';
export const RANDOM_TYPES: { type: RandomType; label: string }[] = [
  { type: 'book', label: 'Random Book' }, { type: 'series_book', label: 'Random Book from Series' }, { type: 'series', label: 'Random Series' },
];
export interface SeriesPool { id: string; title: string; books: LibBook[] }
export interface RandomPool { book: LibBook[]; series_book: LibBook[]; series: SeriesPool[] }

export const isNovella = (b: { position: number | null }) => b.position !== null && !Number.isInteger(b.position);
const byPosition = (a: LibBook, b: LibBook) => (a.position ?? 1e9) - (b.position ?? 1e9);
// Only books on the TBR shelf that are out (in at least one format) can come up.
export const canCome = (b: LibBook) => b.shelf === 'tbr' && !b.unreleased && !b.read;

// A series you are reading in order: you have read book 1 and every main book up to the last one you read, with none missing before them.
// Novellas are ignored when deciding that. Returns the book to read next (a novella or a main book, whichever comes next), or null.
export function sequentialNext(books: LibBook[]): LibBook | null {
  const placed = books.filter((b) => b.position !== null).sort(byPosition);
  const main = placed.filter((b) => !isNovella(b));
  const readMain = main.filter((b) => b.read);
  if (readMain.length === 0) return null;
  if (!readMain.every((b, i) => b === main[i])) return null; // a main book before one you read is still unread: you started in the middle
  const furthest = Math.max(...placed.filter((b) => b.read).map((b) => b.position as number));
  return placed.find((b) => !b.read && (b.position as number) > furthest) ?? null;
}

// Where to begin with a series you are not reading in order (not started, or started in the middle): its first book.
export function firstBook(books: LibBook[]): LibBook | null {
  const placed = books.filter((b) => b.position !== null && !b.read).sort(byPosition);
  return placed.find((b) => !isNovella(b)) ?? placed[0] ?? null;
}

export function buildPool(all: LibBook[]): RandomPool {
  const pool: RandomPool = { book: [], series_book: [], series: [] };
  const bySeries = new Map<string, LibBook[]>();
  for (const b of all) {
    if (!b.series_id) { if (canCome(b)) pool.book.push(b); continue; }
    bySeries.set(b.series_id, [...(bySeries.get(b.series_id) ?? []), b]);
  }
  for (const books of bySeries.values()) {
    const next = sequentialNext(books);
    if (next) { if (canCome(next)) { pool.series_book.push(next); pool.book.push(next); } continue; }
    const start = firstBook(books);
    if (start && canCome(start)) pool.book.push(start);
  }
  for (const [id, books] of bySeries) {
    const unread = books.filter(canCome).sort(byPosition);
    if (unread.length >= 2) pool.series.push({ id, title: books[0].series ?? 'Series', books: unread });
  }
  return pool;
}

export const poolCount = (pool: RandomPool, type: RandomType): number => pool[type].length;

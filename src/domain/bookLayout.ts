// The Book Log layout: which cards there are, where they sit and how big they are.
//
// Positions: `col` 0 is the cover column (cards there are one column wide and as tall as their content; `row` is only their order).
// Columns 1-4 are the grid. A card is `w` columns wide (1-4) and `h` half-squares tall (2 = one square, 1 = half a square, any number up to the
// bottom). Rows have no set height: each row is as tall as the tallest card in it (see solveRows).
//
// A layout is stored under a name (`layoutKey`). Only "default" is used today; per-status or per-book layouts can be added later by
// choosing a different key in `layoutKeyFor`, and custom cards by adding ids to the card list that carry their own definition.
import type { FeatureKey } from '../repo/features';

export const GRID_COLS = 4;
export type CardId =
  | 'status' | 'rating' | 'title' | 'authors' | 'owned'
  | 'series' | 'dates' | 'pov' | 'genres' | 'length' | 'heat' | 'tropes' | 'themes' | 'mood' | 'pace' | 'warnings'
  | 'format' | 'source' | 'setting' | 'timeperiod' | 'published' | 'recommended' | 'whystopped' | 'reason'
  | 'narrators' | 'challenges' | 'notes' | 'characters' | 'quotes' | 'daylog';

export interface CardDef {
  id: CardId; label: string;
  /** Size a new card starts with (columns wide, half-squares tall). */
  w: number; h: number;
  /** The card only exists while this feature is on. */
  feature?: FeatureKey;
  /** What the card is, shown when adding it. */
  about: string;
  /** Placeholder lines for the layout editor. */
  sample: string[];
  /** Fixed width when it sits in the cover column is always 1. */
}
export const CARD_DEFS: CardDef[] = [
  { id: 'status', label: 'Status', w: 1, h: 2, about: 'Where the book is: TBR, Up Next, reading, finished…', sample: ['[ Finished ▾ ]'] },
  { id: 'rating', label: 'Rating', w: 1, h: 2, about: 'Your star rating for this read.', sample: ['★ ★ ★ ★ ☆'] },
  { id: 'title', label: 'Title', w: 1, h: 2, about: 'The book’s title.', sample: ['The Book Title'] },
  { id: 'authors', label: 'Authors', w: 1, h: 2, about: 'Who wrote it.', sample: ['Author One', 'Author Two'] },
  { id: 'owned', label: 'Copies I own', w: 1, h: 2, feature: 'owned', about: 'Whether you own a physical, ebook or audio copy.', sample: ['[Physical] [Audio] [Ebook]'] },
  { id: 'series', label: 'Series', w: 1, h: 2, about: 'The series and the book’s place in it.', sample: ['‹ The Series ›', 'Book 2 of 5'] },
  { id: 'dates', label: 'Dates', w: 1, h: 2, about: 'When you started and finished.', sample: ['Started 2026-01-02', 'Finished 2026-01-09'] },
  { id: 'pov', label: 'Point of view', w: 1, h: 2, about: 'Single, dual or multi, and 1st, 2nd or 3rd person.', sample: ['Dual', '3rd'] },
  { id: 'genres', label: 'Genres', w: 1, h: 2, about: 'Genre tags.', sample: ['Romance', 'Fantasy'] },
  { id: 'length', label: 'Length', w: 1, h: 2, about: 'Pages and audio length.', sample: ['Pages 352', 'Audio 10:30'] },
  { id: 'heat', label: 'Heat level', w: 1, h: 2, about: 'How steamy the book is.', sample: ['1 2 3 4 5'] },
  { id: 'tropes', label: 'Tropes', w: 1, h: 2, about: 'Trope tags.', sample: ['found family', 'slow burn'] },
  { id: 'themes', label: 'Themes', w: 1, h: 2, about: 'Theme tags.', sample: ['grief', 'healing'] },
  { id: 'mood', label: 'Mood', w: 1, h: 2, feature: 'moodpace', about: 'Mood tags.', sample: ['cozy', 'tense'] },
  { id: 'pace', label: 'Pace', w: 1, h: 2, feature: 'moodpace', about: 'Pace tags.', sample: ['fast', 'slow'] },
  { id: 'warnings', label: 'Content warnings', w: 1, h: 2, feature: 'warnings', about: 'Content warning tags.', sample: ['violence'] },
  { id: 'format', label: 'Format', w: 1, h: 2, about: 'Physical, audio or ebook for this read.', sample: ['[Physical] [Audio] [Ebook]'] },
  { id: 'source', label: 'Source', w: 1, h: 2, about: 'Where you got this read.', sample: ['Library'] },
  { id: 'setting', label: 'Setting', w: 1, h: 1, about: 'Where the book takes place.', sample: ['Toronto, Canada'] },
  { id: 'timeperiod', label: 'Time period', w: 1, h: 1, about: 'When the book takes place.', sample: ['Contemporary'] },
  { id: 'published', label: 'Originally published', w: 1, h: 2, about: 'The date it was first published.', sample: ['2021-05-04'] },
  { id: 'recommended', label: 'Recommended by', w: 1, h: 2, feature: 'recommender', about: 'Who or what recommended it.', sample: ['A friend'] },
  { id: 'whystopped', label: 'Why I stopped', w: 1, h: 2, feature: 'whystopped', about: 'Why and where you stopped a DNF.', sample: ['It dragged', 'Page 120'] },
  { id: 'reason', label: 'Reason for reading', w: 1, h: 2, about: 'Which challenge prompt you picked this book for.', sample: ['100 Prompts', 'A book with a map'] },
  { id: 'narrators', label: 'Narrators', w: 3, h: 2, about: 'Narrators, narration style and who voiced whom.', sample: ['Narrator One', 'Narrator Two', 'Dual narration'] },
  { id: 'challenges', label: 'Challenges', w: 1, h: 2, about: 'Reading challenges this book counts for.', sample: ['100 Prompts: Prompt 12'] },
  { id: 'notes', label: 'Notes', w: 3, h: 2, about: 'Your notes on this read.', sample: ['I loved this because…'] },
  { id: 'characters', label: 'Characters in this book', w: 4, h: 2, about: 'Main and side characters.', sample: ['Main: Ewan, Sam', 'Side: Jo'] },
  { id: 'quotes', label: 'Quotes', w: 4, h: 2, feature: 'quotes', about: 'Passages you saved.', sample: ['“A line worth keeping.”'] },
  { id: 'daylog', label: 'Day log', w: 4, h: 2, about: 'Where you got to each day.', sample: ['Mon · page 40', 'Tue · page 95'] },
];
export const DEF = new Map(CARD_DEFS.map((d) => [d.id, d]));
export const isCardId = (v: unknown): v is CardId => typeof v === 'string' && DEF.has(v as CardId);

export interface LayoutCard { id: CardId; col: number; row: number; w: number; h: number }
export interface BookLayout { v: 1; cards: LayoutCard[] }
export type Flags = Partial<Record<FeatureKey, boolean>>;

const c = (id: CardId, col: number, row: number, w?: number, h?: number): LayoutCard => ({ id, col, row, w: w ?? DEF.get(id)!.w, h: h ?? DEF.get(id)!.h });
// The layout the Book Log has always had (the cover column, then four columns across).
export const DEFAULT_CARDS: LayoutCard[] = [
  c('status', 0, 0, 1, 2), c('rating', 0, 1, 1, 2), c('title', 0, 2, 1, 2), c('authors', 0, 3, 1, 2), c('owned', 0, 4, 1, 2), c('recommended', 0, 5, 1, 2),
  c('series', 1, 0), c('dates', 2, 0), c('pov', 3, 0), c('genres', 4, 0),
  c('length', 1, 2), c('heat', 2, 2), c('tropes', 3, 2), c('themes', 4, 2),
  c('format', 1, 4), c('source', 2, 4), c('setting', 3, 4), c('timeperiod', 3, 5), c('published', 4, 4),
  c('reason', 1, 6), c('narrators', 2, 6),
  c('challenges', 1, 8), c('notes', 2, 8),
  c('characters', 1, 10), c('daylog', 1, 12), c('quotes', 1, 14),
];
export const defaultLayout = (): BookLayout => ({ v: 1, cards: DEFAULT_CARDS.map((x) => ({ ...x })) });

/** Which stored layout a book uses. Today there is one for everything; later it can depend on the book's status or the book itself. */
export const layoutKeyFor = (_book?: { id: string; shelf: string | null }): string => 'default';

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n)));
const gridCards = (cards: LayoutCard[]) => cards.filter((x) => x.col > 0);
const overlaps = (a: LayoutCard, b: LayoutCard) => a.col < b.col + b.w && b.col < a.col + a.w && a.row < b.row + b.h && b.row < a.row + a.h;

/** Settles a layout: nothing overlaps, nothing floats above a gap, and the cover column is in order. `anchor` (the card you are moving) keeps its place; the others make room. */
export function settle(cards: LayoutCard[], anchor?: CardId): LayoutCard[] {
  const cover = cards.filter((x) => x.col === 0).sort((a, b) => a.row - b.row).map((x, i) => ({ ...x, w: 1, row: i }));
  const grid = gridCards(cards).map((x) => ({ ...x, col: clamp(x.col, 1, GRID_COLS), w: clamp(x.w, 1, GRID_COLS), h: Math.max(1, Math.round(x.h)), row: Math.max(0, Math.round(x.row)) }))
    .map((x) => ({ ...x, col: Math.min(x.col, GRID_COLS + 1 - x.w) }));
  const placed: LayoutCard[] = [];
  const first = grid.find((x) => x.id === anchor);
  if (first) placed.push(first);
  for (const x of grid.filter((y) => y.id !== anchor).sort((a, b) => a.row - b.row || a.col - b.col)) {
    const me = { ...x };
    while (me.row > 0 && !placed.some((p) => overlaps({ ...me, row: me.row - 1 }, p))) me.row--; // float up
    while (placed.some((p) => overlaps(me, p))) me.row++; // make room
    placed.push(me);
  }
  const order = new Map(cards.map((x, i) => [x.id, i]));
  return [...cover, ...placed].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

/** Cleans up what was stored: unknown or repeated cards go, sizes are clamped, cards of a feature that is off go, and cards of a feature that is on appear at the bottom. */
export function normalizeLayout(raw: unknown, flags: Flags): BookLayout {
  const list = (raw as { cards?: unknown } | null)?.cards;
  const out: LayoutCard[] = [];
  if (Array.isArray(list)) {
    for (const r of list as Partial<LayoutCard>[]) {
      if (!r || !isCardId(r.id) || out.some((x) => x.id === r.id)) continue;
      out.push({ id: r.id, col: clamp(Number(r.col), 0, GRID_COLS), row: Math.max(0, Math.round(Number(r.row) || 0)), w: clamp(Number(r.w) || 1, 1, GRID_COLS), h: Math.max(1, Math.round(Number(r.h) || 2)) });
    }
  }
  const base = Array.isArray(list) ? out : defaultLayout().cards;
  const kept = base.filter((x) => { const f = DEF.get(x.id)!.feature; return !f || flags[f] !== false; });
  // A feature that is on but has no card yet gets one at the bottom
  const bottom = () => gridCards(kept).reduce((m, x) => Math.max(m, x.row + x.h), 0);
  for (const d of CARD_DEFS) {
    if (!d.feature || flags[d.feature] === false || kept.some((x) => x.id === d.id)) continue;
    if (!Array.isArray(list) && DEFAULT_CARDS.some((x) => x.id === d.id)) continue;
    kept.push({ id: d.id, col: 1, row: bottom(), w: d.w, h: d.h });
  }
  return { v: 1, cards: settle(kept) };
}

export function moveCard(layout: BookLayout, id: CardId, col: number, row: number): BookLayout {
  const cards = layout.cards.map((x) => (x.id === id ? { ...x, col: col <= 0 ? 0 : col, w: col <= 0 ? 1 : x.w, row: col <= 0 ? row : row } : x));
  return { v: 1, cards: settle(cards, id) };
}
export function resizeCard(layout: BookLayout, id: CardId, w: number, h: number): BookLayout {
  const cards = layout.cards.map((x) => (x.id === id && x.col > 0 ? { ...x, w: clamp(w, 1, GRID_COLS + 1 - x.col), h: Math.max(1, Math.round(h)) } : x));
  return { v: 1, cards: settle(cards, id) };
}
export const removeCard = (layout: BookLayout, id: CardId): BookLayout => ({ v: 1, cards: settle(layout.cards.filter((x) => x.id !== id)) });
export function addCard(layout: BookLayout, id: CardId): BookLayout {
  if (layout.cards.some((x) => x.id === id)) return layout;
  const d = DEF.get(id)!;
  const bottom = gridCards(layout.cards).reduce((m, x) => Math.max(m, x.row + x.h), 0);
  return { v: 1, cards: settle([...layout.cards, { id, col: 1, row: bottom, w: d.w, h: d.h }]) };
}
/** Cards that are not in the layout (removed ones, and ones of features that are off), for the Add card menu. */
export const missingCards = (layout: BookLayout): CardDef[] => CARD_DEFS.filter((d) => !layout.cards.some((x) => x.id === d.id));

/**
 * Row heights, in pixels. A row is only as tall as the tallest card in it. When a card needs more room than the rows it covers
 * give it, the extra goes to the card's last row, so it is the bottom card beside a tall one that grows.
 */
export function solveRows(cards: LayoutCard[], natural: Record<string, number>, gap: number): number[] {
  const grid = gridCards(cards);
  const rows = grid.reduce((m, x) => Math.max(m, x.row + x.h), 0);
  const tracks = Array.from({ length: rows }, () => 0);
  for (const x of [...grid].sort((a, b) => a.row + a.h - (b.row + b.h) || a.row - b.row)) {
    const need = natural[x.id] ?? 0;
    let have = gap * (x.h - 1);
    for (let r = x.row; r < x.row + x.h; r++) have += tracks[r];
    if (need > have) tracks[x.row + x.h - 1] += need - have;
  }
  return tracks;
}

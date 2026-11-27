import { fold } from './search';

// Advanced search: several conditions on a book (title, author, character, series...), joined by "all" or "any", with a sort.
// Pure functions over a plain list of facts, so the same search works on All Books and on TBR & Up Next.

export interface BookFacts {
  id: string; title: string; authors: string[]; characters: string[]; narrators: string[];
  series: string | null; position: number | null; genres: string[]; tropes: string[]; themes: string[];
  pages: number | null; rating: number | null; // rating in stars (0 to 5)
}

export type TextField = 'title' | 'author' | 'character' | 'narrator' | 'series' | 'genre' | 'trope' | 'theme';
export type NumberField = 'pages' | 'rating';
export type Field = TextField | NumberField;
export type TextOp = 'contains' | 'not_contains' | 'starts' | 'is' | 'is_not';
export type NumberOp = 'gte' | 'lte' | 'eq';

export const FIELDS: { value: Field; label: string; kind: 'text' | 'number' }[] = [
  { value: 'title', label: 'Title', kind: 'text' }, { value: 'author', label: 'Author', kind: 'text' }, { value: 'character', label: 'Character', kind: 'text' },
  { value: 'series', label: 'Series', kind: 'text' }, { value: 'narrator', label: 'Narrator', kind: 'text' }, { value: 'genre', label: 'Genre', kind: 'text' },
  { value: 'trope', label: 'Trope', kind: 'text' }, { value: 'theme', label: 'Theme', kind: 'text' },
  { value: 'pages', label: 'Pages', kind: 'number' }, { value: 'rating', label: 'Rating (stars)', kind: 'number' },
];
export const TEXT_OPS: { value: TextOp; label: string }[] = [
  { value: 'contains', label: 'contains' }, { value: 'starts', label: 'starts with' }, { value: 'is', label: 'is' },
  { value: 'not_contains', label: 'does not contain' }, { value: 'is_not', label: 'is not' },
];
export const NUMBER_OPS: { value: NumberOp; label: string }[] = [{ value: 'gte', label: 'at least' }, { value: 'lte', label: 'at most' }, { value: 'eq', label: 'exactly' }];
export const isNumberField = (f: Field): f is NumberField => f === 'pages' || f === 'rating';

export interface Condition { id: number; field: Field; op: TextOp | NumberOp; value: string }
export type SortKey = 'none' | 'pages' | 'title' | 'author' | 'rating' | 'series';
export interface Advanced { conds: Condition[]; match: 'all' | 'any'; sort: SortKey; desc: boolean }
export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'none', label: 'Keep the list order' }, { value: 'pages', label: 'Page count' }, { value: 'title', label: 'Title' },
  { value: 'author', label: 'Author' }, { value: 'series', label: 'Series' }, { value: 'rating', label: 'Rating' },
];

export const emptyAdvanced = (): Advanced => ({ conds: [], match: 'all', sort: 'none', desc: false });
export const newCondition = (id: number, field: Field = 'title'): Condition => ({ id, field, op: isNumberField(field) ? 'gte' : 'contains', value: '' });
const blank = (c: Condition) => c.value.trim() === '';
/** Conditions that have a value. A half-filled row is ignored, not an error. */
export const activeConditions = (a: Advanced) => a.conds.filter((c) => !blank(c));
export const isActive = (a: Advanced) => activeConditions(a).length > 0 || a.sort !== 'none';

const valuesOf = (b: BookFacts, f: TextField): string[] => {
  switch (f) {
    case 'title': return [b.title];
    case 'author': return b.authors;
    case 'character': return b.characters;
    case 'narrator': return b.narrators;
    case 'series': return b.series ? [b.series] : [];
    case 'genre': return b.genres;
    case 'trope': return b.tropes;
    default: return b.themes;
  }
};

function textMatch(vals: string[], op: TextOp, raw: string): boolean {
  const want = fold(raw.trim());
  const hit = (v: string, o: 'contains' | 'starts' | 'is') => { const x = fold(v); return o === 'contains' ? x.includes(want) : o === 'starts' ? x.startsWith(want) : x === want; };
  if (op === 'not_contains') return !vals.some((v) => hit(v, 'contains'));
  if (op === 'is_not') return !vals.some((v) => hit(v, 'is'));
  return vals.some((v) => hit(v, op));
}

function numberMatch(n: number | null, op: NumberOp, raw: string): boolean {
  const want = Number(raw);
  if (n === null || !Number.isFinite(want)) return false;
  return op === 'gte' ? n >= want : op === 'lte' ? n <= want : n === want;
}

export function matchesCondition(b: BookFacts, c: Condition): boolean {
  if (isNumberField(c.field)) return numberMatch(c.field === 'pages' ? b.pages : b.rating, c.op as NumberOp, c.value);
  return textMatch(valuesOf(b, c.field), c.op as TextOp, c.value);
}

const key = (b: BookFacts, s: Exclude<SortKey, 'none'>): string | number | null => {
  switch (s) {
    case 'pages': return b.pages;
    case 'rating': return b.rating;
    case 'title': return fold(b.title).replace(/^the /, '');
    case 'author': return b.authors[0] ? fold(b.authors[0]) : null;
    default: return b.series ? `${fold(b.series)}|${String(b.position ?? 9999).padStart(6, '0')}` : null;
  }
};

/** The ids of the books that fit, in the order to show them (sorted when a sort is chosen; books with nothing to sort by go last). */
export function runAdvanced(facts: readonly BookFacts[], a: Advanced): string[] {
  const conds = activeConditions(a);
  let hits = facts.filter((b) => !conds.length || (a.match === 'all' ? conds.every((c) => matchesCondition(b, c)) : conds.some((c) => matchesCondition(b, c))));
  if (a.sort !== 'none') {
    const s = a.sort;
    hits = [...hits].sort((x, y) => {
      const kx = key(x, s), ky = key(y, s);
      if (kx === null || ky === null) return kx === ky ? 0 : kx === null ? 1 : -1; // empty last, whichever way it is sorted
      const d = kx < ky ? -1 : kx > ky ? 1 : 0;
      return a.desc ? -d : d;
    });
  }
  return hits.map((b) => b.id);
}

/** One line saying what is being searched for, e.g. for a "no matches" message. */
export function describeAdvanced(a: Advanced): string {
  const f = (v: Field) => FIELDS.find((x) => x.value === v)!.label.toLowerCase();
  const o = (c: Condition) => (isNumberField(c.field) ? NUMBER_OPS : TEXT_OPS).find((x) => x.value === c.op)?.label ?? '';
  return activeConditions(a).map((c) => `${f(c.field)} ${o(c)} "${c.value.trim()}"`).join(a.match === 'all' ? ' and ' : ' or ');
}

/** Keeps the items an advanced search found. With `ordered`, they also take the search's order (its sort). */
export function narrowBy<T extends { id: string }>(list: readonly T[], ids: readonly string[] | null, ordered: boolean): T[] {
  if (!ids) return [...list];
  if (!ordered) { const keep = new Set(ids); return list.filter((x) => keep.has(x.id)); }
  const at = new Map(list.map((x) => [x.id, x]));
  return ids.flatMap((id) => { const x = at.get(id); return x ? [x] : []; });
}

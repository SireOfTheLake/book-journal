import { byTitle } from './sortKey';
export type SearchKind = 'book' | 'series' | 'author' | 'narrator' | 'character' | 'universe' | 'genre' | 'trope' | 'theme';

export interface SearchItem { kind: SearchKind; id: string; label: string; sub?: string | null; extra?: string[] }
export interface SearchGroup { kind: SearchKind; title: string; items: SearchItem[] }

// The order the results appear in: your library first, then the tags underneath.
export const SEARCH_ORDER: { kind: SearchKind; title: string }[] = [
  { kind: 'book', title: 'Books' }, { kind: 'series', title: 'Series' }, { kind: 'author', title: 'Authors' },
  { kind: 'narrator', title: 'Narrators' }, { kind: 'character', title: 'Characters' }, { kind: 'universe', title: 'Universes' },
  { kind: 'genre', title: 'Genres' }, { kind: 'trope', title: 'Tropes' }, { kind: 'theme', title: 'Themes' },
];

export const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const TAG_KINDS = ['genre', 'trope', 'theme'] as const;
export type TagKind = (typeof TAG_KINDS)[number];
export const isTagKind = (k: string): k is TagKind => (TAG_KINDS as readonly string[]).includes(k);

/** Where picking a result takes you. */
export function searchPath(i: Pick<SearchItem, 'kind' | 'id'>): string {
  switch (i.kind) {
    case 'book': return `/book/${i.id}`;
    case 'series': return `/series/${i.id}`;
    case 'author': return `/authors/${i.id}`;
    case 'narrator': return `/narrators/${i.id}`;
    case 'character': return `/characters/${i.id}`;
    case 'universe': return `/universes/${i.id}`;
    default: return `/library?tag=${i.kind}:${i.id}`;
  }
}

// Every word typed must appear in the label (or an alias/extra). Names that start with the query rank first.
export function searchAll(items: SearchItem[], query: string, perGroup = 6): SearchGroup[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const score = (i: SearchItem): number | null => {
    const label = fold(i.label);
    const hay = [label, ...(i.extra ?? []).map(fold)].join(' | ');
    if (!words.every((w) => hay.includes(w))) return null;
    if (label.startsWith(words[0])) return 0;
    if (label.split(/[\s,-]+/).some((p) => p.startsWith(words[0]))) return 1;
    return 2;
  };
  return SEARCH_ORDER.flatMap(({ kind, title }) => {
    const hits = items.filter((i) => i.kind === kind)
      .flatMap((i) => { const s = score(i); return s === null ? [] : [{ i, s }]; })
      .sort((a, b) => a.s - b.s || byTitle(a.i.label, b.i.label))
      .slice(0, perGroup).map((h) => h.i);
    return hits.length ? [{ kind, title, items: hits }] : [];
  });
}

/** A search that starts with @ # ! or * only looks in one kind of thing: @ people, # series and universes, ! books, * genres, tropes and themes. */
export const PREFIXES: { key: string; title: string; kinds: SearchKind[] }[] = [
  { key: '@', title: 'People and characters', kinds: ['author', 'narrator', 'character'] },
  { key: '#', title: 'Series and universes', kinds: ['series', 'universe'] },
  { key: '!', title: 'Books', kinds: ['book'] },
  { key: '*', title: 'Genres, tropes and themes', kinds: ['genre', 'trope', 'theme'] },
];
export function narrowQuery(q: string): { kinds: SearchKind[] | null; text: string; prefix: string | null } {
  const p = PREFIXES.find((x) => q.trimStart().startsWith(x.key));
  return p ? { kinds: p.kinds, text: q.trimStart().slice(1).trim(), prefix: p.key } : { kinds: null, text: q.trim(), prefix: null };
}

/** The places in the app, so the quick search can also jump to a page. */
export const PAGES: { label: string; path: string }[] = [
  { label: 'All Books', path: '/library' }, { label: 'TBR & Up Next', path: '/shelf' }, { label: 'Book list', path: '/journal/book-list' },
  { label: 'Calendar', path: '/journal/calendar' }, { label: 'Month chart', path: '/journal/month-chart' }, { label: 'Book bracket', path: '/journal/bracket' },
  { label: 'Trackers', path: '/journal/tracker' }, { label: 'Overview and goals', path: '/journal/overview' }, { label: 'Dashboard', path: '/journal/dashboard' },
  { label: 'Challenges', path: '/journal/challenges' }, { label: 'Prompt randomizer', path: '/journal/randomizer' }, { label: 'Board game', path: '/journal/board-game' },
  { label: 'Import', path: '/import' }, { label: 'Settings and themes', path: '/settings' },
];
export const searchPages = (q: string, limit = 4) => { const w = fold(q).split(/\s+/).filter(Boolean); return w.length ? PAGES.filter((p) => w.every((x) => fold(p.label).includes(x))).slice(0, limit) : []; };

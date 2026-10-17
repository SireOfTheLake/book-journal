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
      .sort((a, b) => a.s - b.s || a.i.label.localeCompare(b.i.label))
      .slice(0, perGroup).map((h) => h.i);
    return hits.length ? [{ kind, title, items: hits }] : [];
  });
}

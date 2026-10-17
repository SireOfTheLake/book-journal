import { parseCsvRecords } from './csv';
import { parseRelation, splitOrigin } from './notion';

// One person mentioned in a text property, such as "Troy Nichols (<link>) (old teammate)".
export interface Ref {
  name: string;
  origin: string | null; // "Hole" in "Ray (Hole)"
  notionId: string | null;
  label: string | null; // "old teammate"
  linked: boolean; // has a Notion page (so it is a featured character)
}

export interface CharacterRow {
  index: number;
  name: string;
  origin: string | null;
  notionId: string | null; // learned from other rows' links to this character
  nicknames: Ref[];
  previousNames: Ref[];
  place: string | null;
  previousPlaces: string[];
  occupations: string[];
  organization: string | null;
  sexuality: string | null;
  tags: string[];
  partners: Ref[];
  previousPartners: Ref[];
  family: Ref[];
  friends: Ref[];
  mainBooks: string[];
  sideBooks: string[];
}

export interface CharacterPlan {
  rows: CharacterRow[];
  places: { name: string; count: number }[];
  warnings: { name: string | null; message: string }[];
}

// Splits on commas that are not inside parentheses, so "Mary (mother, deceased), David (father)" is two people.
export function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

// Finds a link like (Ray%20(Hole)%20330a...csv) or (https://...-<id>?pvs=21), allowing parentheses inside the link.
function findLink(s: string): { start: number; end: number; id: string | null } | null {
  const file = /([0-9a-f]{32})\.(?:md|csv)\)/.exec(s);
  if (file) {
    let depth = 1;
    for (let i = file.index - 1; i >= 0; i--) {
      if (s[i] === ')') depth++;
      else if (s[i] === '(' && --depth === 0) return { start: i, end: file.index + file[0].length, id: file[1] };
    }
  }
  const url = /\(https?:\/\/[^)\s]*\)/.exec(s);
  if (url) return { start: url.index, end: url.index + url[0].length, id: /([0-9a-f]{32})/.exec(url[0])?.[1] ?? null };
  return null;
}

export function parseRef(item: string): Ref | null {
  const s = item.trim();
  if (!s) return null;
  const link = findLink(s);
  if (link) {
    const { name, origin } = splitOrigin(s.slice(0, link.start));
    const labels = [...s.slice(link.end).matchAll(/\(([^()]*)\)/g)].map((m) => m[1].trim()).filter(Boolean);
    return { name, origin, notionId: link.id, label: labels.join('; ') || null, linked: true };
  }
  // No link: a single trailing parenthesis is a label ("Aileen (mother)").
  const m = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(s);
  return m && m[1] ? { name: m[1].trim(), origin: null, notionId: null, label: m[2].trim() || null, linked: false }
    : { name: s, origin: null, notionId: null, label: null, linked: false };
}

export function parseRefs(cell: string): Ref[] {
  return splitTopLevel(cell).map(parseRef).filter((r): r is Ref => r !== null);
}

const placeKey = (s: string) => s.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();

export function planNotionCharacters(csvText: string): CharacterPlan {
  const records = parseCsvRecords(csvText);
  const warnings: CharacterPlan['warnings'] = [];
  if (records.length && !('Name' in records[0])) warnings.push({ name: null, message: 'The file has no "Name" column. Is it the characters export?' });
  const get = (r: Record<string, string>, k: string) => (r[k] ?? '').trim();

  const rows: CharacterRow[] = records
    .filter((r) => get(r, 'Name'))
    .map((r, index) => {
      const { name, origin } = splitOrigin(get(r, 'Name'));
      const titles = (cell: string) => parseRelation(cell).map((c) => c.rawName);
      return {
        index, name, origin, notionId: null,
        nicknames: parseRefs(get(r, 'Nicknames')), previousNames: parseRefs(get(r, 'Previous Names')),
        place: get(r, 'Current City/Town/Country') || null, previousPlaces: splitTopLevel(get(r, 'Previous City/Town/Country')),
        occupations: splitTopLevel(get(r, 'Occupation')), organization: get(r, 'Organization') || null,
        sexuality: get(r, 'Sexuality') || null, tags: splitTopLevel(get(r, 'Tags')),
        partners: parseRefs(get(r, 'Current Partner')), previousPartners: parseRefs(get(r, 'Previous Partners')),
        family: parseRefs(get(r, 'Family')), friends: parseRefs(get(r, 'Friends')),
        mainBooks: titles(get(r, 'Books - Main Character')), sideBooks: titles(get(r, 'Books - Side Character')),
      };
    });

  // Other characters link to each page by id, which tells us each row's own Notion page id.
  const ids = new Map<string, string>();
  for (const row of rows) for (const ref of [...row.partners, ...row.previousPartners, ...row.family, ...row.friends]) {
    if (ref.notionId) ids.set(`${ref.name}|${ref.origin ?? ''}`.toLowerCase(), ref.notionId);
  }
  for (const row of rows) row.notionId = ids.get(`${row.name}|${row.origin ?? ''}`.toLowerCase()) ?? null;

  // Spellings of the same place ("St. Louis" and "St Louis") are merged; the first spelling wins.
  const canon = new Map<string, { name: string; count: number; spellings: Set<string> }>();
  for (const row of rows) for (const p of [row.place, ...row.previousPlaces]) {
    if (!p) continue;
    const e = canon.get(placeKey(p));
    if (e) { e.count++; e.spellings.add(p); } else canon.set(placeKey(p), { name: p, count: 1, spellings: new Set([p]) });
  }
  for (const e of canon.values()) if (e.spellings.size > 1) warnings.push({ name: null, message: `These places look like one place and will be merged: ${[...e.spellings].join(' and ')}.` });
  return { rows, places: [...canon.values()].map(({ name, count }) => ({ name, count })), warnings };
}

export { placeKey };

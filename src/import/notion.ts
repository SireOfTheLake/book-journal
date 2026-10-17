import { parseCsvRecords } from './csv';

export type Format = 'audio' | 'ebook' | 'physical';
export type TagDestination = 'genre' | 'theme' | 'trope' | 'universe' | 'ignore';

export interface PlannedCharacter {
  rawName: string; // exactly as in Notion, for example "Reid (DOLL)"
  name: string; // "Reid"
  origin: string | null; // "DOLL"
  notionId: string | null; // 32-character Notion page id from the link
}

export interface PlannedRow {
  index: number; // 0-based row in the file
  title: string;
  authors: string[];
  narrators: string[];
  series: string | null;
  tags: string[]; // without the "tbr" status tag
  notes: string | null;
  format: Format | null;
  startDate: string | null;
  finishDate: string | null;
  shelf: 'tbr' | 'up_next' | null; // for books without a finish date
  main: PlannedCharacter[];
  side: PlannedCharacter[];
}

export interface PlanWarning {
  index: number | null;
  title: string | null;
  kind: 'date_sequence' | 'date_unparsed' | 'format_unknown' | 'notes_without_read' | 'missing_title' | 'missing_column';
  message: string;
}

export interface TagInfo { tag: string; count: number; suggested: TagDestination }

export interface ImportPlan {
  rows: PlannedRow[];
  tags: TagInfo[];
  warnings: PlanWarning[];
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const pad = (n: number) => String(n).padStart(2, '0');

function parseOneDate(s: string): string | null {
  const t = s.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(t); // July 21, 2025
  if (m) {
    const mi = MONTHS.findIndex((x) => x.startsWith(m![1].toLowerCase().slice(0, 3)));
    if (mi >= 0) return `${m[3]}-${pad(mi + 1)}-${pad(Number(m[2]))}`;
  }
  m = /^(\d{1,2})\s+([A-Za-z]+)\.?\s+(\d{4})$/.exec(t); // 21 July 2025
  if (m) {
    const mi = MONTHS.findIndex((x) => x.startsWith(m![2].toLowerCase().slice(0, 3)));
    if (mi >= 0) return `${m[3]}-${pad(mi + 1)}-${pad(Number(m[1]))}`;
  }
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t); // 7/21/2025 (month first)
  if (m) return `${m[3]}-${pad(Number(m[1]))}-${pad(Number(m[2]))}`;
  return null;
}

// Notion writes one date as "July 21, 2025" and a range as "July 21, 2025 → July 24, 2025".
export function parseNotionDate(s: string): { start: string | null; finish: string } | null {
  const t = s.trim();
  if (!t) return null;
  const parts = t.split(/\s*(?:→|->)\s*/);
  const a = parseOneDate(parts[0]);
  if (!a) return null;
  if (parts.length === 1) return { start: null, finish: a };
  const b = parseOneDate(parts[1]);
  return b ? { start: a, finish: b } : null;
}

export function splitList(s: string): string[] {
  return s.split(',').map((x) => x.trim()).filter(Boolean);
}

// "Reid (DOLL)" -> name "Reid", origin "DOLL". Only a trailing parenthesis counts.
export function splitOrigin(raw: string): { name: string; origin: string | null } {
  const m = /^(.*?)\s*\(([^()]+)\)$/.exec(raw.trim());
  return m && m[1] ? { name: m[1].trim(), origin: m[2].trim() } : { name: raw.trim(), origin: null };
}

// Relation cells look like "Name (https://app.notion.com/p/Name-<id>?pvs=21), Other (https://...)".
export function parseRelation(cell: string): PlannedCharacter[] {
  const out: PlannedCharacter[] = [];
  const make = (raw: string, url: string | null): PlannedCharacter => {
    const { name, origin } = splitOrigin(raw);
    const id = url ? /([0-9a-f]{32})(?:\?|\)|$)/.exec(url)?.[1] ?? null : null;
    return { rawName: raw, name, origin, notionId: id };
  };
  const re = /\(https?:\/\/[^)\s]*\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cell))) {
    const raw = cell.slice(last, m.index).replace(/^[\s,]+/, '').trim();
    if (raw) out.push(make(raw, m[0]));
    last = m.index + m[0].length;
  }
  const rest = cell.slice(last).replace(/^[\s,]+/, '').trim();
  if (rest) for (const n of rest.split(/,\s*/)) if (n) out.push(make(n, null));
  return out;
}

const FORMATS: Record<string, Format> = { audiobook: 'audio', audio: 'audio', ebook: 'ebook', physical: 'physical' };

export function suggestTag(tag: string): TagDestination {
  const t = tag.toLowerCase();
  if (t === 'sadenverse' || t.endsWith('verse')) return 'universe';
  if (t === 'ya') return 'genre';
  return 'trope';
}

const REQUIRED = ['Title', 'Author', 'Characters', 'Connected Characters', 'Date Read', 'Format', 'Narrator', 'Notes', 'Series', 'Tags'];

export function planNotionBooks(csvText: string): ImportPlan {
  const records = parseCsvRecords(csvText);
  const warnings: PlanWarning[] = [];
  const cols = records[0] ? Object.keys(records[0]) : [];
  for (const c of REQUIRED) if (records.length && !cols.includes(c)) warnings.push({ index: null, title: null, kind: 'missing_column', message: `The file has no "${c}" column.` });

  const rows: PlannedRow[] = [];
  records.forEach((r, index) => {
    const title = (r['Title'] ?? '').trim();
    if (!title) { warnings.push({ index, title: null, kind: 'missing_title', message: `Row ${index + 2} has no title and was skipped.` }); return; }
    const tagsAll = splitList(r['Tags'] ?? '');
    const tbr = tagsAll.some((t) => t.toLowerCase() === 'tbr');
    const tags = tagsAll.filter((t) => t.toLowerCase() !== 'tbr');
    const date = parseNotionDate(r['Date Read'] ?? '');
    if ((r['Date Read'] ?? '').trim() && !date) warnings.push({ index, title, kind: 'date_unparsed', message: `Could not read the date "${r['Date Read']}".` });
    const fmtRaw = (r['Format'] ?? '').trim();
    const format = fmtRaw ? FORMATS[fmtRaw.toLowerCase()] ?? null : null;
    if (fmtRaw && !format) warnings.push({ index, title, kind: 'format_unknown', message: `Unknown format "${fmtRaw}".` });
    const notes = (r['Notes'] ?? '').trim() || null;
    if (notes && !date) warnings.push({ index, title, kind: 'notes_without_read', message: 'Has notes but no finish date, so the notes were not imported.' });
    const main = parseRelation(r['Characters'] ?? '');
    const mainIds = new Set(main.map((c) => c.notionId ?? c.rawName));
    const side = parseRelation(r['Connected Characters'] ?? '').filter((c) => !mainIds.has(c.notionId ?? c.rawName));
    rows.push({
      index, title, authors: splitList(r['Author'] ?? ''), narrators: splitList(r['Narrator'] ?? ''),
      series: (r['Series'] ?? '').trim() || null, tags, notes, format,
      startDate: date?.start ?? null, finishDate: date?.finish ?? null,
      shelf: date ? null : tbr ? 'tbr' : 'up_next', main, side,
    });
  });

  // A date whose year differs from both neighbours, when the neighbours agree, is probably a typo.
  const dated = rows.filter((x) => x.finishDate);
  for (let i = 1; i < dated.length - 1; i++) {
    const y = (x: PlannedRow) => x.finishDate!.slice(0, 4);
    if (y(dated[i - 1]) === y(dated[i + 1]) && y(dated[i]) !== y(dated[i - 1])) {
      warnings.push({ index: dated[i].index, title: dated[i].title, kind: 'date_sequence',
        message: `Dated ${dated[i].finishDate}, between two ${y(dated[i - 1])} entries. Possibly a typo.` });
    }
  }

  const counts = new Map<string, TagInfo>();
  for (const row of rows) for (const t of row.tags) {
    const k = t.toLowerCase();
    const e = counts.get(k);
    if (e) e.count++; else counts.set(k, { tag: t, count: 1, suggested: suggestTag(t) });
  }
  return { rows, tags: [...counts.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)), warnings };
}

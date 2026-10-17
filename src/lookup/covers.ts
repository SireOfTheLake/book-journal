import type { Fetcher } from './http';

export interface BookQuery { title: string; authors: string[] }
export type Confidence = 'high' | 'medium' | 'low';
export interface CoverCandidate {
  id: string; source: 'openlibrary' | 'google'; title: string; authors: string[]; year: number | null;
  imageUrl: string; fallbackUrl: string | null; thumbUrl: string; score: number; confidence: Confidence;
}
export interface SearchResult { candidates: CoverCandidate[]; errors: string[] }

// ---------- matching ----------
const strip = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// "The Prince & the Player (Book 1)" and "prince and the player" compare as equal.
export function normalizeTitle(title: string): string {
  return strip(title).replace(/[([{].*?[)\]}]/g, ' ').replace(/&/g, ' and ').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^(the|a|an)\s+/, '');
}

// The full title first, then the part before a subtitle ("MateHub: Legend" also tries "MateHub").
export function titleVariants(title: string): string[] {
  const full = title.trim();
  const short = full.split(/\s*[:\u2013\u2014]\s+|\s+-\s+/)[0].trim();
  return short && short !== full && normalizeTitle(short).length >= 3 ? [full, short] : [full];
}

const tokens = (s: string) => new Set(normalizeTitle(s).split(' ').filter(Boolean));
function titleScore(q: string, c: string): number {
  const a = normalizeTitle(q), b = normalizeTitle(c);
  if (!a || !b) return 0;
  if (a === b) return 60;
  const cMain = normalizeTitle(c.split(/\s*[:\u2013\u2014]\s+|\s+-\s+/)[0]);
  const qMain = normalizeTitle(q.split(/\s*[:\u2013\u2014]\s+|\s+-\s+/)[0]);
  if (a === cMain || qMain === b || (qMain.length > 2 && qMain === cMain)) return 55; // one has a subtitle the other lacks
  const ta = tokens(q), tb = tokens(c);
  const shared = [...ta].filter((t) => tb.has(t)).length;
  const jaccard = shared / (ta.size + tb.size - shared || 1);
  return Math.round(Math.min(jaccard, 0.85) * 50);
}

const nameParts = (name: string) => {
  const raw = strip(name).replace(/[^a-z\s,.-]/g, ' ').replace(/\./g, ' ');
  const parts = raw.includes(',') ? (() => { const [last, first] = raw.split(','); return `${first ?? ''} ${last}`; })() : raw;
  const words = parts.split(/\s+/).filter(Boolean);
  return { full: words.join(' '), last: words[words.length - 1] ?? '', first: words[0] ?? '' };
};
function authorScore(q: string[], c: string[]): number {
  if (!q.length) return 15; // nothing to compare, so neither a help nor a hurt
  let best = 0;
  for (const qa of q.map(nameParts)) for (const ca of c.map(nameParts)) {
    if (!qa.last || !ca.last) continue;
    if (qa.full === ca.full) best = Math.max(best, 40);
    else if (qa.last === ca.last && qa.first[0] === ca.first[0]) best = Math.max(best, 35);
    else if (qa.last === ca.last) best = Math.max(best, 25);
  }
  return best;
}

export function scoreCandidate(q: BookQuery, c: { title: string; authors: string[] }): { score: number; confidence: Confidence } {
  const score = Math.max(...titleVariants(q.title).map((v) => titleScore(v, c.title)), titleScore(q.title, c.title)) + authorScore(q.authors, c.authors);
  return { score, confidence: score >= 85 ? 'high' : score >= 60 ? 'medium' : 'low' };
}

// ---------- providers ----------
type Raw = Omit<CoverCandidate, 'score' | 'confidence'>;
const enc = encodeURIComponent;

export async function searchOpenLibrary(q: { title: string; author?: string }, fetch: Fetcher): Promise<Raw[]> {
  const url = `https://openlibrary.org/search.json?title=${enc(q.title)}${q.author ? `&author=${enc(q.author)}` : ''}&limit=8&fields=key,title,author_name,first_publish_year,cover_i`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open Library answered ${res.status}`);
  const data = (await res.json()) as { docs?: { key?: string; title?: string; author_name?: string[]; first_publish_year?: number; cover_i?: number }[] };
  return (data.docs ?? []).filter((d) => d.cover_i && d.title).map((d) => ({
    id: `ol:${d.key ?? d.cover_i}:${d.cover_i}`, source: 'openlibrary' as const, title: d.title!, authors: d.author_name ?? [], year: d.first_publish_year ?? null,
    imageUrl: `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg?default=false`, fallbackUrl: `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg?default=false`,
    thumbUrl: `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg?default=false`,
  }));
}

// Google's picture addresses are plain http and add a page-curl effect; ask for https and a flat picture.
export function cleanGoogleImage(url: string): string {
  return url.replace(/^http:/, 'https:').replace(/&edge=curl/g, '');
}

export async function searchGoogleBooks(q: { title: string; author?: string }, fetch: Fetcher): Promise<Raw[]> {
  const query = `intitle:"${q.title}"${q.author ? ` inauthor:"${q.author}"` : ''}`;
  const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${enc(query)}&maxResults=8&printType=books&fields=items(id,volumeInfo(title,subtitle,authors,publishedDate,imageLinks))`);
  if (!res.ok) throw new Error(`Google Books answered ${res.status}`);
  const data = (await res.json()) as { items?: { id: string; volumeInfo?: { title?: string; subtitle?: string; authors?: string[]; publishedDate?: string; imageLinks?: { thumbnail?: string; smallThumbnail?: string } } }[] };
  return (data.items ?? []).filter((i) => i.volumeInfo?.title && (i.volumeInfo.imageLinks?.thumbnail || i.volumeInfo.imageLinks?.smallThumbnail)).map((i) => {
    const v = i.volumeInfo!;
    const small = cleanGoogleImage((v.imageLinks!.thumbnail ?? v.imageLinks!.smallThumbnail)!);
    return {
      id: `g:${i.id}`, source: 'google' as const, title: v.title!, authors: v.authors ?? [], year: v.publishedDate ? Number(v.publishedDate.slice(0, 4)) || null : null,
      imageUrl: small.replace(/zoom=\d/, 'zoom=0'), fallbackUrl: small, thumbUrl: small,
    };
  });
}

// ---------- searching ----------
// Searches both sources. If nothing comes back for the full title, it tries the title without its subtitle.
export async function searchCovers(q: BookQuery, fetch: Fetcher): Promise<SearchResult> {
  const author = q.authors[0];
  const errors: string[] = [];
  let raw: Raw[] = [];
  for (const title of titleVariants(q.title)) {
    const settled = await Promise.allSettled([searchOpenLibrary({ title, author }, fetch), searchGoogleBooks({ title, author }, fetch)]);
    settled.forEach((r, i) => {
      if (r.status === 'fulfilled') raw.push(...r.value);
      else errors.push(`${i === 0 ? 'Open Library' : 'Google Books'} could not be reached (${r.reason instanceof Error ? r.reason.message : String(r.reason)})`);
    });
    if (raw.length) break;
  }
  // Without an author match, also try the title alone: some sources list the author differently.
  if (!raw.length && author) {
    const settled = await Promise.allSettled([searchOpenLibrary({ title: q.title }, fetch), searchGoogleBooks({ title: q.title }, fetch)]);
    for (const r of settled) if (r.status === 'fulfilled') raw.push(...r.value);
  }
  const seen = new Set<string>();
  raw = raw.filter((c) => (seen.has(c.thumbUrl) ? false : (seen.add(c.thumbUrl), true)));
  const candidates = raw.map((c) => ({ ...c, ...scoreCandidate(q, c) }))
    .sort((a, b) => b.score - a.score || (a.source === b.source ? 0 : a.source === 'openlibrary' ? -1 : 1))
    .slice(0, 8);
  return { candidates, errors: [...new Set(errors)] };
}

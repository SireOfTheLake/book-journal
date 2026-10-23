import { decodeEntities } from '../domain/entities';
import { validAsin, validIsbn } from './dom';
import type { BookClip, ClipSite, ClipTag, TagHint } from './types';

// The extension hands a book to the app as an address:  bookjournal://add?d=<the book, as text>
export const CLIP_SCHEME = 'bookjournal://';
const MAX_LINK = 14000; // well under what Windows allows for a program's start-up line

const toBase64Url = (text: string): string => {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromBase64Url = (text: string): string => {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

export function encodeClip(clip: BookClip): string {
  let c: BookClip = { ...clip };
  const make = () => `${CLIP_SCHEME}add?d=${toBase64Url(JSON.stringify(c))}`;
  let link = make();
  // Too long: shorten the description, then drop the least-voted tags, until it fits.
  while (link.length > MAX_LINK && (c.description?.length ?? 0) > 400) { c = { ...c, description: `${c.description!.slice(0, Math.floor(c.description!.length * 0.7)).trim()}...` }; link = make(); }
  while (link.length > MAX_LINK && c.tags.length > 5) { c = { ...c, tags: c.tags.slice(0, -3) }; link = make(); }
  return link;
}

const SITES: ClipSite[] = ['goodreads', 'storygraph', 'audible', 'romanceio'];
const HINTS: TagHint[] = ['genre', 'trope', 'mood', 'pace', 'warning'];
const str = (v: unknown, max = 5000): string | undefined => (typeof v === 'string' && v.trim() ? decodeEntities(v.trim()).slice(0, max) : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined);
const strs = (v: unknown, max = 40): string[] => (Array.isArray(v) ? v.map((x) => str(x, 300)).filter((x): x is string => !!x).slice(0, max) : []);

/** Reads an address from the extension. Anything that is not a well-formed book returns null. */
export function decodeClipUrl(link: string): BookClip | null {
  try {
    if (!link.toLowerCase().startsWith(CLIP_SCHEME)) return null;
    const d = new URL(link).searchParams.get('d');
    if (!d) return null;
    const raw = JSON.parse(fromBase64Url(d)) as Record<string, unknown>;
    const title = str(raw.title, 500);
    if (!title || raw.v !== 1 || !SITES.includes(raw.site as ClipSite)) return null;
    const tags: ClipTag[] = [];
    for (const t of (Array.isArray(raw.tags) ? raw.tags : []).slice(0, 80)) {
      const o = t as Record<string, unknown>;
      const name = str(o?.name, 120);
      if (!name) continue;
      const tag: ClipTag = { name };
      if (HINTS.includes(o.hint as TagHint)) tag.hint = o.hint as TagHint;
      const votes = num(o.votes);
      if (votes !== undefined) tag.votes = votes;
      tags.push(tag);
    }
    const links: Record<string, string> = {};
    for (const [k, v] of Object.entries((raw.authorLinks as Record<string, unknown>) ?? {})) { const u = str(v, 500); if (u && /^https?:\/\//i.test(u)) links[k.slice(0, 200)] = u; }
    const format = raw.format === 'audio' || raw.format === 'ebook' || raw.format === 'physical' ? raw.format : undefined;
    const cover = str(raw.cover, 1000);
    return {
      v: 1, site: raw.site as ClipSite, url: str(raw.url, 1000) ?? '', title, authors: strs(raw.authors, 12), narrators: strs(raw.narrators, 12),
      series: str(raw.series, 300), seriesPosition: num(raw.seriesPosition), pages: num(raw.pages) && Math.round(num(raw.pages)!) > 0 ? Math.round(num(raw.pages)!) : undefined,
      published: str(raw.published, 12), publisher: str(raw.publisher, 200), isbn: validIsbn(raw.isbn), asin: validAsin(raw.asin), format,
      audioSeconds: num(raw.audioSeconds), heat: num(raw.heat) !== undefined && num(raw.heat)! <= 5 ? Math.round(num(raw.heat)!) : undefined, heatLabel: str(raw.heatLabel, 60),
      description: str(raw.description, 6000), cover: cover && /^https?:\/\//i.test(cover) ? cover : undefined, tags,
      authorLinks: Object.keys(links).length ? links : undefined,
    };
  } catch { return null; }
}

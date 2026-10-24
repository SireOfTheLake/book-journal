import type { BookClip, ClipSite } from './types';
import { fromAudible } from './sites/audible';
import { fromGoodreads } from './sites/goodreads';
import { fromRomanceIo } from './sites/romanceio';
import { fromStoryGraph } from './sites/storygraph';

export function siteOf(url: string): ClipSite | null {
  let host = '';
  try { host = new URL(url).hostname.toLowerCase(); } catch { return null; }
  if (/(^|\.)audible\.[a-z.]+$/.test(host)) return /\/(pd|ac)\//.test(url) ? 'audible' : null;
  if (/(^|\.)goodreads\.com$/.test(host)) return /\/book\/show\//.test(url) ? 'goodreads' : null;
  if (/(^|\.)thestorygraph\.com$/.test(host)) return /\/books\//.test(url) ? 'storygraph' : null;
  if (/(^|\.)romance\.io$/.test(host)) return /\/books\//.test(url) ? 'romanceio' : null;
  return null;
}

/** Reads the book on this page. Returns null when this is not a book page we know. */
export function extractClip(doc: Document, url: string): BookClip | null {
  const site = siteOf(url);
  if (!site) return null;
  const clip = { audible: fromAudible, goodreads: fromGoodreads, romanceio: fromRomanceIo, storygraph: fromStoryGraph }[site](doc, url);
  if (!clip) return null;
  // Drop anything empty so the link stays short.
  for (const k of Object.keys(clip) as (keyof BookClip)[]) { const v = clip[k]; if (v === undefined || v === '' || (Array.isArray(v) && !v.length && k !== 'authors' && k !== 'tags')) delete clip[k]; }
  return clip;
}

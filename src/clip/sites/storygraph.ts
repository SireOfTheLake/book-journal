import type { BookClip, ClipTag } from '../types';
import { pageText, clean, htmlToText, metaContent, parseSeries, toIsoDate } from '../dom';

const MOODS = new Set(['adventurous', 'challenging', 'dark', 'emotional', 'funny', 'hopeful', 'informative', 'inspiring', 'lighthearted', 'mysterious', 'reflective', 'relaxing', 'sad', 'tense']);
const PACES = new Set(['slow-paced', 'medium-paced', 'fast-paced']);

export function fromStoryGraph(doc: Document, url: string): BookClip | null {
  const head = doc.querySelector('.book-title-author-and-series, .book-page-info, main') ?? doc.body;
  const title = clean(head.querySelector('h3, h1')?.childNodes[0]?.textContent) || clean(doc.querySelector('h1, h3')?.textContent) || clean((metaContent(doc, 'og:title') ?? doc.title).replace(/\s*\|.*$/, '').replace(/\s+by\s+.*$/i, ''));
  if (!title) return null;
  const authors = Array.from(new Set(Array.from(head.querySelectorAll('a[href^="/authors/"], a[href*="thestorygraph.com/authors/"]')).map((a) => clean(a.textContent)).filter(Boolean)));
  const seriesA = head.querySelector('a[href^="/series/"], a[href*="/series/"]');
  const seriesText = clean(seriesA?.parentElement?.textContent) || clean(seriesA?.textContent);
  const sPos = /#\s*([\d.]+)/.exec(seriesText)?.[1];
  const parsed = seriesA ? { series: clean(seriesA.textContent).replace(/\s*#[\d.]+\s*$/, ''), position: sPos ? Number(sPos) : undefined } : parseSeries(null);

  const body = pageText(doc);
  const pages = /(\d[\d,]*)\s+pages/i.exec(body)?.[1];
  const isbn = /ISBN\/UID:\s*([0-9Xx-]{10,17})/.exec(body)?.[1]?.replace(/-/g, '');
  const publisher = /Publisher:\s*(.+?)(?=\s+(?:First published|Edition|Format|Language|ISBN|Digital|Paperback|Hardcover)|$)/.exec(body)?.[1];
  const edition = /Edition (?:publication )?date:?\s*([0-9A-Za-z ,]+?\d{4})/i.exec(body)?.[1];
  const first = /First published\s+(?:in\s+)?([0-9A-Za-z ,]*\d{4})/i.exec(body)?.[1];
  const format = /Audio/i.test(body.slice(0, 4000)) && /audiobook|audio/i.test(doc.querySelector('.edition-info')?.textContent ?? '') ? 'audio' : /Digital|ebook|Kindle/i.test(doc.querySelector('.edition-info')?.textContent ?? '') ? 'ebook' : undefined;

  // Moods and pace are small tags; their words are fixed, so they are found by their text.
  const tags: ClipTag[] = [];
  const seen = new Set<string>();
  for (const el of Array.from(doc.querySelectorAll('span, a, div'))) {
    if (el.children.length > 0) continue;
    const t = clean(el.textContent).toLowerCase();
    if (seen.has(t)) continue;
    if (MOODS.has(t)) { seen.add(t); tags.push({ name: t, hint: 'mood' }); }
    else if (PACES.has(t)) { seen.add(t); tags.push({ name: t, hint: 'pace' }); }
  }
  for (const a of Array.from(doc.querySelectorAll('a[href*="/browse?"], a[href*="/browse/"]'))) {
    const t = clean(a.textContent).toLowerCase();
    if (t && !seen.has(t) && t.length < 40) { seen.add(t); tags.push({ name: t, hint: 'genre' }); }
  }
  const desc = doc.querySelector('.blurb-pane, .book-page-description, [class*="description"]');
  return {
    v: 1, site: 'storygraph', url: url.split('?')[0], title, authors,
    ...(parsed ? { series: parsed.series, seriesPosition: parsed.position } : {}),
    pages: pages ? Number(pages.replace(/,/g, '')) : undefined,
    published: toIsoDate(edition) ?? toIsoDate(first),
    publisher: publisher ? clean(publisher) : undefined, isbn, format,
    description: desc ? htmlToText(doc, desc.innerHTML) : (metaContent(doc, 'og:description') ?? undefined),
    cover: metaContent(doc, 'og:image') ?? undefined, tags,
  };
}

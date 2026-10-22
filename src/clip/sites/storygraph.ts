import type { BookClip, ClipTag } from '../types';
import { clean, htmlToText, metaContent, toIsoDate } from '../dom';

const MOODS = new Set(['adventurous', 'challenging', 'dark', 'emotional', 'funny', 'hopeful', 'informative', 'inspiring', 'lighthearted', 'mysterious', 'reflective', 'relaxing', 'sad', 'tense']);
const PACES = new Set(['slow-paced', 'medium-paced', 'fast-paced']);

/** A labelled row of the (hidden) edition details, like "Publisher:" or "Edition Pub Date:". */
function editionRow(doc: Document, label: string): string | undefined {
  for (const row of Array.from(doc.querySelectorAll('.edition-info p'))) {
    const head = clean(row.querySelector('.font-semibold')?.textContent).replace(/:$/, '').toLowerCase();
    if (head === label.toLowerCase()) return clean(row.textContent.replace(row.querySelector('.font-semibold')?.textContent ?? '', '')) || undefined;
  }
  return undefined;
}

/** The Description section. The page shows a shortened copy ending in "..." and keeps the whole text in the Show More button's script. */
function description(doc: Document): string | undefined {
  for (const s of Array.from(doc.querySelectorAll('script'))) {
    const code = s.textContent ?? '';
    if (!code.includes('read-more-btn')) continue;
    const m = /Description<\\?\/h4><div class=\\?["']trix-content[^"']*\\?["']><div>([\s\S]*?)<\\?\/div><\/div>/.exec(code);
    if (m) {
      const text = htmlToText(doc, m[1].replace(/\\\//g, '/').replace(/\\(['"])/g, '$1'));
      if (text) return text;
    }
  }
  for (const h of Array.from(doc.querySelectorAll('h4, h3'))) {
    if (clean(h.textContent).toLowerCase() !== 'description') continue;
    const body = h.parentElement?.querySelector('.trix-content');
    if (body) return htmlToText(doc, body.innerHTML);
  }
  return undefined;
}

export function fromStoryGraph(doc: Document, url: string): BookClip | null {
  const head = doc.querySelector('.book-title-author-and-series') ?? doc.body;
  const title = clean(head.querySelector('h3, h1')?.textContent) || clean(doc.querySelector('h1, h3')?.textContent) || clean((metaContent(doc, 'og:title') ?? doc.title).replace(/\s*\|.*$/, '').replace(/\s+by\s+.*$/i, ''));
  if (!title) return null;
  const authors = Array.from(new Set(Array.from(head.querySelectorAll('a[href*="/authors/"]')).map((a) => clean(a.textContent)).filter(Boolean)));
  const seriesA = head.querySelector('a[href*="/series/"]');
  const position = /#\s*([\d.]+)/.exec(clean(head.querySelector('a[href*="/series/"] + a')?.textContent) || clean(seriesA?.parentElement?.textContent))?.[1];

  const pages = /(\d[\d,]*)\s+pages/i.exec(clean(doc.querySelector('.toggle-edition-info-link')?.textContent))?.[1];
  const formatWord = (editionRow(doc, 'Format') ?? '').toLowerCase();
  const format = /audio/.test(formatWord) ? 'audio' : /digital|ebook|kindle/.test(formatWord) ? 'ebook' : /paperback|hardcover|physical|book/.test(formatWord) ? 'physical' : undefined;
  const editionDate = toIsoDate(editionRow(doc, 'Edition Pub Date') ?? editionRow(doc, 'Edition Publication Date'));
  const firstYear = /first pub\s+(\d{4})/i.exec(clean(doc.body.textContent))?.[1];
  // "first pub 2026" is only a year, so the edition's full date is used when it falls in that year.
  const published = editionDate && (!firstYear || editionDate.startsWith(firstYear)) ? editionDate : firstYear ?? editionDate;

  // The tags under the title: genres (fiction, romance...), plus the book's top moods and pace. The page repeats them for small screens.
  const tags: ClipTag[] = [];
  const seen = new Set<string>();
  for (const el of Array.from(doc.querySelectorAll('.book-page-tag-section > span'))) {
    const name = clean(el.textContent).toLowerCase();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    tags.push({ name, hint: MOODS.has(name) ? 'mood' : PACES.has(name) ? 'pace' : 'genre' });
  }

  return {
    v: 1, site: 'storygraph', url: url.split('?')[0], title, authors,
    ...(seriesA ? { series: clean(seriesA.textContent).replace(/\s*#[\d.]+\s*$/, ''), seriesPosition: position ? Number(position) : undefined } : {}),
    pages: pages ? Number(pages.replace(/,/g, '')) : undefined,
    published, publisher: editionRow(doc, 'Publisher'), isbn: editionRow(doc, 'ISBN/UID')?.replace(/-/g, ''), format,
    description: description(doc),
    cover: metaContent(doc, 'og:image') ?? undefined, tags,
  };
}

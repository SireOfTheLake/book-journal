import type { BookClip, ClipTag } from '../types';
import { pageText, clean, htmlToText, jsonLd, ldOfType, metaContent, names, parseSeries, toIsoDate } from '../dom';

const text = (doc: Document, sel: string) => clean(doc.querySelector(sel)?.textContent);

/** The blurb only: the page puts a "Show more" button inside the same box, which must not end up in the text. */
function goodreadsDescription(doc: Document): string | undefined {
  const box = doc.querySelector('[data-testid="description"]');
  if (!box) return undefined;
  const copy = box.cloneNode(true) as Element;
  copy.querySelectorAll('button, [role="button"], .Button, .Button__container, .TruncatedContent__gradient, [data-testid="contentToggle"]').forEach((el) => el.remove());
  const blurb = copy.querySelector('.Formatted') ?? copy;
  const text = htmlToText(doc, blurb.innerHTML).replace(/\s*(?:\.\.\.|…)?\s*\b(?:show more|show less|read more)\s*$/i, '').trim();
  return text || undefined;
}

export function fromGoodreads(doc: Document, url: string): BookClip | null {
  const ldBook = ldOfType(jsonLd(doc), 'Book');
  // "Finest Kind of Fate (A Siren's Point Story #1)"
  const ogTitle = metaContent(doc, 'og:title');
  const heading = text(doc, '[data-testid="bookTitle"]') || text(doc, 'h1');
  let title = heading || clean(String(ldBook?.name ?? '')) || ogTitle || '';
  let parsed = null as ReturnType<typeof parseSeries>;
  const sm = /^(.*?)\s*\(([^()]*#[\d.]+)\)\s*$/.exec(ogTitle ?? '');
  if (sm) { parsed = parseSeries(sm[2]); if (!heading) title = clean(sm[1]); }
  const seriesEl = text(doc, '.BookPageTitleSection__title h3 a, h3.Text__italic a, [aria-label^="Book "][aria-label*=" series"]');
  if (!parsed && seriesEl) parsed = parseSeries(seriesEl);
  if (!title) return null;

  // Authors are listed with a role for everyone else (illustrator, narrator); only plain authors count.
  const authors: string[] = [];
  for (const c of Array.from(doc.querySelectorAll('.ContributorLinkWrapper, [data-testid="contributor-link"], .ContributorLink'))) {
    const name = clean(c.querySelector('.ContributorLink__name, [data-testid="name"]')?.textContent);
    const role = clean(c.querySelector('.ContributorLink__role, [data-testid="role"]')?.textContent).toLowerCase();
    if (name && (!role || /author/.test(role)) && !authors.includes(name)) authors.push(name);
  }
  if (!authors.length) authors.push(...names(ldBook?.author));

  const body = pageText(doc);
  const pagesText = text(doc, '[data-testid="pagesFormat"]') || body;
  const pages = /(\d[\d,]*)\s+pages/i.exec(pagesText)?.[1];
  const pubText = text(doc, '[data-testid="publicationInfo"]') || /First published[^.]{0,40}\d{4}/i.exec(body)?.[0] || '';
  const tags: ClipTag[] = [];
  for (const a of Array.from(doc.querySelectorAll('[data-testid="genresList"] a, .BookPageMetadataSection__genreButton a'))) {
    const name = clean(a.textContent);
    if (name && !tags.some((t) => t.name === name)) tags.push({ name });
  }
  const description = goodreadsDescription(doc) ?? (metaContent(doc, 'og:description') ?? undefined);
  const format = /audio/i.test(pagesText) ? 'audio' : /kindle|ebook|digital/i.test(pagesText) ? 'ebook' : /hardcover|paperback|mass market/i.test(pagesText) ? 'physical' : undefined;
  return {
    v: 1, site: 'goodreads', url: url.split('?')[0], title, authors,
    ...(parsed ? { series: parsed.series, seriesPosition: parsed.position } : {}),
    pages: pages ? Number(pages.replace(/,/g, '')) : undefined,
    published: toIsoDate(pubText), format,
    isbn: /ISBN[^0-9]{0,10}(97[89]\d{10}|\d{9}[\dXx])/.exec(body)?.[1],
    description, cover: metaContent(doc, 'og:image') ?? undefined, tags,
  };
}

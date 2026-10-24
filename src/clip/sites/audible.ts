import type { BookClip, ClipTag } from '../types';
import { absolute, clean, deepAll, htmlToText, isoDuration, jsonLd, ldOfType, names, parseSeries, toIsoDate } from '../dom';

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

export function fromAudible(doc: Document, url: string): BookClip | null {
  const ld = jsonLd(doc);
  const book = ldOfType(ld, 'Audiobook') ?? ldOfType(ld, 'Book');
  const product = ldOfType(ld, 'Product');
  const title = clean(book?.name as string) || clean(doc.querySelector('h1')?.textContent) || clean(doc.querySelector('meta[property="og:title"]')?.getAttribute('content'));
  if (!title) return null;
  // If the page's structured data is missing or changed, the author and narrator links at the top of the page say the same thing.
  const pinned = (kind: 'author' | 'narrator') => Array.from(new Set(deepAll(doc, 'a[href]').filter((a) => new RegExp(`_pin_${kind}_`).test(a.getAttribute('href') ?? '')).map((a) => clean(a.textContent)).filter(Boolean)));
  const authors = names(book?.author).length ? names(book?.author) : pinned('author');

  // "A Siren's Point Story, Book 1" is under the title; the series link is the fallback.
  const sub = clean(doc.querySelector('h2[slot="subtitle"]')?.textContent);
  const seriesLink = Array.from(doc.querySelectorAll('a[href*="/series/"]')).find((a) => clean(a.textContent));
  const parsed = parseSeries(sub) ?? parseSeries(seriesLink?.textContent);

  // The page links each author to their own Audible page, which has an ID in its address.
  const authorLinks: Record<string, string> = {};
  for (const a of authors) {
    const link = Array.from(doc.querySelectorAll('a[href*="/author/"]')).find((el) => slug(clean(el.textContent)) === slug(a) && /\/author\/[^/?]+\/[A-Z0-9]{8,}/.test(el.getAttribute('href') ?? ''));
    const href = absolute(link?.getAttribute('href'), url);
    if (href) authorLinks[a] = href.split('?')[0];
  }

  // Categories come from the breadcrumb trail (Home > Romance > Contemporary).
  const crumbs = ldOfType(ld, 'BreadcrumbList');
  const tags: ClipTag[] = [];
  for (const it of ((crumbs?.itemListElement as { position?: number; item?: { name?: string } }[]) ?? [])) {
    const n = clean(it.item?.name);
    if (n && (it.position ?? 2) > 1) tags.push({ name: n, hint: 'genre' });
  }

  const asin = clean(product?.productID as string) || /\/pd\/[^/]+\/([A-Z0-9]{10})/.exec(url)?.[1];
  const description = book?.description ? htmlToText(doc, String(book.description)).replace(/\n*Contains mature content\.[^\n]*$/i, '').trim() : undefined;
  return {
    v: 1, site: 'audible', url: url.split('?')[0], title,
    authors, narrators: names(book?.readBy).length ? names(book?.readBy) : pinned('narrator'),
    ...(parsed ? { series: parsed.series, seriesPosition: parsed.position } : {}),
    published: toIsoDate(book?.datePublished as string), publisher: clean(book?.publisher as string) || undefined,
    asin: asin || undefined, format: 'audio', audioSeconds: isoDuration(book?.duration),
    description, // no cover: Audible's are square, so they would always be squished
    tags, authorLinks: Object.keys(authorLinks).length ? authorLinks : undefined,
  };
}

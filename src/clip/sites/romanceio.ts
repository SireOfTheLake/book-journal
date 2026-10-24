import type { BookClip, ClipTag } from '../types';
import { clean, htmlToText, jsonLd, ldOfType, names, parseSeries, toIsoDate } from '../dom';

const SKIP_GROUPS = new Set(['geography', 'format']);

export function fromRomanceIo(doc: Document, url: string): BookClip | null {
  const book = ldOfType(jsonLd(doc), 'Book');
  const decode = (s: string) => htmlToText(doc, s);
  const rawName = decode(String(book?.name ?? '')) || clean(doc.querySelector('h1')?.textContent);
  if (!rawName) return null;
  // "Finest Kind of Fate (A Siren's Point Story #1)"
  const sm = /^(.*?)\s*\(([^()]*#[\d.]+)\)\s*$/.exec(rawName);
  const title = clean(sm ? sm[1] : rawName);
  const parsed = sm ? parseSeries(sm[2]) : null;

  // Heat is shown as flames out of five, with a name ("Open door").
  const flames = doc.querySelectorAll('.steam-rating .icon-fire').length;
  // The name sits in the text right after the flames.
  const heatLabel = clean(doc.querySelector('.steam-rating')?.nextSibling?.textContent);
  const stats = clean(doc.querySelector('.book-stats-scnd')?.textContent);
  const pages = /(\d[\d,]*)\s+pages/i.exec(stats)?.[1];

  // Tags, grouped; "geography" and "Format" are about where and how, so they are left out.
  const tags: ClipTag[] = [];
  for (const ul of Array.from(doc.querySelectorAll('ul.topic-tags'))) {
    const group = clean(ul.querySelector('.tabitem-sub')?.textContent).toLowerCase();
    if (SKIP_GROUPS.has(group)) continue;
    for (const li of Array.from(ul.querySelectorAll('li.tagged-topic'))) {
      const name = clean(li.querySelector('a.topic')?.textContent);
      if (!name) continue;
      const votes = Number(clean(li.querySelector('.count')?.textContent));
      tags.push({ name, votes: Number.isFinite(votes) && votes > 0 ? votes : undefined });
    }
  }

  // The site is all romance, so Romance is always on offer as a genre.
  if (!tags.some((t) => t.name.toLowerCase() === 'romance')) tags.unshift({ name: 'Romance', hint: 'genre' });

  // The description is the paragraphs before "Rated '3/5 - Open door' for".
  const box = doc.querySelector('#book-description');
  let description: string | undefined;
  if (box) {
    const copy = box.cloneNode(true) as Element;
    copy.querySelectorAll('script, style, .book-cover-container, .dropdown, a').forEach((n) => n.remove());
    const lines = (copy.innerHTML.replace(/<\/p>|<br\s*\/?>/gi, '\n') + '').split('\n').map((l) => clean(htmlToText(doc, l))).filter(Boolean);
    const stop = lines.findIndex((l) => /^Rated '/.test(l) || /^steam\/spice\/heat level/i.test(l) || /^more$/i.test(l));
    description = (stop === -1 ? lines : lines.slice(0, stop)).join('\n\n') || undefined;
  }

  return {
    v: 1, site: 'romanceio', url: url.split('?')[0], title,
    authors: names(book?.author),
    ...(parsed ? { series: parsed.series, seriesPosition: parsed.position } : {}),
    pages: pages ? Number(pages.replace(/,/g, '')) : undefined,
    published: toIsoDate(String(book?.datePublished ?? '') || stats),
    heat: flames > 0 ? flames : undefined, heatLabel: heatLabel || undefined,
    description, cover: clean(book?.image as string) || undefined,
    tags,
  };
}

// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractClip, siteOf } from '../src/clip/extract';
import { decodeClipUrl, encodeClip } from '../src/clip/link';
import { isoDuration, parseSeries, toIsoDate } from '../src/clip/dom';
import type { BookClip } from '../src/clip/types';

const URLS = {
  audible: 'https://www.audible.ca/pd/Finest-Kind-of-Fate-Audiobook/B0H6PKSQ48',
  romanceio: 'https://www.romance.io/books/6957836c2c7cb2aa786cd4f2/finest-kind-of-fate-jj-mulder',
  goodreads: 'https://www.goodreads.com/book/show/245924653-finest-kind-of-fate',
  storygraph: 'https://app.thestorygraph.com/books/d7980763-71bc-46df-b8ca-b730f5e37a90',
};
const clipOf = (site: keyof typeof URLS): BookClip => {
  document.documentElement.innerHTML = readFileSync(`tests/clipPages/${site}.html`, 'utf8');
  return extractClip(document, URLS[site])!;
};

describe('which pages are book pages', () => {
  it('knows the four sites, and only their book pages', () => {
    for (const [s, u] of Object.entries(URLS)) expect(siteOf(u)).toBe(s);
    expect(siteOf('https://www.audible.ca/search?searchNarrator=Iggy+Toma')).toBeNull();
    expect(siteOf('https://www.goodreads.com/shelf/show/romance')).toBeNull();
    expect(siteOf('https://example.com/books/1')).toBeNull();
    expect(siteOf('not a url')).toBeNull();
  });
});

describe('Audible (a saved copy of the real page)', () => {
  it('reads the audiobook, its series, narrators, length and the author page with its ID', () => {
    const c = clipOf('audible');
    expect(c).toMatchObject({ site: 'audible', title: 'Finest Kind of Fate', authors: ['J.J. Mulder'], narrators: ['Iggy Toma', 'Javi Wilder'], series: "A Siren's Point Story", seriesPosition: 1,
      published: '2026-08-04', publisher: 'Podium Audio', asin: 'B0H6PKSQ48', format: 'audio', audioSeconds: 9 * 3600 + 36 * 60 });
    expect(c.authorLinks).toEqual({ 'J.J. Mulder': 'https://www.audible.ca/author/J-J-Mulder/B0CP6G3KL7' });
    expect(c.tags).toEqual([{ name: 'Romance', hint: 'genre' }, { name: 'Contemporary', hint: 'genre' }]);
    expect(c.cover).toMatch(/^https:\/\/m\.media-amazon\.com\/images\/I\/51gdV-lPm6L/);
    expect(c.description).toMatch(/^Ewan Fate left home seven years ago/);
    expect(c.description).not.toMatch(/<|Contains mature content/);
  });
});

describe('Romance.io (a saved copy of the real page)', () => {
  it('reads the book, pages, heat and the tags with their votes (leaving out geography and format)', () => {
    const c = clipOf('romanceio');
    expect(c).toMatchObject({ site: 'romanceio', title: 'Finest Kind of Fate', authors: ['J.J. Mulder'], series: "A Siren's Point Story", seriesPosition: 1, pages: 346, published: '2026-02-27', heat: 3, heatLabel: 'Open door' });
    expect(c.tags.slice(0, 3)).toEqual([{ name: 'gay romance', votes: 6 }, { name: 'queer romance', votes: 5 }, { name: 'friends to lovers', votes: 5 }]);
    const names = c.tags.map((t) => t.name);
    expect(names).toContain('slow burn');
    expect(names).not.toContain('north america'); // geography
    expect(names).not.toContain('audiobook'); // format
    expect(names).not.toContain('male pov'); // under the Format group
    expect(c.description).toMatch(/^Ewan Fate left home/);
    expect(c.description).not.toMatch(/Rated '/);
    expect(c.cover).toBe('https://s3.amazonaws.com/romance.io/books/large/6957836c2c7cb2aa786cd4f2.jpg');
  });
});

describe('Goodreads and StoryGraph (built from how the pages are laid out, not saved copies)', () => {
  it('Goodreads: title, series, authors without roles, pages, date, genres', () => {
    const c = clipOf('goodreads');
    expect(c).toMatchObject({ site: 'goodreads', title: 'Finest Kind of Fate', authors: ['J.J. Mulder'], series: "A Siren's Point Story", seriesPosition: 1, pages: 346, published: '2026-02-27', format: 'ebook' });
    expect(c.tags.map((t) => t.name)).toEqual(['M M Romance', 'Romance', 'Friends To Lovers', 'Slow Burn']);
    expect(c.cover).toMatch(/goodreads\.com\/books\/1768863611i\/245924653\.jpg$/);
  });
  it('StoryGraph: title, series, pages, ISBN, publisher, date, tags, and the whole Description (not the short copy or the Who\'s It For text)', () => {
    const c = clipOf('storygraph');
    expect(c).toMatchObject({ site: 'storygraph', title: 'Finest Kind of Fate', authors: ['J.J. Mulder'], series: "A Siren's Point Story", seriesPosition: 1, pages: 334, isbn: '9781967245208', publisher: 'JJ Mulder Publishing', published: '2026-02-27', format: 'ebook' });
    expect(c.tags).toEqual([{ name: 'fiction', hint: 'genre' }, { name: 'contemporary', hint: 'genre' }, { name: 'lgbtqia+', hint: 'genre' }, { name: 'romance', hint: 'genre' }, { name: 'emotional', hint: 'mood' }, { name: 'hopeful', hint: 'mood' }, { name: 'medium-paced', hint: 'pace' }]);
    expect(c.description).toMatch(/^Ewan Fate left home seven years ago/);
    expect(c.description).toMatch(/some things will never change\.$/);
    expect(c.description).toContain('Shiloh spends his days on the ocean');
    expect(c.description).not.toMatch(/\.\.\.$|SGAI|Who's It For|Personalized/);
    expect(c.description).toContain('\n\n'); // paragraphs kept
  });
});

describe('small readers', () => {
  it('dates, durations and series text', () => {
    expect(toIsoDate('27 Feb 2026')).toBe('2026-02-27');
    expect(toIsoDate('First published February 7, 2026')).toBe('2026-02-07');
    expect(toIsoDate('2026-08-04T00:00:00Z')).toBe('2026-08-04');
    expect(toIsoDate('First published 2026')).toBe('2026');
    expect(toIsoDate('')).toBeUndefined();
    expect(isoDuration('PT9H36M')).toBe(34560);
    expect(isoDuration('nope')).toBeUndefined();
    expect(parseSeries("A Siren's Point Story, Book 1")).toEqual({ series: "A Siren's Point Story", position: 1 });
    expect(parseSeries('Saga #2.5')).toEqual({ series: 'Saga', position: 2.5 });
    expect(parseSeries('(Saga, #3)')).toEqual({ series: 'Saga', position: 3 });
    expect(parseSeries('Just a series')).toEqual({ series: 'Just a series' });
    expect(parseSeries('')).toBeNull();
  });
});

describe('the link the extension opens', () => {
  it('round-trips a book, accents and all', () => {
    const c: BookClip = { v: 1, site: 'goodreads', url: 'https://x.test/b', title: 'Café Noël — “quoted”', authors: ['Zoë Ünal'], tags: [{ name: 'slow burn', votes: 4 }, { name: 'dark', hint: 'mood' }], pages: 300, heat: 2 };
    const link = encodeClip(c);
    expect(link.startsWith('bookjournal://add?d=')).toBe(true);
    expect(decodeClipUrl(link)).toMatchObject({ title: c.title, authors: c.authors, pages: 300, heat: 2, tags: c.tags });
  });
  it('shortens a very long book to fit, and refuses anything that is not a book', () => {
    const c = clipOf('audible');
    const big = { ...c, description: 'word '.repeat(9000), tags: Array.from({ length: 80 }, (_, i) => ({ name: `tag number ${i}` })) };
    const link = encodeClip(big);
    expect(link.length).toBeLessThanOrEqual(14500);
    expect(decodeClipUrl(link)!.title).toBe(c.title);
    for (const bad of ['', 'https://example.com', 'bookjournal://add', 'bookjournal://add?d=%%%', `bookjournal://add?d=${btoa('{"v":2}')}`, `bookjournal://add?d=${btoa('{"v":1,"site":"goodreads","title":""}')}`]) expect(decodeClipUrl(bad), bad).toBeNull();
  });
  it('keeps only addresses that are web addresses', () => {
    const d = btoa(JSON.stringify({ v: 1, site: 'goodreads', title: 'T', cover: 'javascript:alert(1)', authorLinks: { A: 'file:///etc/passwd', B: 'https://ok.test/a' }, heat: 9, pages: -3 }));
    expect(decodeClipUrl(`bookjournal://add?d=${d}`)).toMatchObject({ cover: undefined, authorLinks: { B: 'https://ok.test/a' }, heat: undefined, pages: undefined });
  });
});

describe('the built extension script', () => {
  it('reads a real saved page when run the way the extension runs it', async () => {
    const { JSDOM } = (await import('jsdom' as string)) as { JSDOM: new (html: string, o: object) => { window: Window & { eval(s: string): void } } };
    const { execFileSync } = await import('node:child_process');
    execFileSync('node', ['scripts/build-extension.mjs'], { stdio: 'ignore' });
    const dom = new JSDOM(readFileSync('tests/clipPages/romanceio.html', 'utf8'), { url: URLS.romanceio, runScripts: 'outside-only' });
    dom.window.eval(readFileSync('extension/page.js', 'utf8'));
    const found = (dom.window as unknown as { __bookJournalClip: BookClip }).__bookJournalClip;
    expect(found).toMatchObject({ title: 'Finest Kind of Fate', pages: 346, heat: 3 });
    const off = new JSDOM('<html><body>hi</body></html>', { url: 'https://example.com/x', runScripts: 'outside-only' });
    off.window.eval(readFileSync('extension/page.js', 'utf8'));
    expect((off.window as unknown as { __bookJournalClip: unknown }).__bookJournalClip).toBeNull();
  });
  it('has a manifest that allows the four sites and nothing else', () => {
    const m = JSON.parse(readFileSync('extension/manifest.json', 'utf8'));
    expect(m.manifest_version).toBe(3);
    expect(m.permissions.sort()).toEqual(['activeTab', 'scripting']);
    for (const host of m.host_permissions as string[]) expect(host).toMatch(/goodreads\.com|thestorygraph\.com|audible\.|romance\.io/);
  });
});

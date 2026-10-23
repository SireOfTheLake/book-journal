// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { clean } from '../src/clip/dom';
import { decodeClipUrl, encodeClip } from '../src/clip/link';
import { decodeEntities } from '../src/domain/entities';
import { bestMatch, nameKey } from '../src/domain/nameMatch';
import { migrateNodeDb } from '../src/db/nodeDb';
import { quickAdd } from '../src/repo/bookLog';
import { reviewClip } from '../src/repo/clip';

const TITLE = "A Beginner's Guide to Mistakenly Summoned Demons and Other Misadventures";
describe('symbol codes in titles', () => {
  it('turns them back into the symbol', () => {
    expect(decodeEntities('A Beginner&#39;s Guide &amp; More &quot;Q&quot; &#x2019; &hellip; &unknown;')).toBe('A Beginner\'s Guide & More "Q" ’ … &unknown;');
    expect(decodeEntities('plain')).toBe('plain');
    expect(clean('  A Beginner&#39;s   Guide ')).toBe("A Beginner's Guide");
  });
  it('matches a title saved with the code against the plain one', () => {
    expect(nameKey('A Beginner&#39;s Guide')).toBe(nameKey("A Beginner's Guide"));
    expect(bestMatch(['A Beginner&#39;s Guide'], "A Beginner's Guide")).toBe('A Beginner&#39;s Guide');
  });
  it('an older extension that still sends the code is cleaned by the app', () => {
    const link = encodeClip({ v: 1, site: 'audible', url: 'https://www.audible.ca/pd/x/B0AAAAAAAA', title: 'A Beginner&#39;s Guide', authors: ['Q&#39;Brien'], tags: [{ name: 'Sci&#39;Fi' }] });
    expect(decodeClipUrl(link)).toMatchObject({ title: "A Beginner's Guide", authors: ["Q'Brien"], tags: [{ name: "Sci'Fi" }] });
  });
  it('finds a book that was saved with the code in its title', async () => {
    const db = migrateNodeDb();
    const { bookId } = await quickAdd(db, { title: TITLE.replace("'", '&#39;'), authors: ['Someone'], status: 'tbr' });
    const r = await reviewClip(db, { v: 1, site: 'audible', url: 'https://www.audible.ca/pd/x/B0AAAAAAAA', title: TITLE, authors: ['Someone'], tags: [] });
    expect(r.existing?.id).toBe(bookId);
  });
});

describe('a book with no ISBN is not mistaken for another book with no ISBN', () => {
  it('"None" is not an identifier', async () => {
    const { validAsin, validIsbn } = await import('../src/clip/dom');
    expect([validIsbn('None'), validIsbn(''), validIsbn('978-1-967245-20-8'), validIsbn('0306406152'), validIsbn('030640615X')]).toEqual([undefined, undefined, '9781967245208', '0306406152', '030640615X']);
    expect([validAsin('B0H6PKSQ48'), validAsin('None'), validAsin('abc')]).toEqual(['B0H6PKSQ48', undefined, undefined]);
  });
  it('StoryGraph pages that say ISBN/UID: None give no ISBN, and a different book is not matched', async () => {
    const { readFileSync } = await import('node:fs');
    const { extractClip } = await import('../src/clip/extract');
    const html = readFileSync('tests/clipPages/storygraph.html', 'utf8').replace(/9781967245208/g, 'None');
    const clip = extractClip(new DOMParser().parseFromString(html, 'text/html'), 'https://app.thestorygraph.com/books/cac24e94-7540-4422-b167-6e29be96adc8')!;
    expect(clip.isbn).toBeUndefined();
    const db = migrateNodeDb();
    const { bookId } = await quickAdd(db, { title: 'Corporate Retreats, Romance, and Revenge', authors: ['Shannon Mae'], status: 'tbr' });
    await db.execute("UPDATE book SET external_ids = ? WHERE id = ?", [JSON.stringify({ isbn: 'None' }), bookId]); // saved by the old version
    const r = await reviewClip(db, { ...clip, title: 'A Distant Devotion', authors: ['Hailey Turner'], isbn: 'None' });
    expect(r.existing).toBeNull();
  });
});

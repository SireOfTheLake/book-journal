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

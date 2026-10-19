import { byTitle } from '../src/domain/sortKey';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { migrateNodeDb } from '../src/db/nodeDb';
import { applyNotionPlan } from '../src/import/apply';
import { planNotionBooks } from '../src/import/notion';
import { pickDefault, saveBulk, searchBulk } from '../src/lookup/bulk';
import { cleanGoogleImage, normalizeTitle, scoreCandidate, searchCovers, searchGoogleBooks, searchOpenLibrary, titleVariants, type CoverCandidate } from '../src/lookup/covers';
import { setBookCover } from '../src/repo/bookLog';
import { listBooksForCovers } from '../src/repo/covers';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const OL = { docs: [
  { key: '/works/OL1W', title: 'Egotistical Puckboy', author_name: ['Eden Finley', 'Saxon James'], first_publish_year: 2019, cover_i: 111 },
  { key: '/works/OL2W', title: 'Egotistical Puckboy (audio)', author_name: ['Someone Else'], first_publish_year: 2020 }, // no cover, so dropped
  { key: '/works/OL3W', title: 'Puck Daddy', author_name: ['Other Writer'], cover_i: 333 },
] };
const GB = { items: [
  { id: 'g1', volumeInfo: { title: 'Egotistical Puckboy', authors: ['Eden Finley', 'Saxon James'], publishedDate: '2019-04-01', imageLinks: { thumbnail: 'http://books.google.com/books/content?id=g1&printsec=frontcover&img=1&zoom=1&edge=curl&source=gbs_api' } } },
  { id: 'g2', volumeInfo: { title: 'No Picture Here', authors: ['X'] } },
] };

function fakeFetch(handlers: { ol?: () => Response; gb?: () => Response }) {
  const calls: string[] = [];
  const fetch = vi.fn(async (url: string) => {
    calls.push(url);
    if (url.includes('openlibrary.org')) return handlers.ol ? handlers.ol() : json({ docs: [] });
    if (url.includes('googleapis.com')) return handlers.gb ? handlers.gb() : json({});
    throw new Error(`unexpected ${url}`);
  });
  return { fetch, calls };
}

describe('matching titles', () => {
  it('compares titles without punctuation, capitals, articles, or a bracketed note', () => {
    expect(normalizeTitle('The Prince & the Player (Book 1)')).toBe('prince and the player');
    expect(normalizeTitle('  MateHub: Legend ')).toBe('matehub legend');
    expect(normalizeTitle('Café Society')).toBe('cafe society');
    expect(normalizeTitle('A Hush')).toBe('hush');
  });
  it('also tries the title without its subtitle', () => {
    expect(titleVariants('MateHub: Legend')).toEqual(['MateHub: Legend', 'MateHub']);
    expect(titleVariants('Kiss - Kill - Repeat')).toEqual(['Kiss - Kill - Repeat', 'Kiss']);
    expect(titleVariants('Hush')).toEqual(['Hush']);
  });
});

describe('scoring a match', () => {
  const q = { title: 'Egotistical Puckboy', authors: ['Eden Finley', 'Saxon James'] };
  it('rates the right book by the right author as a strong match', () => {
    expect(scoreCandidate(q, { title: 'Egotistical Puckboy', authors: ['Eden Finley'] }).confidence).toBe('high');
  });
  it('does not call the same title by a different author strong, since titles repeat', () => {
    const r = scoreCandidate({ title: 'Hush', authors: ['Eden Finley'] }, { title: 'Hush', authors: ['Becca Fitzpatrick'] });
    expect(r.confidence).not.toBe('high');
  });
  it('rates an unrelated book as weak', () => {
    expect(scoreCandidate(q, { title: 'Puck Daddy', authors: ['Other Writer'] }).confidence).toBe('low');
  });
  it('reads "Last, First" names and initials', () => {
    expect(scoreCandidate(q, { title: 'Egotistical Puckboy', authors: ['Finley, Eden'] }).confidence).toBe('high');
    expect(scoreCandidate({ title: 'Egotistical Puckboy', authors: ['E. Finley'] }, { title: 'Egotistical Puckboy', authors: ['Eden Finley'] }).score).toBeGreaterThanOrEqual(85);
  });
  it('accepts a subtitle that one side leaves out', () => {
    const r = scoreCandidate({ title: 'MateHub: Legend', authors: ['Marie Reynard'] }, { title: 'MateHub', authors: ['Marie Reynard'] });
    expect(r.confidence).toBe('high');
  });
  it('is neutral about authors when the book has none, so it never auto-confirms', () => {
    expect(scoreCandidate({ title: 'Egotistical Puckboy', authors: [] }, { title: 'Egotistical Puckboy', authors: ['Eden Finley'] }).confidence).toBe('medium');
  });
});

describe('the two sources', () => {
  it('reads Open Library results, skipping books with no cover', async () => {
    const { fetch, calls } = fakeFetch({ ol: () => json(OL) });
    const r = await searchOpenLibrary({ title: 'Egotistical Puckboy', author: 'Eden Finley' }, fetch);
    expect(r.map((c) => c.title)).toEqual(['Egotistical Puckboy', 'Puck Daddy']);
    expect(r[0]).toMatchObject({ source: 'openlibrary', year: 2019, imageUrl: 'https://covers.openlibrary.org/b/id/111-L.jpg?default=false', thumbUrl: 'https://covers.openlibrary.org/b/id/111-M.jpg?default=false' });
    expect(calls[0]).toContain('title=Egotistical%20Puckboy');
    expect(calls[0]).toContain('author=Eden%20Finley');
  });
  it('reads Google Books results, cleaning the picture address', async () => {
    const { fetch } = fakeFetch({ gb: () => json(GB) });
    const r = await searchGoogleBooks({ title: 'Egotistical Puckboy', author: 'Eden Finley' }, fetch);
    expect(r).toHaveLength(1); // the one with no picture is skipped
    expect(r[0].source).toBe('google');
    expect(r[0].year).toBe(2019);
    expect(r[0].thumbUrl).toBe('https://books.google.com/books/content?id=g1&printsec=frontcover&img=1&zoom=1&source=gbs_api');
    expect(r[0].imageUrl).toContain('zoom=0');
    expect(r[0].fallbackUrl).toBe(r[0].thumbUrl);
    expect(cleanGoogleImage('http://x/y?a=1&edge=curl')).toBe('https://x/y?a=1');
  });
  it('reports a source that answers with an error', async () => {
    const { fetch } = fakeFetch({ ol: () => json({}, 503) });
    await expect(searchOpenLibrary({ title: 'x' }, fetch)).rejects.toThrow(/503/);
  });
});

describe('searching for a book\'s cover', () => {
  const q = { title: 'Egotistical Puckboy', authors: ['Eden Finley', 'Saxon James'] };
  it('combines both sources, best match first, and does not repeat the same picture', async () => {
    const { fetch } = fakeFetch({ ol: () => json(OL), gb: () => json(GB) });
    const r = await searchCovers(q, fetch);
    expect(r.errors).toEqual([]);
    expect(r.candidates[0]).toMatchObject({ title: 'Egotistical Puckboy', confidence: 'high', source: 'openlibrary' }); // ties go to Open Library
    expect(r.candidates.map((c) => c.source)).toEqual(['openlibrary', 'google', 'openlibrary']);
    expect(r.candidates.at(-1)!.title).toBe('Puck Daddy');
    expect(new Set(r.candidates.map((c) => c.thumbUrl)).size).toBe(r.candidates.length);
  });
  it('still gives results when one source is down, and says so', async () => {
    const { fetch } = fakeFetch({ ol: () => { throw new Error('offline'); }, gb: () => json(GB) });
    const r = await searchCovers(q, fetch);
    expect(r.candidates).toHaveLength(1);
    expect(r.errors).toEqual([expect.stringMatching(/Open Library could not be reached \(offline\)/)]);
  });
  it('tries the title without its subtitle when the full title finds nothing', async () => {
    const { fetch, calls } = fakeFetch({ ol: () => (calls.filter((u) => u.includes('openlibrary')).length === 1 ? json({ docs: [] }) : json({ docs: [{ key: '/w/1', title: 'MateHub', author_name: ['Marie Reynard'], cover_i: 9 }] })) });
    const r = await searchCovers({ title: 'MateHub: Legend', authors: ['Marie Reynard'] }, fetch);
    expect(r.candidates.map((c) => c.title)).toEqual(['MateHub']);
    expect(calls.some((u) => u.includes('title=MateHub&') || u.includes('title=MateHub%'))).toBe(true);
  });
  it('tries again without the author when nothing matched with it', async () => {
    let n = 0;
    const { fetch, calls } = fakeFetch({ ol: () => (++n === 1 ? json({ docs: [] }) : json({ docs: [{ key: '/w/1', title: 'Odd Book', author_name: ['A. Writer'], cover_i: 5 }] })) });
    const r = await searchCovers({ title: 'Odd Book', authors: ['Spelled Differently'] }, fetch);
    expect(r.candidates).toHaveLength(1);
    expect(calls.some((u) => u.includes('openlibrary') && !u.includes('author='))).toBe(true);
  });
  it('returns nothing, without an error, when no source knows the book', async () => {
    const { fetch } = fakeFetch({});
    expect(await searchCovers(q, fetch)).toEqual({ candidates: [], errors: [] });
  });
});

describe('bulk fill', () => {
  const cand = (title: string, confidence: CoverCandidate['confidence'], id = title): CoverCandidate => ({ id, source: 'openlibrary', title, authors: [], year: null, imageUrl: `https://x/${id}.jpg`, fallbackUrl: null, thumbUrl: `https://x/${id}-m.jpg`, score: 90, confidence });
  const books = [{ id: 'b1', title: 'One', authors: ['A'] }, { id: 'b2', title: 'Two', authors: [] }, { id: 'b3', title: 'Three', authors: [] }, { id: 'b4', title: 'Four', authors: [] }];
  const search = vi.fn(async (q: { title: string }) => {
    if (q.title === 'One') return { candidates: [cand('One', 'high'), cand('One alt', 'low')], errors: [] };
    if (q.title === 'Two') return { candidates: [cand('Two', 'medium')], errors: [] };
    if (q.title === 'Three') return { candidates: [], errors: [] };
    throw new Error('network down');
  });

  it('ticks only strong matches', () => {
    expect(pickDefault([cand('x', 'high')])).toEqual({ chosen: 0, include: true });
    expect(pickDefault([cand('x', 'medium')])).toEqual({ chosen: 0, include: false });
    expect(pickDefault([cand('x', 'low')])).toEqual({ chosen: 0, include: false });
    expect(pickDefault([])).toEqual({ chosen: -1, include: false });
  });
  it('looks up each book in turn and reports progress', async () => {
    const seen: string[] = [];
    const rows = await searchBulk(books, { search, delayMs: 0, onProgress: (d, t, b) => seen.push(`${d}/${t} ${b.title}`) });
    expect(rows.map((r) => [r.book.title, r.status, r.include])).toEqual([['One', 'found', true], ['Two', 'found', false], ['Three', 'none', false], ['Four', 'failed', false]]);
    expect(rows[3].errors).toEqual(['network down']);
    expect(seen.slice(0, 4)).toEqual(['0/4 One', '1/4 Two', '2/4 Three', '3/4 Four']);
  });
  it('keeps what it found if cancelled', async () => {
    const ctl = new AbortController();
    const rows = await searchBulk(books, { search, delayMs: 0, signal: ctl.signal, onProgress: (d) => { if (d === 1) ctl.abort(); } }); // cancelled while the second book is being looked up
    expect(rows.map((r) => r.book.title)).toEqual(['One', 'Two']); // that book finishes, then it stops
  });
  it('saves the ticked covers, and one failure does not stop the rest', async () => {
    const rows = await searchBulk(books, { search, delayMs: 0 });
    rows[1].include = true; // the user ticks a possible match
    const saved: string[] = [];
    const out = await saveBulk(rows, {
      download: async (c) => { if (c.title === 'Two') throw new Error('The site said no (404).'); return { dataUrl: `data:${c.title}`, width: 200, height: 300, mime: 'image/jpeg' }; },
      save: async (id, img) => { saved.push(`${id}:${img.dataUrl}`); },
    });
    expect(saved).toEqual(['b1:data:One']);
    expect(out).toEqual({ saved: 1, failed: [{ title: 'Two', reason: 'The site said no (404).' }] });
  });
  it('saves a different candidate when the user picks one', async () => {
    const rows = await searchBulk(books.slice(0, 1), { search, delayMs: 0 });
    rows[0].chosen = 1;
    const saved: string[] = [];
    await saveBulk(rows, { download: async (c) => ({ dataUrl: c.title, width: 200, height: 300, mime: 'image/jpeg' }), save: async (_id, img) => { saved.push(img.dataUrl); } });
    expect(saved).toEqual(['One alt']);
  });
});

describe('the books that need covers', () => {
  it('lists books without a cover, with their authors, and drops them once they have one', async () => {
    const db = migrateNodeDb();
    await applyNotionPlan(db, planNotionBooks(readFileSync(new URL('./fixtures/book-tracker.csv', import.meta.url), 'utf8')), { tagDestinations: {} });
    const all = await listBooksForCovers(db);
    expect(all.length).toBe(15);
    expect(all.map((b) => b.title)).toEqual([...all.map((b) => b.title)].sort(byTitle));
    const puck = all.find((b) => b.title === 'Egotistical Puckboy')!;
    expect(puck.authors).toEqual(['Eden Finley', 'Saxon James']);
    await setBookCover(db, puck.id, { dataUrl: 'data:image/png;base64,AAA' });
    expect((await listBooksForCovers(db)).map((b) => b.id)).not.toContain(puck.id);
    expect((await listBooksForCovers(db, { includeWithCover: true })).map((b) => b.id)).toContain(puck.id);
    expect((await listBooksForCovers(db)).length).toBe(14);
  });
});

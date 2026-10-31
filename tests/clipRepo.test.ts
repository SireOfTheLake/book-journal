// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { extractClip } from '../src/clip/extract';
import type { BookClip } from '../src/clip/types';
import { getBookLog } from '../src/repo/bookLog';
import { reviewClip, saveClip, setAuthorAudibleLink, type ClipSave } from '../src/repo/clip';

vi.mock('../src/lookup/download', () => ({
  downloadCover: vi.fn(async () => ({ dataUrl: 'data:image/png;base64,AAAA', width: 400, height: 600, mime: 'image/png' })),
}));

const URLS = {
  audible: 'https://www.audible.ca/pd/Finest-Kind-of-Fate-Audiobook/B0H6PKSQ48',
  romanceio: 'https://www.romance.io/books/6957836c2c7cb2aa786cd4f2/finest-kind-of-fate-jj-mulder',
};
const clipOf = (site: keyof typeof URLS): BookClip => { document.documentElement.innerHTML = readFileSync(`tests/clipPages/${site}.html`, 'utf8'); return extractClip(document, URLS[site])!; };

const saveFrom = (clip: BookClip, over: Partial<ClipSave> = {}): ClipSave => ({
  mode: { kind: 'new' }, title: clip.title, authors: clip.authors, narrators: clip.narrators ?? [], series: clip.series ? { id: null, name: clip.series } : null, position: clip.seriesPosition ?? null,
  pages: clip.pages ?? null, published: null, heat: clip.heat ?? null, synopsis: clip.description ?? null, cover: clip.cover ?? null, shelf: 'tbr',
  plannedFormat: clip.format ?? null, tags: [], ids: { isbn: clip.isbn, asin: clip.asin, sources: { [clip.site]: clip.url } }, authorLinks: clip.authorLinks ?? {}, ...over,
});

let db: Db;
beforeEach(() => { db = migrateNodeDb(); });

describe('how tags are spelled when saved', () => {
  it('tropes in lower case, genres with a capital on each word, and your own spelling wins', async () => {
    const { formatTag } = await import('../src/repo/clip');
    expect(formatTag('Friends To Lovers', 'trope')).toBe('friends to lovers');
    expect(formatTag('Found Family', 'theme')).toBe('found family');
    expect(formatTag('m m romance', 'genre')).toBe('M M Romance');
    expect(formatTag('LGBTQIA+', 'genre')).toBe('LGBTQIA+');
    expect(formatTag('Slow-paced', 'pace')).toBe('Slow-paced');
    await db.execute("INSERT INTO genre (id, name) VALUES ('g1', 'Sci-Fi Romance')");
    const out = await saveClip(db, saveFrom(clipOf('romanceio'), { tags: [{ name: 'Friends To Lovers', kind: 'trope' }, { name: 'gay romance', kind: 'genre' }, { name: 'sci-fi romance', kind: 'genre' }] }));
    const log = (await getBookLog(db, out.bookId))!;
    expect(log.tropes.map((t) => t.name)).toEqual(['friends to lovers']);
    expect(log.genres.map((t) => t.name).sort()).toEqual(['Gay Romance', 'Sci-Fi Romance']);
  });
});

describe('choosing what to keep for a book that is already here', () => {
  it('keeps your title, synopsis and cover unless you choose the page\'s, and fills only blanks otherwise', async () => {
    const clip = clipOf('romanceio');
    const made = await saveClip(db, saveFrom(clip, { title: 'Finest Kind of Fate', synopsis: 'My own blurb.' }));
    await db.execute("UPDATE book SET title = 'Finest Kind of Fat' WHERE id = ?", [made.bookId]);
    const r = await reviewClip(db, { ...clip, title: 'Finest Kind of Fat' });
    expect(r.existing).toMatchObject({ synopsis: 'My own blurb.', cover: 'data:image/png;base64,AAAA' });
    // Nothing chosen: nothing of yours changes.
    await saveClip(db, saveFrom(clip, { mode: { kind: 'fill', bookId: made.bookId }, title: 'Finest Kind of Fate', synopsis: 'Page blurb.' }));
    let log = (await getBookLog(db, made.bookId))!;
    expect(log.book).toMatchObject({ title: 'Finest Kind of Fat', synopsis: 'My own blurb.' });
    // Chosen: the title and synopsis are replaced, and the cover is downloaded again.
    const dl = await import('../src/lookup/download');
    vi.mocked(dl.downloadCover).mockClear();
    const out = await saveClip(db, saveFrom(clip, { mode: { kind: 'fill', bookId: made.bookId }, title: 'Finest Kind of Fate', synopsis: 'Page blurb.', replace: ['title', 'synopsis', 'cover'] }));
    log = (await getBookLog(db, made.bookId))!;
    expect(log.book).toMatchObject({ title: 'Finest Kind of Fate', synopsis: 'Page blurb.' });
    expect(out.added).toEqual(expect.arrayContaining(['title', 'synopsis', 'new cover']));
    expect(vi.mocked(dl.downloadCover)).toHaveBeenCalledTimes(1);
  });
  it('without a choice a cover is not downloaded for a book that has one', async () => {
    const clip = clipOf('romanceio');
    const made = await saveClip(db, saveFrom(clip));
    const dl = await import('../src/lookup/download');
    vi.mocked(dl.downloadCover).mockClear();
    await saveClip(db, saveFrom(clip, { mode: { kind: 'fill', bookId: made.bookId } }));
    expect(vi.mocked(dl.downloadCover)).not.toHaveBeenCalled();
  });
});

describe('adding a book from a web page', () => {
  it('reviews a book against an empty journal: nothing matches yet', async () => {
    const r = await reviewClip(db, clipOf('audible'));
    expect(r.existing).toBeNull();
    expect(r.authors).toEqual([{ name: 'J.J. Mulder', match: null }]);
    expect(r.series).toEqual({ name: "A Siren's Point Story", match: null });
    expect(r.narrators.map((n) => n.match)).toEqual([null, null]);
  });

  it('saves a new book on the TBR with its author, series, narrators, tags, cover and real Audible author page', async () => {
    const clip = clipOf('audible');
    const out = await saveClip(db, saveFrom(clip, { cover: 'https://example.test/c.jpg', tags: [{ name: 'Romance', kind: 'genre' }, { name: 'Contemporary', kind: 'genre' }] }));
    expect(out).toMatchObject({ created: true, coverError: null });
    const log = (await getBookLog(db, out.bookId))!;
    expect(log.book).toMatchObject({ title: 'Finest Kind of Fate', shelf: 'tbr', series_position: 1 });
    expect(log.authors.map((a) => a.name)).toEqual(['J.J. Mulder']);
    expect(log.series?.title).toBe("A Siren's Point Story");
    expect(log.genres.map((g) => g.name).sort()).toEqual(['Romance']);
    expect(log.cover).toBe('data:image/png;base64,AAAA');
    const [b] = await db.select<{ planned_format: string; external_ids: string }>('SELECT planned_format, external_ids FROM book WHERE id = ?', [out.bookId]);
    expect(b.planned_format).toBe('audio');
    expect(JSON.parse(b.external_ids)).toMatchObject({ asin: 'B0H6PKSQ48', web_pages: { audible: URLS.audible } });
    expect((await db.select<{ name: string }>('SELECT n.name AS name FROM book_narrator bn JOIN narrator n ON n.id = bn.narrator_id WHERE bn.book_id = ? ORDER BY bn.sort_order', [out.bookId])).map((r) => r.name)).toEqual(['Iggy Toma', 'Javi Wilder']);
    // the author's Audible Page link was the search the app made; it is now the real page
    const [au] = await db.select<{ links: string }>("SELECT links FROM author WHERE name = 'J.J. Mulder'");
    expect(JSON.parse(au.links)).toEqual([{ label: 'Audible Page', url: 'https://www.audible.ca/author/J-J-Mulder/B0CP6G3KL7' }]);
    // a narrator's link is the search
    const [nar] = await db.select<{ links: string }>("SELECT links FROM narrator WHERE name = 'Iggy Toma'");
    expect(JSON.parse(nar.links)[0].url).toBe('https://www.audible.ca/search?searchNarrator=Iggy+Toma');
  });

  it('recognises the same book from another site, and only fills in what is missing', async () => {
    const first = await saveClip(db, saveFrom(clipOf('audible')));
    const rom = clipOf('romanceio');
    const r = await reviewClip(db, rom);
    expect(r.existing?.id).toBe(first.bookId);
    expect(r.authors[0].match?.name).toBe('J.J. Mulder');
    expect(r.series?.match?.name).toBe("A Siren's Point Story");
    await db.execute("UPDATE book SET page_count = 400 WHERE id = ?", [first.bookId]);
    const out = await saveClip(db, saveFrom(rom, { mode: { kind: 'fill', bookId: first.bookId }, series: { id: r.series!.match!.id, name: r.series!.match!.name }, published: '2026-02-27', tags: [{ name: 'slow burn', kind: 'trope' }] }));
    expect(out.created).toBe(false);
    const [b] = await db.select<Record<string, unknown>>('SELECT page_count, heat_level, original_publication_date, synopsis FROM book WHERE id = ?', [first.bookId]);
    expect(b).toMatchObject({ page_count: 400, heat_level: 3, original_publication_date: '2026-02-27' }); // pages were already set, so not replaced
    expect(String(b.synopsis)).toMatch(/^Ewan Fate left home seven years ago/); // the first one's description stays
    expect((await getBookLog(db, first.bookId))!.tropes.map((t) => t.name)).toEqual(['slow burn']);
    expect((await db.select('SELECT id FROM book WHERE deleted_at IS NULL')).length).toBe(1);
    expect(JSON.parse((await db.select<{ e: string }>('SELECT external_ids AS e FROM book'))[0].e).web_pages).toMatchObject({ audible: URLS.audible, romanceio: URLS.romanceio });
    // and it is found again by what the first page said
    expect((await reviewClip(db, { ...clipOf('audible'), title: 'A different title on this page' })).existing?.id).toBe(first.bookId);
  });

  it('puts the book on Up Next when asked, and matches an author you spell differently', async () => {
    await db.execute("INSERT INTO author (id, name) VALUES ('a1', 'JJ Mulder')");
    const clip = clipOf('romanceio');
    const r = await reviewClip(db, clip);
    expect(r.authors[0].match).toEqual({ id: 'a1', name: 'JJ Mulder' });
    const out = await saveClip(db, saveFrom(clip, { authors: [r.authors[0].match!.name], shelf: 'up_next' }));
    const log = (await getBookLog(db, out.bookId))!;
    expect(log.book.shelf).toBe('up_next');
    expect(log.authors.map((a) => a.id)).toEqual(['a1']);
    expect((await db.select('SELECT id FROM author WHERE deleted_at IS NULL')).length).toBe(1);
  });

  it('tags keep the meaning they already have in your lists', async () => {
    await db.execute("INSERT INTO trope (id, name, color) VALUES ('t1', 'Slow Burn', '#fff')");
    await db.execute("INSERT INTO genre (id, name, color) VALUES ('g1', 'Contemporary', '#fff')");
    const r = await reviewClip(db, clipOf('romanceio'));
    const kind = (n: string) => r.tags.find((t) => t.name === n)!.known;
    expect(kind('slow burn')).toBe('trope');
    expect(r.tags.some((t) => t.name.toLowerCase() === 'contemporary')).toBe(false); // never offered
    expect(kind('friends to lovers')).toBeNull();
  });

  it('keeps the book when the cover cannot be downloaded', async () => {
    const dl = await import('../src/lookup/download');
    vi.mocked(dl.downloadCover).mockRejectedValueOnce(new Error('blocked'));
    const out = await saveClip(db, saveFrom(clipOf('romanceio')));
    expect(out.coverError).toBe('blocked');
    expect((await db.select('SELECT id FROM book WHERE deleted_at IS NULL')).length).toBe(1);
  });

  it("only swaps an author's Audible link when it is still the one the app made", async () => {
    await db.execute("INSERT INTO author (id, name, links) VALUES ('a1', 'X', '[{\"label\":\"Audible Page\",\"url\":\"https://www.audible.ca/author/X/B0AAAAAAAA\"}]')");
    expect(await setAuthorAudibleLink(db, 'a1', 'https://www.audible.ca/author/X/B0BBBBBBBB')).toBe(false); // one you set yourself stays
    await db.execute("INSERT INTO author (id, name, links) VALUES ('a2', 'Y', '[]')");
    expect(await setAuthorAudibleLink(db, 'a2', 'https://www.audible.ca/author/Y/B0CCCCCCCC')).toBe(true);
  });
});

describe('a book that already has a read', () => {
  for (const status of ['up_next', 'reading', 'finished'] as const) {
    it(`puts the page's narrators and audio length on the ${status} read`, async () => {
      const clip = clipOf('audible');
      const made = await saveClip(db, saveFrom(clip, { narrators: [], audioSeconds: null, shelf: 'tbr' }));
      const { setStatus } = await import('../src/repo/bookLog');
      await setStatus(db, made.bookId, null, status);
      await saveClip(db, saveFrom(clip, { mode: { kind: 'fill', bookId: made.bookId }, narrators: ['Ann Voice', 'Bo Reader'], audioSeconds: 36000 }));
      const [r] = await db.select<{ audio_length_seconds: number; names: string }>("SELECT r.audio_length_seconds AS audio_length_seconds, (SELECT group_concat(n.name, ',') FROM read_narrator rn JOIN narrator n ON n.id = rn.narrator_id WHERE rn.read_id = r.id AND rn.deleted_at IS NULL) AS names FROM read r WHERE r.book_id = ? AND r.deleted_at IS NULL", [made.bookId]);
      expect(r.audio_length_seconds).toBe(36000);
      expect(r.names?.split(',').sort()).toEqual(['Ann Voice', 'Bo Reader']);
    });
  }
});

import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { undoImport } from '../src/import/apply';
import { applyBookCsv, parseBookCsv, parseCopies, reviewBookCsv, templateCsv, type Decision } from '../src/import/bookCsv';
import { quickAdd } from '../src/repo/bookLog';

let db: Db;
beforeEach(() => { db = migrateNodeDb(); });

describe('reading the spreadsheet', () => {
  it('the example file reads back with every column filled in', () => {
    const p = parseBookCsv(templateCsv());
    expect(p.missingTitleColumn).toBe(false);
    expect(p.books).toHaveLength(4);
    expect(p.books[1]).toMatchObject({ title: 'Crown of Salt', authors: ['A.J. Sherwood'], series: 'Royal Bargains', position: 2, pages: 412, copies: { physical: true, audio: true, ebook: false } });
    expect(p.books[3]).toMatchObject({ authors: ['Ines Calder', 'Dana Vale'], position: 1.5, copies: { physical: false, audio: true, ebook: true } });
    expect(p.books.every((b) => b.warnings.length === 0)).toBe(true);
  });
  it('accepts other header spellings, quoted commas, and leaves bad values out with a note', () => {
    const p = parseBookCsv('book title,Authors,Series Name,Series Number,Pages,Owned,Notes\r\n"Hello, World",Ann & Bob,Saga,abc,"1,200",kindle; vinyl,x\r\nNo Series,Cy,,3,xyz,,\r\n');
    expect(p.ignoredColumns).toEqual(['Notes']);
    expect(p.books[0]).toMatchObject({ title: 'Hello, World', authors: ['Ann', 'Bob'], series: 'Saga', position: null, pages: 1200, copies: { ebook: true, physical: false, audio: false } });
    expect(p.books[0].warnings).toHaveLength(2); // position and "vinyl"
    expect(p.books[1]).toMatchObject({ position: null, pages: null });
    expect(p.books[1].warnings.join(' ')).toMatch(/no series/);
  });
  it('says when there is no Title column', () => {
    expect(parseBookCsv('Name,Who\r\nx,y').missingTitleColumn).toBe(false); // "name" counts as a title
    expect(parseBookCsv('Who,Where\r\nx,y').missingTitleColumn).toBe(true);
  });
  it('understands the copy words', () => {
    expect(parseCopies('Audiobook / paperback').copies).toEqual({ physical: true, audio: true, ebook: false });
    expect(parseCopies('').copies).toEqual({ physical: false, audio: false, ebook: false });
  });
});

describe('matching and saving', () => {
  it('matches authors and series that exist, flags the new ones, and spots books already there', async () => {
    await quickAdd(db, { title: 'The Prince Pact', authors: ['A.J. Sherwood'], status: 'tbr' });
    const { setBookSeries, createSeries } = await import('../src/repo/series');
    const [{ id: bid }] = await db.select<{ id: string }>("SELECT id FROM book WHERE title = 'The Prince Pact'");
    await setBookSeries(db, bid, await createSeries(db, 'Royal Bargains'), 1);
    const p = parseBookCsv('Title,Author,Series,Position,Page Number,Copies I Own\r\nThe Prince Pact,AJ Sherwood,Royal Bargains,1,384,Physical\r\nCrown of Salt,AJ Sherwood,royal bargains,2,412,Audio\r\nNew One,Zed Zane,Zed Saga,1,100,Ebook\r\nNew Two,Zed Zane,Zed Saga,2,100,Ebook\r\n');
    const r = await reviewBookCsv(db, p.books);
    expect(r.rows[0].duplicateOf).toMatch(/Already in your library/);
    expect(r.rows[1].duplicateOf).toBeNull();
    const sherwood = r.authors.find((a) => a.match?.name === 'A.J. Sherwood');
    expect(sherwood?.count).toBe(2);
    expect(r.authors.filter((a) => !a.match).map((a) => a.typed)).toEqual(['Zed Zane']);
    expect(r.authors.find((a) => a.typed === 'Zed Zane')?.count).toBe(2);
    expect(r.series.find((s) => s.match)?.match?.name).toBe('Royal Bargains');
    expect(r.series.find((s) => !s.match)?.typed).toBe('Zed Saga');
  });
  it('writes the books, creates only what was approved, refuses undecided names, and can be undone', async () => {
    const p = parseBookCsv('Title,Author,Series,Position,Page Number,Copies I Own\r\nOne,Zed Zane,Zed Saga,1,100,Physical; Ebook\r\nTwo,Zed Zane,Zed Saga,2.5,,Audio\r\n');
    const r = await reviewBookCsv(db, p.books);
    const names = Object.fromEntries(r.authors.map((a) => [a.key, a.typed])); const snames = Object.fromEntries(r.series.map((s) => [s.key, s.typed]));
    const base = { rows: r.rows, authors: {}, series: {}, authorNames: names, seriesNames: snames, shelf: null as 'tbr' | null };
    await expect(applyBookCsv(db, base)).rejects.toThrow(/Zed Zane/);
    expect((await db.select('SELECT 1 FROM book')).length).toBe(0);
    const newer: Decision = { kind: 'new' };
    const res = await applyBookCsv(db, { ...base, authors: { [r.authors[0].key]: newer }, series: { [r.series[0].key]: newer }, shelf: 'tbr' });
    expect(res).toMatchObject({ booksCreated: 2, authorsCreated: 1, seriesCreated: 1 });
    const books = await db.select<Record<string, unknown>>("SELECT title, series_position, page_count, shelf, own_physical, own_ebook, own_audio, (SELECT group_concat(a.name) FROM book_author ba JOIN author a ON a.id = ba.author_id WHERE ba.book_id = book.id) AS authors, (SELECT title FROM series WHERE id = book.series_id) AS series FROM book ORDER BY title");
    expect(books).toEqual([
      { title: 'One', series_position: 1, page_count: 100, shelf: 'tbr', own_physical: 1, own_ebook: 1, own_audio: 0, authors: 'Zed Zane', series: 'Zed Saga' },
      { title: 'Two', series_position: 2.5, page_count: null, shelf: 'tbr', own_physical: 0, own_ebook: 0, own_audio: 1, authors: 'Zed Zane', series: 'Zed Saga' },
    ]);
    await undoImport(db, res.batchId);
    expect(await db.select('SELECT 1 FROM book WHERE deleted_at IS NULL')).toHaveLength(0);
    expect(await db.select('SELECT 1 FROM author WHERE deleted_at IS NULL')).toHaveLength(0);
    expect(await db.select('SELECT 1 FROM series WHERE deleted_at IS NULL')).toHaveLength(0);
  });
});

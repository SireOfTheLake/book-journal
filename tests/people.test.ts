import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { newId } from '../src/domain/ids';
import { applyNotionPlan } from '../src/import/apply';
import { planNotionBooks } from '../src/import/notion';
import { createBook } from '../src/repo/books';
import { createRead, getBookLog, setNarratorAccent, setNarratorRating, updateBook, updateRead } from '../src/repo/bookLog';
import { addAlias, addLink, addUsualAccent, getAuthor, getNarrator, listAliases, listAuthors, listNarrators, removeAlias, removeLink, updateLink, removePhoto, removeUsualAccent, setPhoto, updatePerson } from '../src/repo/people';
import { setFormatRelease } from '../src/repo/series';

let db: Db;
const authorId = async (n: string) => (await db.select<{ id: string }>('SELECT id FROM author WHERE name = ?', [n]))[0].id;
const narratorId = async (n: string) => (await db.select<{ id: string }>('SELECT id FROM narrator WHERE name = ?', [n]))[0].id;
const bookId = async (t: string) => (await db.select<{ id: string }>('SELECT id FROM book WHERE title = ?', [t]))[0].id;
const readOf = async (t: string) => (await db.select<{ id: string }>('SELECT r.id AS id FROM read r JOIN book b ON b.id = r.book_id WHERE b.title = ?', [t]))[0].id;

beforeEach(async () => {
  db = migrateNodeDb();
  await applyNotionPlan(db, planNotionBooks(readFileSync(new URL('./fixtures/book-tracker.csv', import.meta.url), 'utf8')), { tagDestinations: { hockey: 'genre', sports: 'genre', royalty: 'trope' } });
});

describe('the author and narrator lists', () => {
  it('lists authors A to Z with book, series, and read counts', async () => {
    const rows = await listAuthors(db);
    const names = rows.map((r) => r.name);
    expect(names).toEqual([...names].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())));
    expect(rows.find((r) => r.name === 'Eden Finley')).toMatchObject({ books: 2, read: 2, extra: 1 });
  });
  it('counts a narrator\'s audio listens', async () => {
    const row = (await listNarrators(db)).find((r) => r.name === 'Alexander Cendese')!;
    expect(row).toMatchObject({ books: 2, read: 2 });
  });
});

describe('an author', () => {
  it('brings together books, series, co-authors, and tags', async () => {
    const a = (await getAuthor(db, await authorId('Eden Finley')))!;
    expect(a.books.map((b) => b.title)).toEqual(['Irresponsible Puckboy', 'Egotistical Puckboy']); // newest first
    expect(a.series.map((s) => s.name)).toEqual(['Puckboys']);
    expect(a.coAuthors).toEqual([expect.objectContaining({ name: 'Saxon James', n: 2 })]);
    expect(a.genres.map((g) => [g.name, g.n])).toEqual([['hockey', 2], ['sports', 2]]);
    expect(a.booksRead).toBe(2);
  });
  it('works out ratings, pages, and ratings by format from your reads', async () => {
    const a1 = await authorId('Eden Finley');
    await updateRead(db, await readOf('Egotistical Puckboy'), { rating: 18 });
    await updateRead(db, await readOf('Irresponsible Puckboy'), { rating: 14, format: 'ebook' });
    await updateBook(db, await bookId('Egotistical Puckboy'), { page_count: 300 });
    await updateBook(db, await bookId('Irresponsible Puckboy'), { page_count: 200 });
    const a = (await getAuthor(db, a1))!;
    expect(a).toMatchObject({ avgStars: 4, ratedBooks: 2, totalPages: 500 });
    expect(a.byFormat.map((f) => [f.format, f.stars, f.n])).toEqual([['audio', 4.5, 1], ['ebook', 3.5, 1]]);
  });
  it('lists unread books and upcoming releases', async () => {
    const a1 = await authorId('Eden Finley');
    const next = await createBook(db, { title: 'Shameless Puckboy', authors: ['Eden Finley'], shelf: 'tbr' });
    await setFormatRelease(db, next, 'audio', '2099-03-01');
    await setFormatRelease(db, next, 'ebook', '2001-01-01'); // already out, so not upcoming
    await setFormatRelease(db, next, 'physical', 'tba');
    const a = (await getAuthor(db, a1))!;
    expect(a.unread.map((b) => b.title)).toEqual(['Shameless Puckboy']);
    expect(a.upcoming.map((u) => [u.format, u.status, u.release_date])).toEqual([['audio', 'dated', '2099-03-01'], ['physical', 'tba', null]]);
  });
  it('returns null for an unknown author', async () => {
    expect(await getAuthor(db, 'nope')).toBeNull();
  });
});

describe('editing an author or narrator', () => {
  it('keeps pen names once, and removes them', async () => {
    const id = await authorId('Eden Finley');
    await addAlias(db, 'author', id, 'E. Finley'); await addAlias(db, 'author', id, 'e. finley'); await addAlias(db, 'author', id, '  ');
    const list = await listAliases(db, 'author', id);
    expect(list.map((x) => x.name)).toEqual(['E. Finley']);
    await removeAlias(db, 'author', list[0].id);
    expect(await listAliases(db, 'author', id)).toEqual([]);
  });
  it('adds and removes links, and refuses an empty address', async () => {
    const id = await narratorId('Alexander Cendese');
    await addLink(db, 'narrator', id, 'Audible', 'https://example.com/a');
    await addLink(db, 'narrator', id, '', 'https://example.com/b');
    expect((await getNarrator(db, id))!.core.links.slice(1)).toEqual([{ label: 'Audible', url: 'https://example.com/a' }, { label: 'https://example.com/b', url: 'https://example.com/b' }]);
    expect((await getNarrator(db, id))!.core.links[0].label).toBe('Audible Page'); // the one every narrator starts with
    await updateLink(db, 'narrator', id, 1, 'Site', 'https://example.com/a2');
    expect((await getNarrator(db, id))!.core.links[1]).toEqual({ label: 'Site', url: 'https://example.com/a2' });
    await expect(updateLink(db, 'narrator', id, 1, 'x', ' ')).rejects.toThrow();
    await removeLink(db, 'narrator', id, 0);
    await removeLink(db, 'narrator', id, 0);
    expect((await getNarrator(db, id))!.core.links.map((l) => l.url)).toEqual(['https://example.com/b']);
    await expect(addLink(db, 'narrator', id, 'x', ' ')).rejects.toThrow();
  });
  it('sets, replaces, and removes a photo', async () => {
    const id = await authorId('Eden Finley');
    await setPhoto(db, 'author', id, { dataUrl: 'data:image/png;base64,AAA' });
    expect((await getAuthor(db, id))!.core.photo).toBe('data:image/png;base64,AAA');
    await setPhoto(db, 'author', id, { dataUrl: 'data:image/png;base64,BBB' });
    expect((await getAuthor(db, id))!.core.photo).toBe('data:image/png;base64,BBB');
    expect(await db.select('SELECT id FROM image WHERE file_path LIKE ? AND deleted_at IS NULL', ['%AAA'])).toEqual([]); // the old one is gone
    await removePhoto(db, 'author', id);
    expect((await getAuthor(db, id))!.core.photo).toBeNull();
  });
  it('updates name, favorite, and notes, and ignores other columns', async () => {
    const id = await authorId('Eden Finley');
    await updatePerson(db, 'author', id, { is_favorite: 1, notes: 'Writes with Saxon', name: 'Eden Finley', deleted_at: 'x' });
    expect((await getAuthor(db, id))!.core).toMatchObject({ is_favorite: 1, notes: 'Writes with Saxon' });
  });
});

describe('a narrator', () => {
  it('brings together listens, co-narrators, ratings, hours, and accents', async () => {
    const id = await narratorId('Alexander Cendese');
    const log = (await getBookLog(db, await bookId('Egotistical Puckboy')))!;
    const mine = log.narrators.find((n) => n.name === 'Alexander Cendese')!;
    await setNarratorRating(db, mine.id, 'up');
    await setNarratorAccent(db, mine.id, 'General NA');
    await updateRead(db, log.read!.id, { audio_length_seconds: 3600 });
    await updateRead(db, await readOf('Irresponsible Puckboy'), { audio_length_seconds: 7200 });
    const n = (await getNarrator(db, id))!;
    expect(n.listens.map((l) => l.title)).toEqual(['Irresponsible Puckboy', 'Egotistical Puckboy']);
    expect(n.totalSeconds).toBe(10800);
    expect(n.tally).toEqual({ up: 1, neutral: 0, down: 0, unrated: 1 });
    expect(n.coNarrators).toEqual([expect.objectContaining({ name: 'Iggy Toma', n: 2 })]);
    expect(n.commonAccents).toEqual([expect.objectContaining({ name: 'General NA', n: 1 })]);
    expect(n.genres.map((g) => g.name)).toEqual(['hockey', 'sports']);
  });
  it('only counts audio reads as listens', async () => {
    const id = await narratorId('Alexander Cendese');
    const book = await createBook(db, { title: 'Book X', authors: ['Someone'] });
    await db.execute('INSERT INTO book_narrator (id, book_id, narrator_id, sort_order) VALUES (?, ?, ?, 0)', [newId(), book, id]);
    expect((await getNarrator(db, id))!.notListened.map((b) => b.title)).toEqual(['Book X']);
    const read = await createRead(db, book); // starts with the book's narrators, but no format yet
    await updateRead(db, read, { format: 'ebook' });
    let n = (await getNarrator(db, id))!;
    expect(n.listens).toHaveLength(2); // the ebook read is not a listen
    expect(n.notListened.map((b) => b.title)).toEqual(['Book X']);
    await updateRead(db, read, { format: 'audio' });
    n = (await getNarrator(db, id))!;
    expect(n.listens).toHaveLength(3);
    expect(n.notListened).toEqual([]);
  });
  it('lists the characters a narrator voiced', async () => {
    const id = await narratorId('Harley Chase');
    const log = (await getBookLog(db, await bookId('MateHub: Legend')))!;
    const rn = log.narrators.find((x) => x.name === 'Harley Chase')!;
    const ch = newId();
    await db.execute("INSERT INTO character (id, name, is_featured) VALUES (?, 'Hunter Savage', 1)", [ch]);
    await db.execute('INSERT INTO read_narrator_character (id, read_narrator_id, character_id) VALUES (?, ?, ?)', [newId(), rn.id, ch]);
    const n = (await getNarrator(db, id))!;
    expect(n.voiced).toEqual([{ id: ch, name: 'Hunter Savage', book: 'MateHub: Legend' }]);
    expect(n.listens[0].voiced).toBe('Hunter Savage');
  });
  it('keeps a list of usual accents, reusing accent entries', async () => {
    const id = await narratorId('Alexander Cendese');
    await addUsualAccent(db, id, 'British'); await addUsualAccent(db, id, 'british'); await addUsualAccent(db, id, 'General NA');
    let n = (await getNarrator(db, id))!;
    expect(n.usualAccents.map((a) => a.name)).toEqual(['British', 'General NA']);
    await removeUsualAccent(db, id, n.usualAccents[0].id);
    n = (await getNarrator(db, id))!;
    expect(n.usualAccents.map((a) => a.name)).toEqual(['General NA']);
  });
  it('returns null for an unknown narrator', async () => {
    expect(await getNarrator(db, 'nope')).toBeNull();
  });
});

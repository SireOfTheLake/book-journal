import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { applyNotionPlan } from '../src/import/apply';
import { applyNotionCharacters } from '../src/import/applyCharacters';
import { planNotionBooks } from '../src/import/notion';
import { planNotionCharacters } from '../src/import/notionCharacters';
import { addBookAuthor, addNarratorToRead, createNarrator, getBookLog, listAuthorOptions, listInProgressReads, removeBookAuthor, removeBookCover, removeNarratorFromRead, saveDayEntry, setBookCover, setStatus, updateRead } from '../src/repo/bookLog';
import { createBook } from '../src/repo/books';
import { addPerson, convertPerson, getCharacter, setPersonStatus, setRelationshipStatus, updateCharacter, addRelationship } from '../src/repo/characters';
import { addBookToNarrator, getNarrator, removeBookFromNarrator } from '../src/repo/people';
import { addBookToSeries, addSeriesAuthor, createSeries, getSeriesPage, removeSeriesAuthor } from '../src/repo/series';
import { getCalendarMonth } from '../src/repo/calendar';

const read = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');
let db: Db;
const idOf = async (table: string, col: string, v: string) => (await db.select<{ id: string }>(`SELECT id FROM ${table} WHERE ${col} = ?`, [v]))[0].id;
const readOf = async (t: string) => (await db.select<{ id: string }>('SELECT r.id AS id FROM read r JOIN book b ON b.id = r.book_id WHERE b.title = ?', [t]))[0].id;

beforeEach(async () => {
  db = migrateNodeDb();
  await applyNotionPlan(db, planNotionBooks(read('book-tracker.csv')), { tagDestinations: {} });
  await applyNotionCharacters(db, planNotionCharacters(read('characters.csv')));
});

describe('a series\' own authors', () => {
  it('starts with the authors of its books, then can be edited', async () => {
    const id = await idOf('series', 'title', 'Puckboys');
    expect((await getSeriesPage(db, id))!.authors.map((a) => a.name)).toEqual(['Eden Finley', 'Saxon James']);
    await addSeriesAuthor(db, id, { name: 'A New Author' });
    expect((await getSeriesPage(db, id))!.authors.map((a) => a.name)).toEqual(['Eden Finley', 'Saxon James', 'A New Author']); // nothing disappears
    await removeSeriesAuthor(db, id, (await getSeriesPage(db, id))!.authors[1].id);
    expect((await getSeriesPage(db, id))!.authors.map((a) => a.name)).toEqual(['Eden Finley', 'A New Author']);
    await addSeriesAuthor(db, id, { name: 'a new author' }); // already there
    expect((await getSeriesPage(db, id))!.authors).toHaveLength(2);
    await expect(addSeriesAuthor(db, id, {})).rejects.toThrow();
  });
  it('lets you create a series with an author and number of books, and new books use that author', async () => {
    const id = await createSeries(db, 'Brand New Saga', { authors: ['Jane Writer', 'Co Author'], totalBooks: 4 });
    const page = (await getSeriesPage(db, id))!;
    expect(page.authors.map((a) => a.name)).toEqual(['Jane Writer', 'Co Author']);
    expect(page.series.total_books).toBe(4);
    expect(page).toMatchObject({ read: 0, total: 4, allBooks: 4 });
    const book = await addBookToSeries(db, id, 'Saga One');
    expect((await getBookLog(db, book))!.authors.map((a) => a.name)).toEqual(['Jane Writer', 'Co Author']);
    expect((await getSeriesPage(db, id))!.series.total_books).toBe(4); // the stated length is kept
  });
  it('quick add without an author or a count still creates the series', async () => {
    const id = await createSeries(db, 'Just A Title');
    expect((await getSeriesPage(db, id))!).toMatchObject({ authors: [], total: 0 });
  });
});

describe('authors on a book', () => {
  it('adds an existing or new author and removes one', async () => {
    const id = await idOf('book', 'title', 'Hooks In');
    await addBookAuthor(db, id, { name: 'Brand New Writer' });
    await addBookAuthor(db, id, { id: await idOf('author', 'name', 'Eden Finley') });
    await addBookAuthor(db, id, { name: 'brand new writer' }); // already there
    const log = (await getBookLog(db, id))!;
    expect(log.authors.map((a) => a.name)).toEqual(expect.arrayContaining(['Brand New Writer', 'Eden Finley']));
    expect(log.authors.filter((a) => a.name === 'Brand New Writer')).toHaveLength(1);
    await removeBookAuthor(db, id, log.authors.find((a) => a.name === 'Brand New Writer')!.id);
    expect((await getBookLog(db, id))!.authors.map((a) => a.name)).not.toContain('Brand New Writer');
    expect((await listAuthorOptions(db)).some((a) => a.name === 'Brand New Writer')).toBe(true); // the author still exists
    await expect(addBookAuthor(db, id, {})).rejects.toThrow();
  });
});

describe('narrators on a book, and books on a narrator', () => {
  it('adds a narrator to a read and to the book, and removes them from both when no other read uses them', async () => {
    const book = await idOf('book', 'title', 'Egotistical Puckboy');
    const rid = await readOf('Egotistical Puckboy');
    const nid = await createNarrator(db, 'Fresh Voice');
    expect(await createNarrator(db, 'fresh voice')).toBe(nid);
    await addNarratorToRead(db, rid, nid);
    await addNarratorToRead(db, rid, nid); // no duplicate
    let log = (await getBookLog(db, book))!;
    expect(log.narrators.filter((n) => n.name === 'Fresh Voice')).toHaveLength(1);
    expect(await db.select('SELECT id FROM book_narrator WHERE book_id = ? AND narrator_id = ? AND deleted_at IS NULL', [book, nid])).toHaveLength(1);
    await removeNarratorFromRead(db, log.narrators.find((n) => n.name === 'Fresh Voice')!.id);
    log = (await getBookLog(db, book))!;
    expect(log.narrators.map((n) => n.name)).not.toContain('Fresh Voice');
    expect(await db.select('SELECT id FROM book_narrator WHERE book_id = ? AND narrator_id = ? AND deleted_at IS NULL', [book, nid])).toEqual([]);
    await expect(createNarrator(db, ' ')).rejects.toThrow();
  });
  it('keeps the usual narrator when another read of the book still uses them', async () => {
    const book = await idOf('book', 'title', 'Egotistical Puckboy');
    const nid = await createNarrator(db, 'Keeps On');
    await addNarratorToRead(db, await readOf('Egotistical Puckboy'), nid);
    await setStatus(db, book, null, 'reading'); // a second read, which starts with the usual narrators
    const second = (await getBookLog(db, book))!;
    expect(second.narrators.map((n) => n.name)).toContain('Keeps On');
    const first = (await getBookLog(db, book, second.reads[0].id))!;
    await removeNarratorFromRead(db, first.narrators.find((n) => n.name === 'Keeps On')!.id);
    expect(await db.select('SELECT id FROM book_narrator WHERE book_id = ? AND narrator_id = ? AND deleted_at IS NULL', [book, nid])).toHaveLength(1);
  });
  it('adds a book to a narrator, making it a listen when the latest read is audio', async () => {
    const nid = await createNarrator(db, 'Late Joiner');
    const hooks = await idOf('book', 'title', 'Hooks In'); // up next, no read yet
    await addBookToNarrator(db, nid, hooks);
    let n = (await getNarrator(db, nid))!;
    expect(n.notListened.map((b) => b.title)).toEqual(['Hooks In']);
    expect(n.listens).toEqual([]);
    const egot = await idOf('book', 'title', 'Egotistical Puckboy'); // its read is audio
    await addBookToNarrator(db, nid, egot);
    n = (await getNarrator(db, nid))!;
    expect(n.listens.map((l) => l.title)).toEqual(['Egotistical Puckboy']);
    await removeBookFromNarrator(db, nid, hooks);
    expect((await getNarrator(db, nid))!.notListened).toEqual([]);
  });
});

describe('character and relationship statuses', () => {
  it('stores whether a character is alive, dead, or undead', async () => {
    const id = await idOf('character', 'name', 'Emery Hazard');
    expect((await getCharacter(db, id))!.core.life_status).toBeNull();
    for (const s of ['alive', 'dead', 'undead'] as const) { await updateCharacter(db, id, { life_status: s }); expect((await getCharacter(db, id))!.core.life_status).toBe(s); }
    await updateCharacter(db, id, { life_status: null });
    expect((await getCharacter(db, id))!.core.life_status).toBeNull();
    await expect(updateCharacter(db, id, { life_status: 'zombie' })).rejects.toThrow();
  });
  it('keeps each side of a relationship\'s status separate', async () => {
    const a = await idOf('character', 'name', 'Emery Hazard'); const b = await idOf('character', 'name', 'John-Henry Somerset');
    const relId = await addRelationship(db, a, { id: b }, 'friend', null, 'friend');
    await setRelationshipStatus(db, relId, a, 'estranged'); // the other person, as seen from Emery
    expect((await getCharacter(db, a))!.relationships.find((r) => r.id === relId)!.status).toBe('estranged');
    expect((await getCharacter(db, b))!.relationships.find((r) => r.id === relId)!.status).toBeNull();
    await setRelationshipStatus(db, relId, b, 'deceased');
    expect((await getCharacter(db, b))!.relationships.find((r) => r.id === relId)!.status).toBe('deceased');
    expect((await getCharacter(db, a))!.relationships.find((r) => r.id === relId)!.status).toBe('estranged');
    await setRelationshipStatus(db, relId, a, null);
    expect((await getCharacter(db, a))!.relationships.find((r) => r.id === relId)!.status).toBeNull();
  });
  it('shows whether the other character is alive, dead, or undead beside a linked relationship', async () => {
    const a = await idOf('character', 'name', 'Emery Hazard'); const b = await idOf('character', 'name', 'John-Henry Somerset');
    await updateCharacter(db, b, { life_status: 'undead' });
    expect((await getCharacter(db, a))!.relationships.find((r) => r.other_id === b)!.other_life).toBe('undead');
  });
  it('stores a status on a plain person and keeps it when they become a character', async () => {
    const emery = await idOf('character', 'name', 'Emery Hazard');
    const pid = await addPerson(db, emery, 'Old Friend', 'friend', null, 'friend');
    await setPersonStatus(db, pid, 'deceased');
    expect((await getCharacter(db, emery))!.people.find((p) => p.id === pid)!.status).toBe('deceased');
    const created = await convertPerson(db, pid);
    expect((await getCharacter(db, emery))!.relationships.find((r) => r.other_id === created)).toMatchObject({ label: 'friend', status: 'deceased' });
    await expect(db.execute("UPDATE related_person SET status = 'gone' WHERE id = ?", [pid])).rejects.toThrow();
  });
});

describe('covers', () => {
  it('stores a cover, replaces it, and removes it', async () => {
    const id = await idOf('book', 'title', 'Egotistical Puckboy');
    expect((await getBookLog(db, id))!.cover).toBeNull();
    await setBookCover(db, id, { dataUrl: 'data:image/png;base64,AAA' });
    expect((await getBookLog(db, id))!.cover).toBe('data:image/png;base64,AAA');
    await setBookCover(db, id, { dataUrl: 'data:image/png;base64,BBB' });
    expect((await getBookLog(db, id))!.cover).toBe('data:image/png;base64,BBB');
    expect(await db.select("SELECT id FROM image WHERE file_path LIKE '%AAA' AND deleted_at IS NULL")).toEqual([]);
    await removeBookCover(db, id);
    expect((await getBookLog(db, id))!.cover).toBeNull();
  });
  it('shows the cover on the Calendar', async () => {
    const id = await idOf('book', 'title', 'Bro Doll');
    await setBookCover(db, id, { dataUrl: 'data:image/png;base64,CCC' });
    const month = await getCalendarMonth(db, 2026, 10, '2026-10-20');
    expect(month.finishes.find((f) => f.title === 'Bro Doll')!.cover).toBe('data:image/png;base64,CCC');
    expect(month.finishes.find((f) => f.title === 'Killer Love')!.cover).toBeNull();
  });
  it('shows the cover on a series page', async () => {
    const series = await idOf('series', 'title', 'Puckboys');
    const book = await idOf('book', 'title', 'Egotistical Puckboy');
    await setBookCover(db, book, { dataUrl: 'data:image/png;base64,DDD' });
    expect((await getSeriesPage(db, series))!.books.find((b) => b.id === book)!.cover).toBe('data:image/png;base64,DDD');
  });
});

describe('the Daily Log', () => {
  it('lists the books being read, and a day entry goes onto the chosen one', async () => {
    expect(await listInProgressReads(db)).toEqual([]);
    const a = await createBook(db, { title: 'First Reading', authors: ['A Writer'] });
    const b = await createBook(db, { title: 'Second Reading', authors: ['B Writer'] });
    const ra = (await setStatus(db, a, null, 'reading'))!;
    const rb = (await setStatus(db, b, null, 'reading'))!;
    const list = await listInProgressReads(db);
    expect(list.map((r) => r.title).sort()).toEqual(['First Reading', 'Second Reading']);
    expect(list.find((r) => r.title === 'First Reading')!.authors).toBe('A Writer');
    await saveDayEntry(db, rb, { date: '2026-10-12', percent: 40, text: 'Good start' });
    expect((await getBookLog(db, b))!.entries.map((e) => [e.entry_date, e.position_percent, e.text])).toEqual([['2026-10-12', 40, 'Good start']]);
    expect((await getBookLog(db, a))!.entries).toEqual([]);
    await updateRead(db, ra, { status: 'finished', finish_date: new Date().toLocaleDateString('en-CA') });
    expect((await listInProgressReads(db)).map((r) => r.title)).toEqual(['Second Reading']);
  });
});

describe('migration 6 on an existing database', () => {
  it('gives the authors of existing series to series_author, in order, and keeps the old data', () => {
    const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
    const raw = new DatabaseSync(':memory:');
    const dir = new URL('../src-tauri/migrations/', import.meta.url);
    for (const f of ['0001_initial.sql', '0002_year_number_tiebreak.sql', '0003_tag_colors.sql', '0004_plain_people_and_origin_tags.sql', '0005_bracket_match_winners.sql']) raw.exec(readFileSync(new URL(f, dir), 'utf8'));
    raw.exec(`INSERT INTO author (id, name) VALUES ('a1', 'First'), ('a2', 'Second'); INSERT INTO series (id, title) VALUES ('s1', 'S');
      INSERT INTO book (id, title, series_id) VALUES ('b1', 'One', 's1'), ('b2', 'Two', 's1');
      INSERT INTO book_author (id, book_id, author_id, sort_order) VALUES ('x1', 'b1', 'a2', 0), ('x2', 'b1', 'a1', 1), ('x3', 'b2', 'a1', 0);
      INSERT INTO character (id, name) VALUES ('c1', 'Char'); INSERT INTO related_person (id, character_id, name, rel_type) VALUES ('p1', 'c1', 'Mum', 'family');`);
    raw.exec(readFileSync(new URL('0006_series_authors_and_statuses.sql', dir), 'utf8'));
    const rows = raw.prepare('SELECT author_id, sort_order FROM series_author WHERE series_id = ? ORDER BY sort_order').all('s1') as { author_id: string; sort_order: number }[];
    expect(rows.map((r) => [r.author_id, r.sort_order])).toEqual([['a2', 0], ['a1', 1]]);
    expect((raw.prepare("SELECT name, status FROM related_person WHERE id = 'p1'").get() as { name: string; status: string | null })).toEqual({ name: 'Mum', status: null });
  });
});

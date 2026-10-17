import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { applyNotionPlan } from '../src/import/apply';
import { applyNotionCharacters } from '../src/import/applyCharacters';
import { planNotionBooks } from '../src/import/notion';
import { planNotionCharacters } from '../src/import/notionCharacters';
import { addTag, createRead, deleteDayEntry, getBookLog, listItems, listTagOptions, quickAdd, removeTag, renameTag, saveDayEntry, setNarratorAccent, setNarratorRating, setStatus, updateBook, updateRead } from '../src/repo/bookLog';

const read = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');
let db: Db;
const idOf = async (title: string) => (await db.select<{ id: string }>('SELECT id FROM book WHERE title = ?', [title]))[0].id;

beforeEach(async () => {
  db = migrateNodeDb();
  await applyNotionPlan(db, planNotionBooks(read('book-tracker.csv')), { tagDestinations: { hockey: 'genre', sports: 'genre', royalty: 'trope' } });
  await applyNotionCharacters(db, planNotionCharacters(read('characters.csv')));
});

describe('loading a Book Log', () => {
  it('brings everything about a book together', async () => {
    const log = (await getBookLog(db, await idOf('Egotistical Puckboy')))!;
    expect(log.authors.map((a) => a.name)).toEqual(['Eden Finley', 'Saxon James']);
    expect(log.series?.title).toBe('Puckboys');
    expect(log.genres.map((g) => g.name)).toEqual(['hockey', 'sports']);
    expect(log.reads).toHaveLength(1);
    expect(log.read).toMatchObject({ status: 'finished', finish_date: '2025-07-27', format: 'audio', year_number: 2 });
    expect(log.narrators.map((n) => n.name)).toEqual(['Alexander Cendese', 'Iggy Toma']);
    expect(log.characters.length).toBeGreaterThan(0);
    expect(log.characters.every((c) => c.role === 'main' || c.role === 'side')).toBe(true);
  });
  it('gives the makeup and a partner for main characters', async () => {
    const bookId = await idOf('Bro Doll');
    // make the two main characters men and partners to check the derived values
    await db.execute("UPDATE character SET gender = 'male' WHERE id IN (SELECT character_id FROM book_character WHERE book_id = ? AND role = 'main')", [bookId]);
    const log = (await getBookLog(db, bookId))!;
    expect(log.makeup).toBe('M'.repeat(log.characters.filter((c) => c.role === 'main').length));
  });
  it('returns null for an unknown book', async () => {
    expect(await getBookLog(db, 'nope')).toBeNull();
  });
});

describe('status and reads', () => {
  it('starts an Up Next book: makes a read, clears the shelf, fills the start date', async () => {
    const id = await idOf('Hooks In');
    const readId = await setStatus(db, id, null, 'reading');
    const log = (await getBookLog(db, id, readId))!;
    expect(log.book.shelf).toBeNull();
    expect(log.read).toMatchObject({ status: 'reading' });
    expect(log.read?.start_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('finishing fills in the date and the time', async () => {
    const id = await idOf('Ronan');
    const readId = (await setStatus(db, id, null, 'reading'))!;
    await setStatus(db, id, readId, 'finished');
    const log = (await getBookLog(db, id, readId))!;
    expect(log.read?.status).toBe('finished');
    expect(log.read?.finish_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(log.read?.finish_time).toMatch(/^\d{2}:\d{2}$/);
  });
  it('moves a book between TBR and Up Next without touching its reads', async () => {
    const id = await idOf('Entree to Murder');
    await setStatus(db, id, null, 'up_next');
    expect((await getBookLog(db, id))!.book.shelf).toBe('up_next');
  });
  it('a re-read is a new read with the book narrators as the starting point', async () => {
    const id = await idOf('Egotistical Puckboy');
    const second = await createRead(db, id);
    const log = (await getBookLog(db, id, second))!;
    expect(log.reads).toHaveLength(2);
    expect(log.narrators.map((n) => n.name)).toEqual(['Alexander Cendese', 'Iggy Toma']);
  });
  it('edits ratings, formats, and ignores columns it should not touch', async () => {
    const id = await idOf('Egotistical Puckboy');
    const log0 = (await getBookLog(db, id))!;
    await updateRead(db, log0.read!.id, { rating: 17, format: 'ebook', deleted_at: 'x' });
    await updateBook(db, id, { heat_level: 3, pov: 'dual', deleted_at: 'x' });
    const log = (await getBookLog(db, id))!;
    expect(log.read).toMatchObject({ rating: 17, format: 'ebook' });
    expect(log.book).toMatchObject({ heat_level: 3, pov: 'dual' });
  });
});

describe('tags, narrators, day log, places', () => {
  it('adds a tag once and removes it', async () => {
    const id = await idOf('Egotistical Puckboy');
    await addTag(db, id, 'trope', 'Slow burn');
    await addTag(db, id, 'trope', 'slow burn');
    let log = (await getBookLog(db, id))!;
    expect(log.tropes.map((t) => t.name)).toEqual(['Slow burn']);
    await removeTag(db, id, 'trope', log.tropes[0].id);
    log = (await getBookLog(db, id))!;
    expect(log.tropes).toEqual([]);
    await addTag(db, id, 'trope', 'Slow burn'); // can be added back
    expect((await getBookLog(db, id))!.tropes).toHaveLength(1);
  });
  it('rates a narrator and sets an accent, reusing accents by name', async () => {
    const id = await idOf('Egotistical Puckboy');
    const log = (await getBookLog(db, id))!;
    await setNarratorRating(db, log.narrators[0].id, 'up');
    await setNarratorAccent(db, log.narrators[0].id, 'General NA');
    await setNarratorAccent(db, log.narrators[1].id, 'general na');
    const after = (await getBookLog(db, id))!;
    expect(after.narrators.map((n) => [n.rating, n.accent])).toEqual([['up', 'General NA'], [null, 'General NA']]);
    expect(await listItems(db, 'accent')).toHaveLength(1);
  });
  it('saves, replaces, and deletes a day entry', async () => {
    const id = await idOf('Egotistical Puckboy');
    const readId = (await getBookLog(db, id))!.read!.id;
    await saveDayEntry(db, readId, { date: '2025-07-26', percent: 40 });
    await saveDayEntry(db, readId, { date: '2025-07-26', percent: 55, text: 'Good' });
    let log = (await getBookLog(db, id))!;
    expect(log.entries).toHaveLength(1);
    expect(log.entries[0]).toMatchObject({ position_percent: 55, text: 'Good' });
    await deleteDayEntry(db, log.entries[0].id);
    await saveDayEntry(db, readId, { date: '2025-07-26', page: 120 });
    log = (await getBookLog(db, id))!;
    expect(log.entries).toHaveLength(1);
    expect(log.entries[0].position_page).toBe(120);
  });
  it('a book can have several settings', async () => {
    const id = await idOf('Egotistical Puckboy');
    await addTag(db, id, 'place', 'New York');
    await addTag(db, id, 'place', 'Boston');
    await addTag(db, id, 'place', 'new york');
    expect((await getBookLog(db, id))!.places.map((p) => p.name)).toEqual(['New York', 'Boston']);
    const ny = (await getBookLog(db, id))!.places[0].id;
    await removeTag(db, id, 'place', ny);
    expect((await getBookLog(db, id))!.places.map((p) => p.name)).toEqual(['Boston']);
  });
});

describe('quick add', () => {
  it('adds a TBR book without a read, and a reading book with one', async () => {
    const a = await quickAdd(db, { title: 'Mine to Protect', authors: ['E.V. Olsen'], status: 'tbr' });
    expect(a.readId).toBeNull();
    expect((await getBookLog(db, a.bookId))!.book.shelf).toBe('tbr');
    const b = await quickAdd(db, { title: 'His to Break', authors: ['E.V. Olsen'], status: 'reading' });
    expect(b.readId).not.toBeNull();
    expect((await db.select('SELECT id FROM author WHERE name = ?', ['E.V. Olsen']))).toHaveLength(1);
  });
  it('rejects an empty title', async () => {
    await expect(quickAdd(db, { title: '  ', authors: [], status: 'tbr' })).rejects.toThrow();
  });
});

import { listJournalYear } from '../src/repo/journal';

describe('the yearly Book List data', () => {
  it('splits into finished, reading, and Up Next', async () => {
    const y = await listJournalYear(db, 2026);
    expect(y.finished.map((r) => r.title)).toEqual(['Corner Office', 'Murder at Pirate’s Cove', 'Killer Love', 'MateHub: Legend', 'Bro Doll']);
    expect(y.upNext.map((r) => r.title)).toEqual(['Hooks In', '68 Whiskey', 'Ronan']);
    expect(y.reading).toEqual([]);
    const matehub = y.finished.find((r) => r.title === 'MateHub: Legend')!;
    expect(matehub).toMatchObject({ authors: 'Marie Reynard', narrators: 'Harley Chase, Zachary Zaba', series: 'MateHub', format: 'audio' });
  });
  it('moves a book from Up Next to reading to finished', async () => {
    const id = await idOf('Ronan');
    const readId = await setStatus(db, id, null, 'reading');
    let y = await listJournalYear(db, 2026);
    expect(y.upNext.map((r) => r.title)).toEqual(['Hooks In', '68 Whiskey']);
    expect(y.reading.map((r) => r.title)).toEqual(['Ronan']);
    await setStatus(db, id, readId, 'finished');
    y = await listJournalYear(db, new Date().getFullYear());
    expect(y.reading).toEqual([]);
    expect(y.finished.map((r) => r.title)).toContain('Ronan');
  });
  it('lists a paused book under reading', async () => {
    const id = await idOf('Hooks In');
    const readId = await setStatus(db, id, null, 'reading');
    await setStatus(db, id, readId, 'on_hold');
    expect((await listJournalYear(db, 2026)).reading[0]).toMatchObject({ title: 'Hooks In', status: 'on_hold' });
  });
});

describe('tag colors and renaming', () => {
  it('gives every tag a color, including ones created later', async () => {
    const id = await idOf('Egotistical Puckboy');
    await addTag(db, id, 'trope', 'Slow burn');
    for (const t of ['genre', 'theme', 'trope'] as const) {
      for (const o of await listTagOptions(db, t)) expect(o.color, `${t} ${o.name}`).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect((await listTagOptions(db, 'trope')).length).toBeGreaterThan(0);
  });
  it('renames a tag everywhere, including a change of capital letter', async () => {
    const id = await idOf('Egotistical Puckboy');
    const sports = (await getBookLog(db, id))!.genres.find((g) => g.name === 'sports')!;
    await renameTag(db, 'genre', sports.id, 'Sports');
    expect((await getBookLog(db, id))!.genres.map((g) => g.name)).toContain('Sports');
    const other = await idOf('Irresponsible Puckboy');
    expect((await getBookLog(db, other))!.genres.map((g) => g.name)).toContain('Sports');
  });
  it('refuses an empty name or one that already exists', async () => {
    const opts = await listTagOptions(db, 'genre');
    await expect(renameTag(db, 'genre', opts[0].id, '  ')).rejects.toThrow();
    await expect(renameTag(db, 'genre', opts[0].id, opts[1].name.toUpperCase())).rejects.toThrow(/already/);
  });
});

import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { applyNotionPlan, undoImport } from '../src/import/apply';
import { parseCsv } from '../src/import/csv';
import { parseNotionDate, parseRelation, planNotionBooks, splitOrigin, type TagDestination } from '../src/import/notion';
import { listBookList } from '../src/repo/books';

const csv = readFileSync(new URL('./fixtures/book-tracker.csv', import.meta.url), 'utf8');
const dest: Record<string, TagDestination> = { sadenverse: 'universe', hockey: 'genre', sports: 'genre', soccer: 'genre', ya: 'genre', royalty: 'trope', 'religious-trauma': 'theme' };
const count = async (db: Db, sql: string) => Number((await db.select<{ n: number }>(sql))[0].n);

describe('parsing pieces', () => {
  it('reads quoted CSV with commas, quotes and a byte-order mark', () => {
    expect(parseCsv('\ufeffa,b\r\n"x, y","say ""hi"""\r\n')).toEqual([['a', 'b'], ['x, y', 'say "hi"']]);
  });
  it('reads Notion dates and ranges', () => {
    expect(parseNotionDate('July 21, 2025')).toEqual({ start: null, finish: '2025-07-21' });
    expect(parseNotionDate('July 21, 2025 → July 24, 2025')).toEqual({ start: '2025-07-21', finish: '2025-07-24' });
    expect(parseNotionDate('2025-07-21')?.finish).toBe('2025-07-21');
    expect(parseNotionDate('not a date')).toBeNull();
    expect(parseNotionDate('')).toBeNull();
  });
  it('splits origin suffixes', () => {
    expect(splitOrigin('Reid (DOLL)')).toEqual({ name: 'Reid', origin: 'DOLL' });
    expect(splitOrigin('Cade Buckingham')).toEqual({ name: 'Cade Buckingham', origin: null });
  });
  it('reads relation cells with links and with plain names', () => {
    const [a, b, c] = parseRelation('Greg (Prince) (https://app.notion.com/p/Greg-Prince-2dea5851070680d1a7b4cc2d83eb2532?pvs=21), Ty Roscoe (https://app.notion.com/p/Ty-3f3a5851070680589cffc7dd222d6633?pvs=21), Plain Name');
    expect(a).toMatchObject({ name: 'Greg', origin: 'Prince', notionId: '2dea5851070680d1a7b4cc2d83eb2532' });
    expect(b).toMatchObject({ name: 'Ty Roscoe', origin: null });
    expect(c).toMatchObject({ name: 'Plain Name', notionId: null });
  });
});

describe('planning your real file', () => {
  const plan = planNotionBooks(csv);
  it('reads every row and maps formats', () => {
    expect(plan.rows).toHaveLength(15);
    const by = (f: string) => plan.rows.filter((r) => r.format === f).length;
    expect([by('audio'), by('ebook'), by('physical')]).toEqual([10, 3, 2]);
  });
  it('turns books without a date into shelf items and drops the tbr tag', () => {
    const shelf = Object.fromEntries(plan.rows.filter((r) => r.shelf).map((r) => [r.title, r.shelf]));
    expect(shelf).toEqual({ 'Entree to Murder': 'tbr', 'Hooks In': 'up_next', '68 Whiskey': 'up_next', Ronan: 'up_next' });
    expect(plan.tags.map((t) => t.tag.toLowerCase())).not.toContain('tbr');
  });
  it('reads multiple authors, narrators, and characters with origins', () => {
    const puck = plan.rows.find((r) => r.title === 'Egotistical Puckboy')!;
    expect(puck.authors).toEqual(['Eden Finley', 'Saxon James']);
    expect(puck.narrators).toEqual(['Alexander Cendese', 'Iggy Toma']);
    const doll = plan.rows.find((r) => r.title === 'Bro Doll')!;
    expect(doll.main.find((c) => c.rawName === 'Reid (DOLL)')).toMatchObject({ name: 'Reid', origin: 'DOLL' });
    const total = plan.rows.reduce((n, r) => n + r.main.length + r.side.length, 0);
    expect(total).toBe(34);
  });
  it('warns about the 2024 date among 2025 entries and suggests tag destinations', () => {
    const w = plan.warnings.filter((x) => x.kind === 'date_sequence');
    expect(w.map((x) => x.title)).toEqual(['Theoretically Straight']);
    expect(plan.tags.find((t) => t.tag === 'sadenverse')?.suggested).toBe('universe');
  });
});

describe('applying the import', () => {
  let db: Db;
  beforeEach(() => { db = migrateNodeDb(); });
  const plan = planNotionBooks(csv);

  it('creates the books, reads, people, universe, and shelf items', async () => {
    const r = await applyNotionPlan(db, plan, { tagDestinations: dest });
    expect(r).toMatchObject({ booksCreated: 15, booksReused: 0, readsCreated: 11, universesCreated: 1, charactersCreated: 34 });
    expect(await count(db, "SELECT count(*) AS n FROM book WHERE shelf = 'up_next'")).toBe(3);
    expect(await count(db, "SELECT count(*) AS n FROM book WHERE shelf = 'tbr'")).toBe(1);
    // Puckboys joins the Sadenverse universe through its series.
    const [u] = await db.select<{ name: string }>("SELECT u.name AS name FROM series s JOIN universe u ON u.id = s.universe_id WHERE s.title = 'Puckboys'");
    expect(u.name).toBe('Sadenverse');
    expect(await count(db, "SELECT count(*) AS n FROM trope")).toBe(1); // royalty
    expect(await count(db, "SELECT count(*) AS n FROM genre")).toBe(4); // hockey, sports, soccer, ya
  });
  it('shows the books in the yearly Book List, newest first', async () => {
    await applyNotionPlan(db, plan, { tagDestinations: dest });
    const y2026 = await listBookList(db, 2026);
    expect(y2026.map((x) => x.title)).toEqual(['Corner Office', 'Murder at Pirate’s Cove', 'Killer Love', 'MateHub: Legend', 'Bro Doll']);
    expect(y2026.find((x) => x.title === 'MateHub: Legend')?.authors).toBe('Marie Reynard');
    expect((await listBookList(db, 2025)).map((x) => x.title)).toEqual(['Hush', 'The Boyfriend Subscription', 'Irresponsible Puckboy', 'Egotistical Puckboy', 'The Prince and the Player']);
  });
  it('keeps both narrators on the book and on the read, and the note on the read', async () => {
    await applyNotionPlan(db, plan, { tagDestinations: dest });
    const rows = await db.select<{ n: string }>("SELECT n.name AS n FROM read_narrator rn JOIN read r ON r.id = rn.read_id JOIN book b ON b.id = r.book_id JOIN narrator n ON n.id = rn.narrator_id WHERE b.title = 'MateHub: Legend' ORDER BY rn.sort_order");
    expect(rows.map((x) => x.n)).toEqual(['Harley Chase', 'Zachary Zaba']);
    const [note] = await db.select<{ notes: string }>("SELECT r.notes AS notes FROM read r JOIN book b ON b.id = r.book_id WHERE b.title = 'The Boyfriend Subscription'");
    expect(note.notes).toBe('Pretty Woman retelling');
  });
  it('rotates calendar colors in finish order', async () => {
    await applyNotionPlan(db, plan, { tagDestinations: dest });
    const rows = await db.select<{ t: string; c: number }>("SELECT b.title AS t, r.color_index AS c FROM read r JOIN book b ON b.id = r.book_id ORDER BY r.finish_date");
    expect(rows.map((x) => x.c)).toEqual([...Array(11).keys()].map((i) => i % 10));
    expect(rows[0].t).toBe('Theoretically Straight'); // the 2024-dated row sorts first
  });
  it('keeps the name clean and turns the note in parentheses into a tag', async () => {
    await applyNotionPlan(db, plan, { tagDestinations: dest });
    const [reid] = await db.select<{ name: string; tag: string }>("SELECT c.name AS name, t.name AS tag FROM character c JOIN character_tag_link l ON l.character_id = c.id JOIN character_tag t ON t.id = l.character_tag_id WHERE c.name = 'Reid'");
    expect(reid).toEqual({ name: 'Reid', tag: 'DOLL' });
    expect(await count(db, "SELECT count(*) AS n FROM character WHERE name LIKE '%(%'")).toBe(0);
    expect(await count(db, 'SELECT count(*) AS n FROM character WHERE is_featured = 0')).toBe(0);
  });
  it('adds nothing the second time', async () => {
    await applyNotionPlan(db, plan, { tagDestinations: dest });
    const again = await applyNotionPlan(db, plan, { tagDestinations: dest });
    expect(again).toMatchObject({ booksCreated: 0, booksReused: 15, readsCreated: 0, charactersCreated: 0, authorsCreated: 0 });
    expect(await count(db, 'SELECT count(*) AS n FROM book WHERE deleted_at IS NULL')).toBe(15);
  });
  it('can be undone completely, and re-imported afterwards', async () => {
    const r = await applyNotionPlan(db, plan, { tagDestinations: dest });
    expect(await undoImport(db, r.batchId)).toBeGreaterThan(100);
    expect(await count(db, 'SELECT count(*) AS n FROM book WHERE deleted_at IS NULL')).toBe(0);
    expect(await listBookList(db, 2026)).toHaveLength(0);
    const again = await applyNotionPlan(db, plan, { tagDestinations: dest });
    expect(again.booksCreated).toBe(15);
  });
  it('leaves unsorted tags out instead of guessing', async () => {
    await applyNotionPlan(db, plan, { tagDestinations: {} });
    expect(await count(db, 'SELECT count(*) AS n FROM trope')).toBe(0);
    expect(await count(db, 'SELECT count(*) AS n FROM universe')).toBe(0);
  });
});

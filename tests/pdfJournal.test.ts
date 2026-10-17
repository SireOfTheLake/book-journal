import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { applyNotionPlan } from '../src/import/apply';
import { planNotionBooks } from '../src/import/notion';
import { applyPdfJournal, parseTranscription, planPdfJournal, type PdfChoices } from '../src/import/pdfJournal';
import { undoImport } from '../src/import/writer';
import { getBookLog } from '../src/repo/bookLog';

const sample = readFileSync(new URL('./fixtures/journal-2026-sample.json', import.meta.url), 'utf8');
const choices = (over: Partial<PdfChoices> = {}): PdfChoices => ({ skip: new Set(), notes: new Map(), finished: new Map(), ...over });
let db: Db;
beforeEach(() => { db = migrateNodeDb(); });
const one = async <T,>(sql: string, p: (string | number)[] = []) => (await db.select<T>(sql, p))[0];

describe('reading the transcription file', () => {
  it('reads the 21 sample pages and turns stars into quarter-star ratings', () => {
    const t = parseTranscription(sample);
    expect(t.entries).toHaveLength(21);
    expect(t.entries[0]).toMatchObject({ title: '(Never) Feed the Crows', stars: 3.5, series: { name: "Corvin's Crows", position: 1, total: null } });
    expect(t.entries[1].series!.position).toBe(3.5);
    expect(t.entries[1].category).toBeNull(); // "N/A" is blank
  });
  it('rejects a file that is not a transcription, and bad dates are left out with a warning', () => {
    expect(() => parseTranscription('{nope')).toThrow(/not a journal transcription/);
    expect(() => parseTranscription('{"entries": []}')).toThrow(/not a journal transcription/);
    const t = parseTranscription(JSON.stringify({ format: 'book-journal-pdf-transcription', entries: [{ title: 'X', authors: ['A'], finished: '07/21/26' }, { authors: ['B'] }] }));
    expect(t.entries).toHaveLength(1);
    expect(t.entries[0].finished).toBeNull();
    expect(t.warnings).toHaveLength(2);
  });
});

describe('importing into an empty journal', () => {
  it('creates books, reads, notes, narrators, settings and characters', async () => {
    const plan = await planPdfJournal(db, parseTranscription(sample));
    expect(plan.entries.every((p) => p.kind === 'new-book')).toBe(true);
    const r = await applyPdfJournal(db, plan, choices({ finished: new Map([[11, '2026-08-01']]) }));
    expect(r).toMatchObject({ booksCreated: 21, readsCreated: 21, notesAdded: 21 });
    const id = (await one<{ id: string }>("SELECT id FROM book WHERE title = 'Stupid Dirty'")).id;
    const log = (await getBookLog(db, id))!;
    expect(log.read).toMatchObject({ rating: 18, format: 'audio', audio_length_seconds: 597 * 60, start_date: '2026-07-26', finish_date: '2026-07-27' });
    expect(log.read!.notes).toContain('therapy');
    expect(log.narrators.map((n) => [n.name, n.accent, n.rating])).toEqual([['Alexander Cendese', 'Southern', 'up'], ['Max Meyers', 'General NA', 'up']]);
    expect(log.series).toMatchObject({ title: 'Possum Hollow', total_books: 4 });
    expect(log.characters.map((c) => [c.name, c.role])).toEqual([['Silas Rush', 'main'], ['Cade Waters', 'main']]);
    expect(log.genres.map((g) => g.name)).toEqual(['Romance']);
    const kindle = (await getBookLog(db, (await one<{ id: string }>("SELECT id FROM book WHERE title = 'Wanting More'")).id))!;
    expect(kindle.places.map((p) => p.name)).toEqual(['USA']);
    const cat = await one<{ name: string; prompt: string | null }>("SELECT c.name AS name, r.prompt AS prompt FROM read r JOIN category c ON c.id = r.category_id JOIN book b ON b.id = r.book_id WHERE b.title = 'Stupid Dirty'");
    expect(cat).toEqual({ name: 'Treat', prompt: 'Listen to an Audiobook Narrated by one of your fave Voice Actors' });
  });

  it('keeps challenge details as hidden text, and only Treat, TBR and Next in Series become categories', async () => {
    await applyPdfJournal(db, await planPdfJournal(db, parseTranscription(sample)), choices({ finished: new Map([[11, '2026-08-01']]) }));
    const read = (t: string) => one<Record<string, string | null>>('SELECT r.legacy_category, r.legacy_challenge, r.legacy_prompt, r.legacy_slot, c.name AS cat, r.prompt FROM read r JOIN book b ON b.id = r.book_id LEFT JOIN category c ON c.id = r.category_id WHERE b.title = ?', [t]);
    expect(await read('Glory Troll')).toMatchObject({ legacy_category: 'Monster Mash', legacy_challenge: 'Monster Mash', legacy_slot: 'Troll', cat: null, prompt: null });
    expect(await read('Damaged')).toMatchObject({ cat: 'Next in Series', legacy_challenge: 'Word Soup', legacy_slot: 'D', prompt: null });
    expect(await read('The Pretty Boy vs. The Bad Boy')).toMatchObject({ cat: 'TBR', legacy_slot: 'Car' });
    expect(await read('Ignite')).toMatchObject({ cat: null, legacy_category: '2026 MM Romance Challenge', legacy_prompt: 'MC works in CIA, FBI, or private security' });
  });

  it('leaves out a finish date that is before the start unless it is corrected', async () => {
    const plan = await planPdfJournal(db, parseTranscription(sample));
    const ignite = plan.entries.find((p) => p.entry.title === 'Ignite')!;
    expect(ignite.problems.join(' ')).toMatch(/before started/);
    await applyPdfJournal(db, plan, choices({ skip: new Set(plan.entries.filter((p) => p !== ignite).map((p) => p.index)) }));
    expect(await one("SELECT finish_date FROM read")).toEqual({ finish_date: null });
  });

  it('can be undone, and importing twice adds nothing', async () => {
    const c = choices({ finished: new Map([[11, '2026-08-01']]) });
    const first = await applyPdfJournal(db, await planPdfJournal(db, parseTranscription(sample)), c);
    const again = await planPdfJournal(db, parseTranscription(sample));
    expect(again.entries.filter((p) => p.kind === 'match')).toHaveLength(21); // Ignite is found again by its start date
    const second = await applyPdfJournal(db, again, c);
    expect(second.readsCreated).toBe(0);
    expect(second.booksCreated).toBe(0);
    expect(second.notesAdded + second.notesAppended).toBe(0);
    await undoImport(db, second.batchId);
    await undoImport(db, first.batchId);
    expect((await one<{ n: number }>('SELECT count(*) AS n FROM book WHERE deleted_at IS NULL')).n).toBe(0);
    expect((await one<{ n: number }>('SELECT count(*) AS n FROM read WHERE deleted_at IS NULL')).n).toBe(0);
  });
});

describe('importing into a journal that already has the books', () => {
  const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
  async function seed(notes: string | null, finish = '2026-07-26') {
    const csv = ['Name,Author,Date Finished,Format,Notes', `Stupid Dirty,Erin Russell,"${finish}",Audio,${notes ?? ''}`].join('\n');
    void csv; void fixture; void applyNotionPlan; void planNotionBooks;
    const bid = 'b1', rid = 'r1';
    await db.execute("INSERT INTO book (id, title) VALUES (?, 'Stupid Dirty')", [bid]);
    await db.execute("INSERT INTO author (id, name) VALUES ('a1', 'Erin Russell')");
    await db.execute("INSERT INTO book_author (id, book_id, author_id, sort_order) VALUES ('ba1', ?, 'a1', 0)", [bid]);
    await db.execute("INSERT INTO read (id, book_id, status, finish_date, notes, rating) VALUES (?, ?, 'finished', ?, ?, 20)", [rid, bid, finish, notes]);
  }
  const only = (plan: Awaited<ReturnType<typeof planPdfJournal>>, title: string) => new Set(plan.entries.filter((p) => p.entry.title !== title).map((p) => p.index));

  it('fills empty notes and leaves the rest of what is there alone', async () => {
    await seed(null);
    const plan = await planPdfJournal(db, parseTranscription(sample));
    const p = plan.entries.find((x) => x.entry.title === 'Stupid Dirty')!;
    expect(p).toMatchObject({ kind: 'match', notes: 'set', readId: 'r1', dateDiffers: '2026-07-26' });
    const r = await applyPdfJournal(db, plan, choices({ skip: only(plan, 'Stupid Dirty') }));
    expect(r).toMatchObject({ booksCreated: 0, booksMatched: 1, readsUpdated: 1, notesAdded: 1 });
    const read = await one<Record<string, string | number | null>>("SELECT notes, rating, finish_date, source_id, audio_length_seconds FROM read WHERE id = 'r1'");
    expect(String(read.notes)).toContain('therapy');
    expect(read.rating).toBe(20); // the rating already there is not changed
    expect(read.finish_date).toBe('2026-07-26'); // matched by closeness, so its dates stay
    expect(read.audio_length_seconds).toBe(597 * 60);
    expect((await getBookLog(db, 'b1'))!.narrators).toHaveLength(2);
  });

  it('appends, replaces, or keeps different notes as chosen', async () => {
    for (const [choice, expected] of [['append', 'My own note\n\nThere\'s something'], ['replace', 'There\'s something'], ['keep', 'My own note']] as const) {
      db = migrateNodeDb();
      await seed('My own note', '2026-07-27');
      const plan = await planPdfJournal(db, parseTranscription(sample));
      const p = plan.entries.find((x) => x.entry.title === 'Stupid Dirty')!;
      expect(p).toMatchObject({ kind: 'match', notes: 'append', dateDiffers: null });
      await applyPdfJournal(db, plan, choices({ skip: only(plan, 'Stupid Dirty'), notes: new Map([[p.index, choice]]) }));
      const notes = String((await one<{ notes: string }>("SELECT notes FROM read WHERE id = 'r1'")).notes);
      expect(notes.startsWith(expected)).toBe(true);
      if (choice === 'keep') expect(notes).toBe('My own note');
    }
  });

  it('undo puts back what it filled in', async () => {
    await seed('Mine', '2026-07-27');
    const plan = await planPdfJournal(db, parseTranscription(sample));
    const p = plan.entries.find((x) => x.entry.title === 'Stupid Dirty')!;
    const r = await applyPdfJournal(db, plan, choices({ skip: only(plan, 'Stupid Dirty'), notes: new Map([[p.index, 'replace']]) }));
    expect(String((await one<{ notes: string }>("SELECT notes FROM read WHERE id = 'r1'")).notes)).toContain('therapy');
    await undoImport(db, r.batchId);
    expect(await one("SELECT notes, source_id, legacy_slot FROM read WHERE id = 'r1'")).toEqual({ notes: 'Mine', source_id: null, legacy_slot: null });
  });
});

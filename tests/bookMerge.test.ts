import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { combineText, normalizeTitle, titleSimilarity } from '../src/domain/bookMerge';
import { createBook } from '../src/repo/books';
import { setStatus, addTag, createRead, getBookLog, setBookCover, updateBook, updateRead, deleteBook } from '../src/repo/bookLog';
import { addCharacterToBook, createCharacter } from '../src/repo/characters';
import { createGrid, fillSlot, getChallenge } from '../src/repo/challenges';
import { listMergeCandidates, mergeBooks, planMerge } from '../src/repo/bookMerge';

let db: Db;
beforeEach(() => { db = migrateNodeDb(); });

describe('similar titles', () => {
  it('ignores case, punctuation, "The" and bracketed bits', () => {
    expect(normalizeTitle('The Name of the Wind (Book 1)')).toBe('name of the wind');
    expect(titleSimilarity('Dune', 'dune!')).toBe(1);
    expect(titleSimilarity('The Hobbit', 'Hobbit, The'.replace(', The', ''))).toBe(1);
    expect(titleSimilarity('Dune: Deluxe Edition', 'Dune')).toBeGreaterThanOrEqual(0.95);
    expect(titleSimilarity('A Court of Thorns and Roses', 'Court of Thorns and Roses')).toBe(1);
    expect(titleSimilarity('Harry Potter and the Sorcerer\'s Stone', 'Harry Potter and the Philosopher\'s Stone')).toBeGreaterThan(0.72);
    expect(titleSimilarity('Dune', 'Emma')).toBeLessThan(0.5);
    expect(titleSimilarity('', 'Emma')).toBe(0);
  });
  it('combines text without repeating it', () => {
    expect(combineText('One', 'Two')).toBe('One\n\nTwo');
    expect(combineText('One two', 'One')).toBe('One two');
    expect(combineText(null, 'Two')).toBe('Two');
    expect(combineText('  ', null)).toBeNull();
  });
  it('lists the books to merge with, the most alike first', async () => {
    const me = await createBook(db, { title: 'Dune', authors: ['Frank Herbert'] });
    const same = await createBook(db, { title: 'DUNE', authors: ['F. Herbert'] });
    const near = await createBook(db, { title: 'Dune Messiah' });
    await createBook(db, { title: 'Pride and Prejudice' });
    const c = await listMergeCandidates(db, me);
    expect(c.similar.map((x) => x.id)).toEqual([same, near]);
    expect(c.similar[0].same).toBe(true);
    expect(c.similar[0].authors).toBe('F. Herbert');
    expect(c.all).toHaveLength(3);
    await expect(listMergeCandidates(db, 'nope')).rejects.toThrow('could not be found');
  });
});

async function pair() {
  const a = await createBook(db, { title: 'Dune', authors: ['Frank Herbert'] });
  const b = await createBook(db, { title: 'Dune (Deluxe)', authors: ['Frank Herbert', 'Brian Herbert'] });
  return { a, b };
}

describe('planning a merge', () => {
  it('says what is the same, filled in, kept, and what needs a decision', async () => {
    const { a, b } = await pair();
    await updateBook(db, a, { page_count: 400, synopsis: 'Sand.', pov: 'single' });
    await updateBook(db, b, { page_count: 412, synopsis: 'Spice.', heat_level: 2, pov: 'single' });
    const p = await planMerge(db, a, b);
    const st = (k: string) => p.fields.find((f) => f.key === k)?.state;
    expect(st('title')).toBe('conflict');
    expect(st('page_count')).toBe('conflict');
    expect(st('synopsis')).toBe('conflict');
    expect(p.fields.find((f) => f.key === 'synopsis')!.text).toBe(true);
    expect(st('pov')).toBe('same');
    expect(st('heat_level')).toBe('only_b');
    expect(st('perspective')).toBeUndefined(); // blank in both: not shown
    expect(p.adds).toEqual([{ label: 'Authors', names: ['Brian Herbert'] }]);
    expect(p.a.authors).toBe('Frank Herbert');
  });
  it('refuses the same book twice and blank randomizer books', async () => {
    const { a } = await pair();
    await expect(planMerge(db, a, a)).rejects.toThrow('different book');
    await expect(planMerge(db, a, 'nope')).rejects.toThrow('could not be found');
  });
});

describe('merging', () => {
  it('needs a decision for every difference, and only text can be combined', async () => {
    const { a, b } = await pair();
    await updateBook(db, a, { page_count: 400, synopsis: 'Sand.' });
    await updateBook(db, b, { page_count: 412, synopsis: 'Spice.' });
    await expect(mergeBooks(db, a, b, {})).rejects.toThrow('Choose which');
    await expect(mergeBooks(db, a, b, { title: 'a', page_count: 'both', synopsis: 'a' })).rejects.toThrow('cannot be combined');
    expect((await getBookLog(db, b))).not.toBeNull();
  });
  it('applies the picks, fills the blanks, combines text, and removes the other book', async () => {
    const { a, b } = await pair();
    await updateBook(db, a, { page_count: 400, synopsis: 'Sand.', is_favorite: 0 });
    await updateBook(db, b, { page_count: 412, synopsis: 'Spice.', heat_level: 2, is_favorite: 1, original_publication_date: '1965' });
    await mergeBooks(db, a, b, { title: 'a', page_count: 'b', synopsis: 'both' });
    const log = (await getBookLog(db, a))!;
    expect(log.book.title).toBe('Dune');
    expect(log.book.page_count).toBe(412);
    expect(log.book.synopsis).toBe('Sand.\n\nSpice.');
    expect(log.book.heat_level).toBe(2);
    expect(log.book.original_publication_date).toBe('1965');
    expect(log.book.is_favorite).toBe(1);
    expect(log.authors.map((x) => x.name).sort()).toEqual(['Brian Herbert', 'Frank Herbert']);
    expect(await getBookLog(db, b)).toBeNull();
  });
  it('moves every read (and its challenge pick) over, and merges tags, characters and the cover', async () => {
    const { a, b } = await pair();
    const ra = await createRead(db, a, 'finished'); await updateRead(db, ra, { finish_date: '2026-02-01' });
    const rb = await createRead(db, b, 'finished'); await updateRead(db, rb, { finish_date: '2026-05-01', notes: 'Loved it' });
    const g = await createGrid(db, { year: 2026, name: 'G', prompts: ['p1'] });
    await fillSlot(db, (await getChallenge(db, g))!.loose[0].id, rb);
    await addTag(db, a, 'genre', 'Sci-fi'); await addTag(db, b, 'genre', 'Sci-fi'); await addTag(db, b, 'trope', 'Chosen one');
    await addTag(db, b, 'place', 'Arrakis');
    const c = await createCharacter(db, 'Paul');
    await addCharacterToBook(db, c, a, 'side'); await addCharacterToBook(db, c, b, 'main');
    await setBookCover(db, b, { dataUrl: 'data:image/png;base64,B' });
    await mergeBooks(db, a, b, { title: 'a' });
    const log = (await getBookLog(db, a))!;
    expect(log.reads).toHaveLength(2);
    expect(log.reads.map((r) => r.notes)).toContain('Loved it');
    expect(log.genres.map((x) => x.name)).toEqual(['Sci-fi']);
    expect(log.tropes.map((x) => x.name)).toEqual(['Chosen one']);
    expect(log.places.map((x) => x.name)).toEqual(['Arrakis']);
    expect(log.characters).toHaveLength(1);
    expect(log.characters[0].role).toBe('main');
    expect(log.cover).toBe('data:image/png;base64,B');
    const slot = (await getChallenge(db, g))!.loose[0];
    expect(slot.fill?.read_id).toBe(rb);
    expect(slot.fill?.book_id).toBe(a);
  });
  it('keeps this book\'s cover when it is chosen, and drops the other', async () => {
    const { a, b } = await pair();
    await setBookCover(db, a, { dataUrl: 'data:image/png;base64,A' });
    await setBookCover(db, b, { dataUrl: 'data:image/png;base64,B' });
    const p = await planMerge(db, a, b);
    expect(p.fields.find((f) => f.key === 'cover')!.state).toBe('conflict');
    await mergeBooks(db, a, b, { title: 'a', cover: 'a' });
    expect((await getBookLog(db, a))!.cover).toBe('data:image/png;base64,A');
  });
  it('merges release dates and keeps a dated one over "to be announced"', async () => {
    const { a, b } = await pair();
    await db.execute("INSERT INTO format_release (id, book_id, format, status) VALUES ('f1', ?, 'audio', 'tba')", [a]);
    await db.execute("INSERT INTO format_release (id, book_id, format, status, release_date) VALUES ('f2', ?, 'audio', 'dated', '2027-01-02')", [b]);
    await db.execute("INSERT INTO format_release (id, book_id, format, status, release_date) VALUES ('f3', ?, 'ebook', 'dated', '2027-03-04')", [b]);
    await mergeBooks(db, a, b, { title: 'a' });
    const rows = await db.select<{ format: string; status: string; release_date: string | null }>('SELECT format, status, release_date FROM format_release WHERE book_id = ? AND deleted_at IS NULL ORDER BY format', [a]);
    expect(rows).toEqual([{ format: 'audio', status: 'dated', release_date: '2027-01-02' }, { format: 'ebook', status: 'dated', release_date: '2027-03-04' }]);
  });
  it('fills the shelf from the other book, and clears it when the merged book is being read', async () => {
    const { a, b } = await pair();
    await setStatus(db, b, null, 'tbr');
    await mergeBooks(db, a, b, { title: 'a' });
    expect((await getBookLog(db, a))!.book.shelf).toBe('tbr');
    const { a: a2, b: b2 } = await pair();
    await setStatus(db, a2, null, 'tbr');
    await createRead(db, b2, 'reading');
    await mergeBooks(db, a2, b2, { title: 'a' });
    expect((await getBookLog(db, a2))!.book.shelf).toBeNull();
  });
  it('does not touch a book that was deleted before', async () => {
    const { a, b } = await pair();
    await deleteBook(db, b);
    await expect(mergeBooks(db, a, b, {})).rejects.toThrow('could not be found');
  });
  it('lists every read of both books, and keeps only the ones you choose (and drops the rest with their picks)', async () => {
    const { a, b } = await pair();
    const r1 = await createRead(db, a, 'finished'); await updateRead(db, r1, { finish_date: '2026-02-01', rating: 16 });
    const r2 = await createRead(db, b, 'finished'); await updateRead(db, r2, { finish_date: '2026-03-01', notes: 'dup' });
    const r3 = await createRead(db, b, 'dnf'); await updateRead(db, r3, { finish_date: '2025-01-01' });
    const g = await createGrid(db, { year: 2026, name: 'G', prompts: ['p1'] });
    await fillSlot(db, (await getChallenge(db, g))!.loose[0].id, r2);
    const plan = await planMerge(db, a, b);
    expect(plan.reads.map((r) => [r.id, r.side])).toEqual([[r1, 'a'], [r3, 'b'], [r2, 'b']]);
    expect(plan.reads.find((r) => r.id === r2)!.challenges).toEqual(['G']);
    await expect(mergeBooks(db, a, b, { title: 'a' }, [r1, 'nope'])).rejects.toThrow('no longer exists');
    await mergeBooks(db, a, b, { title: 'a' }, [r1, r3]);
    const log = (await getBookLog(db, a))!;
    expect(log.reads.map((r) => r.id).sort()).toEqual([r1, r3].sort());
    expect((await getChallenge(db, g))!.loose[0].fill).toBeNull();
  });
  it('keeps all reads when none are listed, and can keep none', async () => {
    const { a, b } = await pair();
    await createRead(db, a, 'finished'); await createRead(db, b, 'finished');
    await mergeBooks(db, a, b, { title: 'a' });
    expect((await getBookLog(db, a))!.reads).toHaveLength(2);
    const { a: a2, b: b2 } = await pair();
    await createRead(db, a2, 'finished'); await createRead(db, b2, 'finished');
    await mergeBooks(db, a2, b2, { title: 'a' }, []);
    expect((await getBookLog(db, a2))!.reads).toHaveLength(0);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { createBook } from '../src/repo/books';
import { authorDeletePreview, authorMergePlan, deleteAuthor, mergeAuthors } from '../src/repo/authorMerge';
import { planChoice } from '../src/repo/mergeReview';
import { addAlias, getAuthor, listAuthors, updatePerson } from '../src/repo/people';
import { addSeriesGenre, createSeries, getSeriesPage, listSeriesLedger, seriesAuthors, setBookSeries, updateSeries } from '../src/repo/series';
import { deleteSeries, mergeSeries, seriesDeletePreview, seriesMergePlan } from '../src/repo/seriesMerge';

let db: Db;
beforeEach(() => { db = migrateNodeDb(); });
const authorId = async (n: string) => (await db.select<{ id: string }>('SELECT id FROM author WHERE name = ?', [n]))[0].id;

describe('series merge', () => {
  it('flags clashing numbers, lets you leave books out, and joins fields', async () => {
    const keep = await createSeries(db, 'Wolves'), dup = await createSeries(db, 'The Wolf Books');
    const a = await createBook(db, { title: 'W1', authors: ['Ann'] }), b = await createBook(db, { title: 'W1 again', authors: ['Ann'] }), c = await createBook(db, { title: 'W2', authors: ['Bo'] });
    await setBookSeries(db, a, keep, 1); await setBookSeries(db, b, dup, 1); await setBookSeries(db, c, dup, 2);
    await addSeriesGenre(db, dup, 'Fantasy');
    await updateSeries(db, keep, { notes: 'good' }); await updateSeries(db, dup, { notes: 'more', total_books: 3 });
    const plan = await seriesMergePlan(db, keep, dup);
    expect(plan.items.find((i) => i.label.startsWith('W1 again'))!.label).toContain('same number as "W1"');
    expect(plan.fields.find((f) => f.key === 'notes')!.mode).toBe('both');
    expect(plan.fields.find((f) => f.key === 'total_books')!.mode).toBe('dup');
    const choice = planChoice(plan);
    choice.leave.push(plan.items.find((i) => i.label.startsWith('W1 again'))!.key);
    await mergeSeries(db, keep, dup, choice);
    const p = (await getSeriesPage(db, keep))!;
    expect(p.books.map((x) => x.title).sort()).toEqual(['W1', 'W2']);
    expect(p.series.notes).toBe('good\n\nmore');
    expect(p.series.total_books).toBe(3);
    expect(p.genres.map((g) => g.name)).toEqual(['Fantasy']);
    expect((await seriesAuthors(db, keep)).map((x) => x.name).sort()).toEqual(['Ann', 'Bo']);
    expect(await getSeriesPage(db, dup)).toBeNull();
    expect((await db.select<{ series_id: string | null }>('SELECT series_id FROM book WHERE id = ?', [b]))[0].series_id).toBeNull();
    expect((await listSeriesLedger(db)).map((r) => r.title)).toEqual(['Wolves']);
  });
  it('merges everything with no choice and refuses the same series twice', async () => {
    const keep = await createSeries(db, 'A'), dup = await createSeries(db, 'B');
    const x = await createBook(db, { title: 'X', authors: ['Ann'] });
    await setBookSeries(db, x, dup, 1);
    await mergeSeries(db, keep, dup);
    expect((await getSeriesPage(db, keep))!.books).toHaveLength(1);
    await expect(mergeSeries(db, keep, keep)).rejects.toThrow();
  });
  it('deleting a series keeps its books', async () => {
    const s = await createSeries(db, 'Gone');
    const x = await createBook(db, { title: 'X', authors: ['Ann'] }), y = await createBook(db, { title: 'Y', authors: ['Ann'] });
    await setBookSeries(db, x, s, 1); await setBookSeries(db, y, s, 2);
    expect(await seriesDeletePreview(db, s)).toEqual({ books: 2 });
    await deleteSeries(db, s);
    expect(await getSeriesPage(db, s)).toBeNull();
    expect((await db.select<{ n: number }>('SELECT count(*) AS n FROM book WHERE series_id IS NULL AND deleted_at IS NULL'))[0].n).toBe(2);
    await expect(deleteSeries(db, s)).rejects.toThrow();
  });
});

describe('author merge and delete', () => {
  it('moves books, series and names, and honours left-out items', async () => {
    const x = await createBook(db, { title: 'One', authors: ['J. Smith'] }), y = await createBook(db, { title: 'Two', authors: ['J. Smith', 'Jo Smith'] }), z = await createBook(db, { title: 'Three', authors: ['J. Smith'] });
    const keep = await authorId('Jo Smith'), dup = await authorId('J. Smith');
    await addAlias(db, 'author', dup, 'Joey'); await addAlias(db, 'author', dup, 'JS');
    await updatePerson(db, 'author', dup, { notes: 'writes fast' }); await updatePerson(db, 'author', keep, { notes: 'debut 2010' });
    const s = await createSeries(db, 'Smithverse', { authors: ['J. Smith'] });
    await setBookSeries(db, x, s, 1);
    const plan = await authorMergePlan(db, keep, dup);
    expect(plan.items.map((i) => i.group)).toEqual(expect.arrayContaining(['Other names', 'Books', 'Series']));
    const choice = planChoice(plan);
    choice.leave.push(plan.items.find((i) => i.label === 'JS')!.key, plan.items.find((i) => i.label === 'Three')!.key);
    await mergeAuthors(db, keep, dup, choice);
    const d = (await getAuthor(db, keep))!;
    expect(d.books.map((b) => b.title).sort()).toEqual(['One', 'Two']);
    expect(d.aliases.map((a) => a.name).sort()).toEqual(['J. Smith', 'Joey']);
    expect(d.core.notes).toBe('debut 2010\n\nwrites fast');
    expect(d.series.map((i) => i.name)).toEqual(['Smithverse']);
    expect((await listAuthors(db)).map((a) => a.name)).toEqual(['Jo Smith']);
    expect(x && y && z && s).toBeTruthy();
  });
  it('deleting an author keeps their books', async () => {
    await createBook(db, { title: 'Solo', authors: ['Pat'] });
    const id = await authorId('Pat');
    expect(await authorDeletePreview(db, id)).toEqual({ books: 1, series: 0 });
    await deleteAuthor(db, id);
    expect(await getAuthor(db, id)).toBeNull();
    expect((await db.select<{ n: number }>("SELECT count(*) AS n FROM book WHERE title = 'Solo' AND deleted_at IS NULL"))[0].n).toBe(1);
    await expect(mergeAuthors(db, id, id)).rejects.toThrow();
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { filterLibrary } from '../src/domain/library';
import { searchAll, searchPath } from '../src/domain/search';
import { addTag, createNarrator } from '../src/repo/bookLog';
import { createBook } from '../src/repo/books';
import { listLibrary } from '../src/repo/library';
import { listBookTags, listTagOptions, loadSearchIndex } from '../src/repo/search';
import { createSeries, createUniverse } from '../src/repo/series';

let db: Db;
beforeEach(() => { db = migrateNodeDb(); });

async function seed() {
  const a = await createBook(db, { title: 'Moonlit Bargain', authors: ['Ana Reyes'] });
  const b = await createBook(db, { title: 'Moon Garden', authors: ['Bo Chen'] });
  const c = await createBook(db, { title: 'Dry Spell', authors: ['Cy Dunn'] });
  await addTag(db, a, 'genre', 'Fantasy'); await addTag(db, a, 'trope', 'Slow burn'); await addTag(db, a, 'theme', 'Found family');
  await addTag(db, b, 'genre', 'Fantasy'); await addTag(db, b, 'trope', 'Enemies to lovers');
  await addTag(db, c, 'genre', 'Mystery');
  await createSeries(db, 'Moon Cycle'); await createNarrator(db, 'Moon Voice'); await createUniverse(db, 'Moonverse');
  return { a, b, c };
}

describe('search everything', () => {
  it('groups results Books, Series, Authors, Narrators, ..., then Genres, Tropes, Themes', async () => {
    await seed();
    await addTag(db, (await listLibrary(db))[0].id, 'genre', 'Moonpunk');
    const idx = await loadSearchIndex(db);
    const groups = searchAll(idx, 'moon');
    expect(groups.map((g) => g.title)).toEqual(['Books', 'Series', 'Narrators', 'Universes', 'Genres']);
    expect(groups[0].items.map((i) => i.label)).toEqual(['Moon Garden', 'Moonlit Bargain']);
  });
  it('finds authors, tropes and themes, ignores accents and case, needs every word', async () => {
    await seed();
    const idx = await loadSearchIndex(db);
    expect(searchAll(idx, 'ana REYES')[0]).toMatchObject({ title: 'Authors' });
    expect(searchAll(idx, 'slow')[0]).toMatchObject({ title: 'Tropes' });
    expect(searchAll(idx, 'found fam')[0].items[0].label).toBe('Found family');
    expect(searchAll(idx, 'moon zzz')).toEqual([]);
    expect(searchAll(idx, '   ')).toEqual([]);
  });
  it('lists books with their authors and sends each kind to the right place', async () => {
    const { a } = await seed();
    const idx = await loadSearchIndex(db);
    const hit = searchAll(idx, 'Moonlit')[0].items[0];
    expect(hit).toMatchObject({ id: a, sub: 'Ana Reyes' });
    expect(searchPath(hit)).toBe(`/book/${a}`);
    const g = idx.find((i) => i.kind === 'genre' && i.label === 'Fantasy')!;
    expect(searchPath(g)).toBe(`/library?tag=genre:${g.id}`);
  });
});

describe('tag filtering', () => {
  it('lists tags in use with book counts and maps tags to books', async () => {
    const { a, b } = await seed();
    const opts = await listTagOptions(db);
    expect(opts.find((o) => o.name === 'Fantasy')).toMatchObject({ kind: 'genre', count: 2 });
    expect(opts.find((o) => o.name === 'Mystery')?.count).toBe(1);
    const bt = await listBookTags(db);
    const f = opts.find((o) => o.name === 'Fantasy')!;
    expect(bt[`genre:${f.id}`].sort()).toEqual([a, b].sort());
  });
  it('combines tags: all of them, or any of them', async () => {
    const { a, b, c } = await seed();
    const opts = await listTagOptions(db); const bt = await listBookTags(db);
    const key = (n: string) => { const o = opts.find((x) => x.name === n)!; return `${o.kind}:${o.id}`; };
    const books = await listLibrary(db);
    const base = { query: '', status: 'all' as const, favorites: false, noCover: false, bookTags: bt };
    const ids = (r: { id: string }[]) => r.map((x) => x.id).sort();
    expect(ids(filterLibrary(books, base))).toEqual([a, b, c].sort());
    expect(ids(filterLibrary(books, { ...base, tags: [key('Fantasy')] }))).toEqual([a, b].sort());
    expect(ids(filterLibrary(books, { ...base, tags: [key('Fantasy'), key('Slow burn')], tagMode: 'all' }))).toEqual([a]);
    expect(ids(filterLibrary(books, { ...base, tags: [key('Slow burn'), key('Mystery')], tagMode: 'any' }))).toEqual([a, c].sort());
    expect(filterLibrary(books, { ...base, tags: [key('Mystery'), key('Slow burn')], tagMode: 'all' })).toEqual([]);
    expect(ids(filterLibrary(books, { ...base, tags: [key('Fantasy')], query: 'garden' }))).toEqual([b]);
  });
});

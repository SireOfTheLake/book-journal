import { describe, expect, it } from 'vitest';
import { migrateNodeDb } from '../src/db/nodeDb';
import { filterLibrary } from '../src/domain/library';
import { getHome } from '../src/repo/home';
import { updateBook, quickAdd } from '../src/repo/bookLog';
import { listBooksForCovers } from '../src/repo/covers';
import { listLibrary } from '../src/repo/library';

describe('a permanent placeholder cover', () => {
  it('leaves the book out of the No cover filter, the count, and the cover finder', async () => {
    const db = migrateNodeDb();
    const a = (await quickAdd(db, { title: 'Alpha', authors: ['X'], status: 'tbr' })).bookId;
    await quickAdd(db, { title: 'Beta', authors: ['X'], status: 'tbr' });
    let lib = await listLibrary(db);
    expect(filterLibrary(lib, { query: '', status: 'all', favorites: false, noCover: true }).map((b) => b.title)).toEqual(['Alpha', 'Beta']);
    expect((await getHome(db, '2026-10-20')).tidy.noCover).toBe(2);
    await updateBook(db, a, { placeholder_permanent: 1 });
    lib = await listLibrary(db);
    expect(filterLibrary(lib, { query: '', status: 'all', favorites: false, noCover: true }).map((b) => b.title)).toEqual(['Beta']);
    expect((await getHome(db, '2026-10-20')).tidy.noCover).toBe(1);
    expect((await listBooksForCovers(db)).map((b) => b.title)).toEqual(['Beta']);
    expect((await listBooksForCovers(db, { includeWithCover: true })).map((b) => b.title)).toEqual(['Alpha', 'Beta']);
  });
});

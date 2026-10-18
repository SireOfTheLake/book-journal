import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { newId } from '../src/domain/ids';
import { createBook } from '../src/repo/books';
import { addTag, getBookLog } from '../src/repo/bookLog';
import { addLocationToBook, countPurgeable, deletePlace, listPlaces, purgeUnusedPlaces } from '../src/repo/places';

let db: Db;
beforeEach(() => { db = migrateNodeDb(); });
const loose = async (name: string) => { const id = newId(); await db.execute('INSERT INTO place (id, name, located) VALUES (?, ?, 0)', [id, name]); return id; };

describe('deleting locations', () => {
  it('deleting a location removes it from its books but keeps the books', async () => {
    const b = await createBook(db, { title: 'Brit Book', authors: ['A'] });
    await addLocationToBook(db, b, { city: 'London', country: 'United Kingdom' });
    const [p] = await listPlaces(db);
    await deletePlace(db, p.id);
    expect(await listPlaces(db)).toHaveLength(0);
    expect((await getBookLog(db, b))!.places).toHaveLength(0);
    await expect(deletePlace(db, p.id)).rejects.toThrow();
  });
  it('purges only flagged locations with no books', async () => {
    const b = await createBook(db, { title: 'Used', authors: ['A'] });
    await addTag(db, b, 'place', 'Somewhere vague');          // flagged, but a book uses it
    await loose('Unused vague');                                // flagged, no books -> purged
    await addLocationToBook(db, b, { city: 'Paris', country: 'France' });
    await addLocationToBook(db, (await createBook(db, { title: 'Other', authors: ['A'] })), { city: 'Rome', country: 'Italy' });
    expect(await countPurgeable(db)).toBe(1);
    expect(await purgeUnusedPlaces(db)).toBe(1);
    expect((await listPlaces(db)).map((p) => p.name).sort()).toEqual(['Paris, France', 'Rome, Italy', 'Somewhere vague'].sort());
    expect(await countPurgeable(db)).toBe(0);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { quickAdd } from '../src/repo/bookLog';
import { addAltName, addCharacterToBook, addCharacterTag, addOccupation, addPerson, addRelationship, createCharacter, deleteCharacter, getCharacter, listCharacters, mergeCharacters, updateCharacter } from '../src/repo/characters';

let db: Db;
beforeEach(() => { db = migrateNodeDb(); });
const book = async (t: string) => (await quickAdd(db, { title: t, authors: ['A'], status: 'tbr' })).bookId;

describe('merging characters', () => {
  it('moves books (main beats side), relationships, tags, people and names to the kept character', async () => {
    const keep = await createCharacter(db, 'Rory'), dup = await createCharacter(db, 'Aurora'), friend = await createCharacter(db, 'Zed'), other = await createCharacter(db, 'Mia');
    const b1 = await book('One'), b2 = await book('Two');
    await addCharacterToBook(db, keep, b1, 'side');
    await addCharacterToBook(db, dup, b1, 'main');
    await addCharacterToBook(db, dup, b2, 'side');
    await addRelationship(db, dup, { id: friend }, 'friend', null, 'best friend');
    await addRelationship(db, dup, { id: keep }, 'friend', null, null);
    await addRelationship(db, keep, { id: other }, 'friend', null, null);
    await addRelationship(db, dup, { id: other }, 'friend', null, 'rival');
    await addCharacterTag(db, dup, 'TAME'); await addOccupation(db, dup, 'Chef'); await addPerson(db, dup, 'Mum', 'family', null, 'mother');
    await updateCharacter(db, dup, { description: 'tall' });
    await addAltName(db, dup, 'Rora', null);

    await mergeCharacters(db, keep, dup);

    const c = (await getCharacter(db, keep))!;
    expect(c.books.map((b) => [b.title, b.role]).sort()).toEqual([['One', 'main'], ['Two', 'side']]);
    expect(c.tags.map((t) => t.name)).toEqual(['TAME']);
    expect(c.occupations.map((o) => o.name)).toEqual(['Chef']);
    expect(c.people.map((p) => p.name)).toEqual(['Mum']);
    expect(c.altNames.map((a) => a.name).sort()).toEqual(['Aurora', 'Rora']);
    expect(c.core.description).toBe('tall');
    const others = c.relationships.map((r) => r.other_name).sort();
    expect(others).toEqual(['Mia', 'Zed']); // no relationship with themselves, none doubled
    expect(c.relationships.find((r) => r.other_name === 'Zed')!.label).toBe('best friend');
    expect(c.relationships.find((r) => r.other_name === 'Mia')!.label).toBe('rival');
    expect((await listCharacters(db)).map((r) => r.name)).not.toContain('Aurora');
    expect(await getCharacter(db, dup)).toBeNull();
  });

  it('will not merge a character into themselves', async () => {
    const a = await createCharacter(db, 'Solo');
    await expect(mergeCharacters(db, a, a)).rejects.toThrow();
  });
});

describe('deleting a character', () => {
  it('removes them from books and relationships', async () => {
    const a = await createCharacter(db, 'Ann'), b = await createCharacter(db, 'Bo');
    const bk = await book('One');
    await addCharacterToBook(db, a, bk, 'main');
    await addRelationship(db, a, { id: b }, 'friend', null, null);
    await deleteCharacter(db, a);
    expect((await listCharacters(db)).map((r) => r.name)).toEqual(['Bo']);
    expect((await getCharacter(db, b))!.relationships).toHaveLength(0);
  });
});

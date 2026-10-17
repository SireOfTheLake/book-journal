import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { applyNotionPlan } from '../src/import/apply';
import { applyNotionCharacters } from '../src/import/applyCharacters';
import { planNotionBooks } from '../src/import/notion';
import { planNotionCharacters } from '../src/import/notionCharacters';
import { addAltName, addCharacterToBook, addCharacterTag, addImage, addOccupation, addPerson, addPreviousPlace, addRelationship, convertPerson, createCharacter, findOrCreateNamed, getCharacter, listBookOptions, listCharacterOptions, listCharacters, listNamed, removeAltName, removeCharacterFromBook, removePerson, setPersonLabel, removeCharacterTag, removeImage, removeOccupation, removePreviousPlace, removeRelationship, renameNamed, setBookNote, setMainImage, setRelationshipLabel, tagImage, updateCharacter } from '../src/repo/characters';

const read = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');
let db: Db;
const idOf = async (name: string) => (await db.select<{ id: string }>('SELECT id FROM character WHERE name = ? AND deleted_at IS NULL', [name]))[0].id;

beforeEach(async () => {
  db = migrateNodeDb();
  await applyNotionPlan(db, planNotionBooks(read('book-tracker.csv')), { tagDestinations: {} });
  await applyNotionCharacters(db, planNotionCharacters(read('characters.csv')));
});

describe('the character list', () => {
  it('lists characters A to Z with partner, occupation, place, and book counts', async () => {
    const rows = await listCharacters(db);
    const names = rows.map((r) => r.name);
    expect(names).toEqual([...names].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())));
    const emery = rows.find((r) => r.name === 'Emery Hazard')!;
    expect(emery).toMatchObject({ is_featured: 1, partners: 'John-Henry Somerset', place: 'Wahredua' });
    expect(rows.find((r) => r.name === 'Aileen')).toBeUndefined(); // only named, so not a character
    expect(rows.every((r) => r.is_featured === 1)).toBe(true);
    const matt = rows.find((r) => r.name === 'Matt')!;
    expect(matt.tags).toBe('Hole'); // the (Hole) note is a tag, not part of the name
  });
});

describe('one character', () => {
  it('brings together names, places, relationships, and details', async () => {
    const c = (await getCharacter(db, await idOf('Emery Hazard')))!;
    expect(c.altNames.map((a) => [a.name, a.type])).toEqual([['Em', 'Nickname'], ['Ree', 'Nickname']]);
    expect(c.place?.name).toBe('Wahredua');
    expect(c.previousPlaces.map((p) => p.name)).toEqual(['St Louis']);
    expect(c.sexuality?.name).toBe('gay');
    const partner = c.relationships.find((r) => r.rel_type === 'partner' && r.is_current === 1)!;
    expect(partner.other_name).toBe('John-Henry Somerset');
    expect(c.relationships.filter((r) => r.rel_type === 'partner' && r.is_current === 0).map((r) => r.other_name)).toEqual(['Nico Flores']);
    expect(c.people.filter((p) => p.rel_type === 'partner' && p.is_current === 0).map((p) => p.name)).toEqual(['Billy Rolker']);
    expect(c.people.find((p) => p.name === 'Aileen')).toMatchObject({ rel_type: 'family', label: 'mother' });
    expect(c.people.find((p) => p.name === 'Frank')).toMatchObject({ label: 'father' });
  });
  it('returns null for an unknown character', async () => {
    expect(await getCharacter(db, 'nope')).toBeNull();
  });
});

describe('editing a character', () => {
  it('updates details and ignores columns it should not touch', async () => {
    const id = await idOf('Emery Hazard');
    await updateCharacter(db, id, { gender: 'male', is_transgender: 1, age_min: 30, age_max: 34, age_is_approximate: 1, description: 'Tall', deleted_at: 'x' });
    const c = (await getCharacter(db, id))!;
    expect(c.core).toMatchObject({ gender: 'male', is_transgender: 1, age_min: 30, age_max: 34, age_is_approximate: 1, description: 'Tall' });
  });
  it('adds and removes names, occupations, tags, and previous places', async () => {
    const id = await idOf('Emery Hazard');
    await addAltName(db, id, 'Detective Hazard', 'Alias');
    await addOccupation(db, id, 'Lawyer'); await addOccupation(db, id, 'lawyer');
    await addCharacterTag(db, id, 'grumpy');
    const place = await findOrCreateNamed(db, 'occupation', 'Lawyer'); // reuses the same entry
    await db.execute("INSERT INTO place (id, name) VALUES ('p1', 'Boston')");
    await addPreviousPlace(db, id, 'p1');
    let c = (await getCharacter(db, id))!;
    expect(c.altNames.at(-1)).toMatchObject({ name: 'Detective Hazard', type: 'Alias' });
    expect(c.occupations.map((o) => o.name)).toContain('Lawyer');
    expect(c.occupations.filter((o) => o.name.toLowerCase() === 'lawyer')).toHaveLength(1);
    expect(c.tags.map((t) => t.name)).toEqual(['grumpy']);
    expect(c.previousPlaces.map((p) => p.name)).toEqual(['St Louis', 'Boston']);
    expect(place).toBe(c.occupations.find((o) => o.name === 'Lawyer')!.id);
    await removeAltName(db, c.altNames.at(-1)!.id);
    await removeOccupation(db, id, place); await removeCharacterTag(db, id, c.tags[0].id); await removePreviousPlace(db, id, 'p1');
    c = (await getCharacter(db, id))!;
    expect([c.altNames.length, c.tags.length, c.previousPlaces.length]).toEqual([2, 0, 1]);
    expect(c.occupations.map((o) => o.name)).not.toContain('Lawyer');
  });
  it('renames a list entry everywhere and refuses a clash', async () => {
    const id = await idOf('Emery Hazard');
    const gay = (await getCharacter(db, id))!.sexuality!;
    await renameNamed(db, 'sexuality', gay.id, 'Gay');
    expect((await getCharacter(db, id))!.sexuality?.name).toBe('Gay');
    const all = await listNamed(db, 'sexuality');
    await expect(renameNamed(db, 'sexuality', all[0].id, all[1].name.toUpperCase())).rejects.toThrow(/already/);
  });
  it('rejects an empty name', async () => {
    await expect(createCharacter(db, '  ')).rejects.toThrow();
  });
});

describe('relationships between characters', () => {
  it('shows a relationship from both sides, with each side labelled separately', async () => {
    const emery = await idOf('Emery Hazard');
    const zed = await createCharacter(db, 'Zed Newcomer');
    await addRelationship(db, emery, { id: zed }, 'family', null, 'sister');
    expect((await getCharacter(db, emery))!.relationships.find((r) => r.other_name === 'Zed Newcomer')).toMatchObject({ label: 'sister' });
    expect((await getCharacter(db, zed))!.relationships.find((r) => r.other_name === 'Emery Hazard')?.label).toBeNull();
    const relId = (await getCharacter(db, zed))!.relationships[0].id;
    await setRelationshipLabel(db, relId, zed, 'brother');
    expect((await getCharacter(db, zed))!.relationships[0].label).toBe('brother');
    expect((await getCharacter(db, emery))!.relationships.find((r) => r.other_name === 'Zed Newcomer')?.label).toBe('sister');
    await removeRelationship(db, relId);
    expect((await getCharacter(db, emery))!.relationships.find((r) => r.other_name === 'Zed Newcomer')).toBeUndefined();
  });
  it('turns an existing partner into a different one without duplicating', async () => {
    const emery = await idOf('Emery Hazard');
    const jh = await idOf('John-Henry Somerset');
    await addRelationship(db, emery, { id: jh }, 'partner', 1, 'husband');
    const rels = (await getCharacter(db, emery))!.relationships.filter((r) => r.other_id === jh && r.rel_type === 'partner');
    expect(rels).toHaveLength(1);
    expect(rels[0].label).toBe('husband');
  });
  it('refuses to relate someone to themselves or to nobody', async () => {
    const emery = await idOf('Emery Hazard');
    await expect(addRelationship(db, emery, { id: emery }, 'friend', null, null)).rejects.toThrow();
    await expect(addRelationship(db, emery, { id: '' }, 'friend', null, null)).rejects.toThrow();
  });
});

describe('people who are only named', () => {
  const characterCount = async () => (await listCharacters(db)).length;
  it('adds a plain name and label without creating a character', async () => {
    const before = await characterCount();
    const emery = await idOf('Emery Hazard');
    await addPerson(db, emery, 'Seraphina', 'friend', null, 'friend');
    expect(await characterCount()).toBe(before);
    expect((await getCharacter(db, emery))!.people.find((p) => p.name === 'Seraphina')).toMatchObject({ rel_type: 'friend', label: 'friend' });
  });
  it('never treats two people with the same name on different characters as one person', async () => {
    const a = await idOf('Emery Hazard'); const b = await idOf('John-Henry Somerset');
    await addPerson(db, a, 'Seraphina', 'friend', null, 'friend');
    await addPerson(db, b, 'Seraphina', 'family', null, 'relative');
    const rows = await db.select<{ character_id: string; rel_type: string }>("SELECT character_id, rel_type FROM related_person WHERE name = 'Seraphina' AND deleted_at IS NULL ORDER BY character_id");
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.character_id)).size).toBe(2);
    expect((await listCharacters(db)).filter((r) => r.name === 'Seraphina')).toHaveLength(0);
  });
  it('edits the label, removes a person, and rejects an empty name', async () => {
    const emery = await idOf('Emery Hazard');
    const id = await addPerson(db, emery, 'Kat2', 'friend', null, null);
    await setPersonLabel(db, id, 'neighbour');
    expect((await getCharacter(db, emery))!.people.find((p) => p.id === id)?.label).toBe('neighbour');
    await removePerson(db, id);
    expect((await getCharacter(db, emery))!.people.find((p) => p.id === id)).toBeUndefined();
    await expect(addPerson(db, emery, ' ', 'friend', null, null)).rejects.toThrow();
  });
  it('can be made into a character, keeping the relationship and label', async () => {
    const emery = await idOf('Emery Hazard');
    const person = (await getCharacter(db, emery))!.people.find((p) => p.name === 'Aileen')!;
    const created = await convertPerson(db, person.id);
    const c = (await getCharacter(db, emery))!;
    expect(c.people.find((p) => p.name === 'Aileen')).toBeUndefined();
    expect(c.relationships.find((r) => r.other_id === created)).toMatchObject({ other_name: 'Aileen', rel_type: 'family', label: 'mother' });
    expect((await getCharacter(db, created))!.core.name).toBe('Aileen');
  });
  it('can be linked to a character you already have', async () => {
    const emery = await idOf('Emery Hazard');
    const frank = (await getCharacter(db, emery))!.people.find((p) => p.name === 'Frank')!;
    const existing = await createCharacter(db, 'Frank Hazard');
    expect(await convertPerson(db, frank.id, { id: existing })).toBe(existing);
    expect((await getCharacter(db, emery))!.relationships.find((r) => r.other_id === existing)).toMatchObject({ rel_type: 'family', label: 'father' });
  });
});

describe('characters in books', () => {
  it('adds a character to a book as main or side, and removes them', async () => {
    const [{ id: book }] = await db.select<{ id: string }>("SELECT id FROM book WHERE title = 'Hooks In'");
    const matt = await idOf('Matt');
    expect((await getCharacter(db, matt))!.books).toEqual([]);
    await addCharacterToBook(db, matt, book, 'main');
    await addCharacterToBook(db, matt, book, 'side'); // changes the role, no duplicate
    const links = (await getCharacter(db, matt))!.books;
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ title: 'Hooks In', role: 'side' });
    await removeCharacterFromBook(db, links[0].id);
    expect((await getCharacter(db, matt))!.books).toEqual([]);
  });
  it('offers books and characters (with their tags) for the pickers', async () => {
    expect((await listBookOptions(db)).find((b) => b.name === 'Bro Doll')?.authors).toBe('J. De Saint');
    expect((await listCharacterOptions(db)).find((c) => c.name === 'Matt')?.tags).toBe('Hole');
  });
});

describe('books, art, and voices', () => {
  it('keeps a note for each book a character is in', async () => {
    const id = await idOf('Reid');
    const bc = (await getCharacter(db, id))!.books[0];
    expect(bc).toMatchObject({ title: 'Bro Doll', role: 'main' });
    await setBookNote(db, bc.id, 'Bakes bread');
    expect((await getCharacter(db, id))!.books[0].notes).toBe('Bakes bread');
  });
  it('stores art: the first picture is main, another can be made main, and couple art shows on both pages', async () => {
    const a = await idOf('Emery Hazard'); const b = await idOf('John-Henry Somerset');
    const first = await addImage(db, a, { dataUrl: 'data:image/png;base64,AAA' });
    const second = await addImage(db, a, { dataUrl: 'data:image/png;base64,BBB' });
    let imgs = (await getCharacter(db, a))!.images;
    expect(imgs.map((i) => [i.id === first, i.is_main])).toEqual([[true, 1], [false, 0]]);
    await setMainImage(db, a, second);
    imgs = (await getCharacter(db, a))!.images;
    expect(imgs[0].id).toBe(second);
    expect(imgs.filter((i) => i.is_main)).toHaveLength(1);
    await tagImage(db, second, b);
    expect((await getCharacter(db, b))!.images.map((i) => i.id)).toEqual([second]);
    expect((await getCharacter(db, a))!.images.find((i) => i.id === second)!.tagged.map((t) => t.name)).toEqual(['John-Henry Somerset']);
    await removeImage(db, a, first);
    expect((await getCharacter(db, a))!.images.map((i) => i.id)).toEqual([second]);
    expect(await db.select('SELECT id FROM image WHERE id = ? AND deleted_at IS NULL', [first])).toEqual([]);
    await removeImage(db, a, second);
    expect(await db.select('SELECT id FROM image WHERE id = ? AND deleted_at IS NULL', [second])).toHaveLength(1); // still on John-Henry's page
  });
});

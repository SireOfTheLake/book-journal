import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { addNarratorToRead, createNarrator, quickAdd, updateRead } from '../src/repo/bookLog';
import { addAltName, addCharacterToBook, addOccupation, characterMergePlan, createCharacter, getCharacter, mergeCharacters, updateCharacter } from '../src/repo/characters';
import { mergeNarrators, narratorMergePlan } from '../src/repo/narratorMerge';
import { addAlias, addLink, addUsualAccent, getNarrator, updatePerson } from '../src/repo/people';
import { planChoice } from '../src/repo/mergeReview';

let db: Db;
beforeEach(() => { db = migrateNodeDb(); });

describe('character merge review', () => {
  it('lists differing fields and the duplicate items, and honours the choices', async () => {
    const keep = await createCharacter(db, 'Rory'), dup = await createCharacter(db, 'Aurora');
    const b1 = (await quickAdd(db, { title: 'One', authors: ['A'], status: 'tbr' })).bookId;
    await addCharacterToBook(db, dup, b1, 'main');
    await addOccupation(db, dup, 'Chef'); await addOccupation(db, dup, 'Spy');
    await addAltName(db, dup, 'Rora', null);
    await updateCharacter(db, keep, { description: 'tall', organization: 'Guild' });
    await updateCharacter(db, dup, { description: 'brave', organization: 'Crew' });
    const plan = await characterMergePlan(db, keep, dup);
    expect(plan.fields.find((f) => f.key === 'description')).toMatchObject({ mode: 'both', keep: 'tall', dup: 'brave' });
    expect(plan.fields.find((f) => f.key === 'organization')!.mode).toBe('keep');
    expect(plan.items.map((i) => i.group)).toEqual(expect.arrayContaining(['Books', 'Occupations', 'Other names']));
    const choice = planChoice(plan);
    choice.fields.organization = 'dup';
    choice.leave.push(plan.items.find((i) => i.label === 'Spy')!.key);
    await mergeCharacters(db, keep, dup, choice);
    const c = (await getCharacter(db, keep))!;
    expect(c.core.description).toBe('tall\n\nbrave');
    expect(c.core.organization).toBe('Crew');
    expect(c.occupations.map((o) => o.name)).toEqual(['Chef']);
    expect(c.books).toHaveLength(1);
  });
});

describe('narrator merge', () => {
  it('moves listens, books, names and accents; combines fields; and can leave items out', async () => {
    const keep = await createNarrator(db, 'Jo Smith'), dup = await createNarrator(db, 'J. Smith');
    const a = await quickAdd(db, { title: 'Audio A', authors: ['X'], status: 'finished' }), b = await quickAdd(db, { title: 'Audio B', authors: ['X'], status: 'finished' });
    await updateRead(db, a.readId!, { format: 'audio' }); await updateRead(db, b.readId!, { format: 'audio' });
    await addNarratorToRead(db, a.readId!, dup); await addNarratorToRead(db, b.readId!, dup); await addNarratorToRead(db, b.readId!, keep);
    await addAlias(db, 'narrator', dup, 'Joanna'); await addAlias(db, 'narrator', dup, 'Jojo');
    await addUsualAccent(db, dup, 'Irish');
    await updatePerson(db, 'narrator', dup, { notes: 'warm voice', is_favorite: 1 });
    await updatePerson(db, 'narrator', keep, { notes: 'great' });
    await addLink(db, 'narrator', dup, 'site', 'https://x.test');
    const plan = await narratorMergePlan(db, keep, dup);
    expect(plan.fields.find((f) => f.key === 'notes')!.mode).toBe('both');
    expect(plan.items.map((i) => i.group)).toEqual(expect.arrayContaining(['Other names', 'Usual accents', 'Books', 'Listens']));
    const choice = planChoice(plan);
    choice.leave.push(plan.items.find((i) => i.label === 'Jojo')!.key);
    await mergeNarrators(db, keep, dup, choice);
    const d = (await getNarrator(db, keep))!;
    expect(d.listens.map((l) => l.title).sort()).toEqual(['Audio A', 'Audio B']);
    expect(d.aliases.map((x) => x.name).sort()).toEqual(['J. Smith', 'Joanna']);
    expect(d.usualAccents.map((x) => x.name)).toEqual(['Irish']);
    expect(d.core.notes).toBe('great\n\nwarm voice');
    expect(d.core.is_favorite).toBe(1);
    expect(d.core.links).toHaveLength(1);
    expect(await getNarrator(db, dup)).toBeNull();
  });

  it('with no choices everything comes across and blanks are filled', async () => {
    const keep = await createNarrator(db, 'A'), dup = await createNarrator(db, 'B');
    await updatePerson(db, 'narrator', dup, { notes: 'n' });
    await addLink(db, 'narrator', dup, 'site', 'https://x.test');
    await mergeNarrators(db, keep, dup);
    const d = (await getNarrator(db, keep))!;
    expect(d.core.notes).toBe('n');
    expect(d.core.links).toHaveLength(1);
    await expect(mergeNarrators(db, keep, keep)).rejects.toThrow();
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import * as ch from '../src/repo/challenges';
import * as cat from '../src/repo/challengeCategories';

let db: Db;
beforeEach(() => { db = migrateNodeDb(); });
const mk = (name: string, year = 2027) => ch.createGrid(db, { year, name, prompts: ['x'] });
// The page as text: "[Maps: A, B]" for a category, "C" for a loose challenge.
const shape = async (year = 2027) => {
  const list = await ch.listChallenges(db, year);
  const name = (id: string) => list.find((c) => c.id === id)?.name ?? '?';
  return (await cat.listLayout(db, year)).map((i) => i.kind === 'category' ? `[${i.name}: ${i.members.map(name).join(', ')}]` : name(i.id)).join(' | ');
};

describe('challenge categories', () => {
  it('creates categories at the end, in order, with no empty or duplicate names', async () => {
    await mk('A'); await mk('B');
    await cat.createCategory(db, 2027, ' Maps ');
    await cat.createCategory(db, 2027, 'Bingo');
    await mk('C'); // a new challenge goes last, after the categories
    expect(await shape()).toBe('A | B | [Maps: ] | [Bingo: ] | C');
    await expect(cat.createCategory(db, 2027, '  ')).rejects.toThrow('name');
    await expect(cat.createCategory(db, 2027, 'maps')).rejects.toThrow('already a category');
  });
  it('puts challenges into a category in order, and takes them out again', async () => {
    const a = await mk('A'); const b = await mk('B'); const c = await mk('C');
    const maps = await cat.createCategory(db, 2027, 'Maps');
    await cat.placeChallenge(db, a, maps, null);
    await cat.placeChallenge(db, c, maps, null);
    await cat.placeChallenge(db, b, maps, c); // before C
    expect(await shape()).toBe('[Maps: A, B, C]');
    await cat.placeChallenge(db, b, null, null); // out, to the end
    expect(await shape()).toBe('[Maps: A, C] | B');
    await cat.placeChallenge(db, c, null, maps); // out, before the category
    expect(await shape()).toBe('C | [Maps: A] | B');
    const sum = await ch.listChallenges(db, 2027);
    expect(sum.find((x) => x.id === a)?.categoryId).toBe(maps);
    expect(sum.find((x) => x.id === b)?.categoryId).toBeNull();
  });
  it('moves categories, with loose challenges before, between and after them', async () => {
    const a = await mk('A'); const b = await mk('B');
    const m = await cat.createCategory(db, 2027, 'Maps');
    const t = await cat.createCategory(db, 2027, 'Tropes');
    expect(await shape()).toBe('A | B | [Maps: ] | [Tropes: ]');
    await cat.moveCategory(db, t, a);
    expect(await shape()).toBe('[Tropes: ] | A | B | [Maps: ]');
    await cat.moveCategory(db, m, b);
    expect(await shape()).toBe('[Tropes: ] | A | [Maps: ] | B');
    await cat.moveCategory(db, t, null);
    expect(await shape()).toBe('A | [Maps: ] | B | [Tropes: ]');
    await cat.placeChallenge(db, a, m, null);
    await cat.moveCategory(db, t, a); // a challenge inside a category counts as that category
    expect(await shape()).toBe('[Tropes: ] | [Maps: A] | B');
  });
  it('moveChallenge drops into the category of the challenge it goes before', async () => {
    const a = await mk('A'); const b = await mk('B'); const c = await mk('C');
    const m = await cat.createCategory(db, 2027, 'Maps');
    await cat.placeChallenge(db, a, m, null); await cat.placeChallenge(db, b, m, null);
    await ch.moveChallenge(db, c, b);
    expect(await shape()).toBe('[Maps: A, C, B]');
    await ch.moveChallenge(db, c, null); // last in its own category
    expect(await shape()).toBe('[Maps: A, B, C]');
  });
  it('deleting a category keeps its challenges, loose, where the category was', async () => {
    const a = await mk('A'); const b = await mk('B'); const c = await mk('C'); await mk('D');
    const m = await cat.createCategory(db, 2027, 'Maps');
    await cat.placeChallenge(db, b, m, null); await cat.placeChallenge(db, c, m, null);
    await cat.moveCategory(db, m, a);
    expect(await shape()).toBe('[Maps: B, C] | A | D');
    await cat.deleteCategory(db, m);
    expect(await shape()).toBe('B | C | A | D');
    expect((await ch.listChallenges(db, 2027)).every((x) => x.categoryId === null)).toBe(true);
    await expect(cat.renameCategory(db, m, 'X')).rejects.toThrow('no longer exists');
  });
  it('renames, and keeps years apart', async () => {
    const m = await cat.createCategory(db, 2027, 'Maps');
    await cat.renameCategory(db, m, 'Map challenges');
    await cat.createCategory(db, 2028, 'Map challenges'); // another year may reuse the name
    expect(await shape()).toBe('[Map challenges: ]');
    const z = await mk('Z', 2028);
    await expect(cat.placeChallenge(db, z, m, null)).rejects.toThrow('no longer exists');
  });
});

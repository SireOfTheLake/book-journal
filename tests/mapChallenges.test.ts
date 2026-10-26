import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { createBook } from '../src/repo/books';
import { createRead, updateRead } from '../src/repo/bookLog';
import { clearSlot, fillSlot, getChallenge, listChallenges } from '../src/repo/challenges';
import { createMap, createUsMap, setAustralia, setBonusMode, setMapLimit, setSlotPlace, setUkSplit } from '../src/repo/usmap';

let db: Db;
beforeEach(() => { db = migrateNodeDb(); });
const Y = new Date().getFullYear();
const read = async (t: string) => { const r = await createRead(db, await createBook(db, { title: t, authors: ['A'] }), 'finished'); await updateRead(db, r, { finish_date: `${Y}-03-10` }); return r; };
const slot = async (id: string, label: string) => (await getChallenge(db, id))!.loose.find((s) => s.label === label)!;

describe('map challenges', () => {
  it('Canada: 10 provinces count and 3 territories are optional bonus', async () => {
    const id = await createMap(db, { year: Y, name: 'CA', region: 'canada' });
    const c = (await getChallenge(db, id))!;
    expect(c.total).toBe(10);
    expect(c.loose).toHaveLength(13);
    await fillSlot(db, (await slot(id, 'Ontario')).id, await read('a'));
    await fillSlot(db, (await slot(id, 'Yukon')).id, await read('b'));
    const d = (await getChallenge(db, id))!;
    expect(d.done).toBe(1);
    expect(d.bonus).toEqual({ done: 1, total: 3 });
    expect((await listChallenges(db, Y))[0].bonus).toEqual({ done: 1, total: 3 });
  });
  it('required bonus joins the goal; not included hides it', async () => {
    const id = await createMap(db, { year: Y, name: 'CA', region: 'canada' });
    await setBonusMode(db, id, 'required');
    expect((await getChallenge(db, id))!.total).toBe(13);
    await setBonusMode(db, id, 'off');
    const c = (await getChallenge(db, id))!;
    expect(c.total).toBe(10);
    expect(c.loose).toHaveLength(10);
    expect(c.bonus).toBeNull();
  });
  it('the US map starts without bonus and can add DC and the territories', async () => {
    const id = await createUsMap(db, { year: Y, name: 'US' });
    expect((await getChallenge(db, id))!.loose).toHaveLength(50);
    await setBonusMode(db, id, 'optional');
    const c = (await getChallenge(db, id))!;
    expect(c.loose).toHaveLength(56);
    expect(c.total).toBe(50);
    expect(c.bonus?.total).toBe(6);
  });
  it('continents: 6 count, Antarctica is bonus, Oceania can be called Australia', async () => {
    const id = await createMap(db, { year: Y, name: 'C', region: 'continents' });
    expect((await getChallenge(db, id))!.total).toBe(6);
    await fillSlot(db, (await slot(id, 'Oceania')).id, await read('o'));
    await setAustralia(db, id, true);
    const c = (await getChallenge(db, id))!;
    expect(c.loose.some((s) => s.label === 'Australia' && s.fill)).toBe(true);
    expect(c.loose.some((s) => s.label === 'Oceania')).toBe(false);
  });
  it('limited: N boxes, a box without a place does not count, each place once', async () => {
    const id = await createMap(db, { year: Y, name: 'W', region: 'world', limit: 20 });
    let c = (await getChallenge(db, id))!;
    expect(c.loose).toHaveLength(20);
    expect(c.total).toBe(20);
    await fillSlot(db, c.loose[0].id, await read('x'));
    expect((await getChallenge(db, id))!.done).toBe(0);
    await setSlotPlace(db, c.loose[0].id, 'France');
    expect((await getChallenge(db, id))!.done).toBe(1);
    await expect(setSlotPlace(db, c.loose[1].id, 'France')).rejects.toThrow('already used');
    await expect(setSlotPlace(db, c.loose[1].id, 'Narnia')).rejects.toThrow('not one of');
    await setSlotPlace(db, c.loose[0].id, null);
    expect((await getChallenge(db, id))!.done).toBe(0);
  });
  it('changes N and switches between limited and every place', async () => {
    const id = await createMap(db, { year: Y, name: 'E', region: 'europe', limit: 5 });
    await setMapLimit(db, id, 8);
    expect((await getChallenge(db, id))!.loose).toHaveLength(8);
    const c = (await getChallenge(db, id))!;
    await fillSlot(db, c.loose[0].id, await read('p'));
    await setSlotPlace(db, c.loose[0].id, 'Spain');
    await fillSlot(db, c.loose[1].id, await read('q')); // no place
    expect(await setMapLimit(db, id, null)).toBe(1);
    const d = (await getChallenge(db, id))!;
    expect(d.mapLimit).toBeNull();
    expect(d.loose.find((s) => s.label === 'Spain')?.fill).toBeTruthy();
    expect(d.done).toBe(1);
    await clearSlot(db, (await slot(id, 'Spain')).id);
    await expect(setMapLimit(db, id, 9999)).rejects.toThrow('Pick a number');
  });
  it('limited bonus places are just extra choices', async () => {
    const id = await createMap(db, { year: Y, name: 'CA', region: 'canada', limit: 3 });
    const c = (await getChallenge(db, id))!;
    await setSlotPlace(db, c.loose[0].id, 'Nunavut');
    await fillSlot(db, c.loose[0].id, await read('n'));
    expect((await getChallenge(db, id))!.done).toBe(1);
    await setBonusMode(db, id, 'off');
    await expect(setSlotPlace(db, c.loose[1].id, 'Yukon')).rejects.toThrow('not one of');
  });
});

describe('the United Kingdom', () => {
  it('can be one place or four nations on the world and Europe maps', async () => {
    const id = await createMap(db, { year: Y, name: 'E', region: 'europe' });
    const names = async () => (await getChallenge(db, id))!.loose.map((s) => s.label);
    expect(await names()).toContain('United Kingdom');
    await setUkSplit(db, id, true);
    const split = await names();
    expect(split).not.toContain('United Kingdom');
    expect(split).toEqual(expect.arrayContaining(['England', 'Northern Ireland', 'Scotland', 'Wales']));
    expect((await getChallenge(db, id))!.total).toBe(split.length);
    await setUkSplit(db, id, false);
    expect(await names()).toContain('United Kingdom');
    expect(await names()).not.toContain('Wales');
  });
  it('keeps a book through a split and a merge, and refuses a merge that would lose books', async () => {
    const id = await createMap(db, { year: Y, name: 'W', region: 'world' });
    await fillSlot(db, (await slot(id, 'United Kingdom')).id, await read('uk'));
    await setUkSplit(db, id, true);
    expect((await slot(id, 'England')).fill).toBeTruthy();
    await fillSlot(db, (await slot(id, 'Wales')).id, await read('w'));
    await expect(setUkSplit(db, id, false)).rejects.toThrow('More than one nation');
    await clearSlot(db, (await slot(id, 'England')).id);
    await setUkSplit(db, id, false);
    expect((await slot(id, 'United Kingdom')).fill).toBeTruthy();
  });
  it('limited maps offer the nations as places, and other maps ignore the option', async () => {
    const id = await createMap(db, { year: Y, name: 'W', region: 'world', limit: 2, ukSplit: true });
    const c = (await getChallenge(db, id))!;
    expect(c.ukSplit).toBe(true);
    await setSlotPlace(db, c.loose[0].id, 'Scotland');
    await expect(setSlotPlace(db, c.loose[1].id, 'United Kingdom')).rejects.toThrow('not one of');
    const af = await createMap(db, { year: Y, name: 'A', region: 'africa', ukSplit: true });
    expect((await getChallenge(db, af))!.ukSplit).toBe(false);
  });
  it('keeps the Australia option when the UK is split', async () => {
    const id = await createMap(db, { year: Y, name: 'C', region: 'continents', australia: true });
    expect((await getChallenge(db, id))!).toMatchObject({ australia: true, ukSplit: false });
    await expect(setUkSplit(db, id, true)).rejects.toThrow('United Kingdom');
  });
});

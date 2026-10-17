import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { ACCENTS } from '../src/domain/challenges';
import { pickMapColor, shapeOf, STATE_NAMES } from '../src/domain/usMap';
import { STATE_SHAPES } from '../src/domain/usStates';
import { createBook } from '../src/repo/books';
import { createRead, updateRead } from '../src/repo/bookLog';
import { clearSlot, fillSlot, getChallenge, listChallengeChoices, listChallenges } from '../src/repo/challenges';
import { getMonthlyDashboard } from '../src/repo/dashboard';
import { createUsMap, rerollStateColor } from '../src/repo/usmap';

let db: Db;
beforeEach(() => { db = migrateNodeDb(); });
const Y = 2026;
async function read(title: string, finish: string | null = `${Y}-03-10`) {
  const r = await createRead(db, await createBook(db, { title, authors: ['A'] }), 'finished');
  if (finish) await updateRead(db, r, { finish_date: finish });
  return r;
}
const slotOf = async (id: string, state: string) => (await getChallenge(db, id))!.loose.find((s) => s.label === state)!;

describe('the map data', () => {
  it('has the 50 states, with Alaska and Hawaii, and no extras', () => {
    expect(STATE_SHAPES).toHaveLength(50);
    expect(STATE_NAMES).toContain('Alaska');
    expect(STATE_NAMES).toContain('Hawaii');
    expect(STATE_NAMES).not.toContain('District of Columbia');
    expect(new Set(STATE_NAMES).size).toBe(50);
    for (const s of STATE_SHAPES) { expect(s.d.startsWith('M')).toBe(true); expect(s.box[2]).toBeGreaterThan(0); expect(s.box[3]).toBeGreaterThan(0); }
    expect(shapeOf('Texas')).not.toBeNull();
    expect(shapeOf('Narnia')).toBeNull();
  });
});

describe('a random color for a state', () => {
  it('picks among the colors used the fewest times', () => {
    expect(ACCENTS).toContain(pickMapColor([], () => 0.5));
    const all = ACCENTS.slice(0, 11);
    expect(pickMapColor(all, () => 0)).toBe(ACCENTS[11]);
    expect(pickMapColor([...ACCENTS, ACCENTS[0]], () => 0)).toBe(ACCENTS[1]);
    expect(pickMapColor([null, 'nonsense'], () => 0.99)).toBe(ACCENTS[11]);
  });
  it('uses every color before repeating one', () => {
    const used: string[] = [];
    for (let i = 0; i < 12; i++) used.push(pickMapColor(used));
    expect(new Set(used).size).toBe(12);
  });
});

describe('a US map challenge', () => {
  it('is a Grid challenge with 50 state prompts, alphabetical, flagged as a map', async () => {
    const id = await createUsMap(db, { year: Y, name: 'Across America' });
    const c = (await getChallenge(db, id))!;
    expect(c.usMap).toBe(true);
    expect(c.kind).toBe('grid');
    expect(c.loose.map((s) => s.label)).toEqual([...STATE_NAMES]);
    expect(c.total).toBe(50);
    expect(c.done).toBe(0);
    const [sum] = await listChallenges(db, Y);
    expect(sum).toMatchObject({ name: 'Across America', usMap: true, total: 50 });
    await expect(createUsMap(db, { year: Y, name: '  ' })).rejects.toThrow('Give the challenge a name.');
  });
  it('fills a state with a random color when a book is put on it, and empties it when the book comes off', async () => {
    const id = await createUsMap(db, { year: Y, name: 'Map' });
    const tx = await slotOf(id, 'Texas');
    expect(tx.color).toBeNull();
    await fillSlot(db, tx.id, await read('Giant'), () => 0);
    expect((await slotOf(id, 'Texas')).color).toBe(ACCENTS[0]);
    expect((await getChallenge(db, id))!.done).toBe(1);
    await clearSlot(db, tx.id);
    expect((await slotOf(id, 'Texas')).color).toBeNull();
  });
  it('gives different states different colors until all twelve are used', async () => {
    const id = await createUsMap(db, { year: Y, name: 'Map' });
    const c = (await getChallenge(db, id))!;
    for (const s of c.loose.slice(0, 12)) await fillSlot(db, s.id, await read(`Book ${s.label}`, null));
    const colors = (await getChallenge(db, id))!.loose.filter((s) => s.fill).map((s) => s.color);
    expect(colors).toHaveLength(12);
    expect(new Set(colors).size).toBe(12);
  });
  it('keeps the color when another book takes the same state, and clears a state a read moves away from', async () => {
    const id = await createUsMap(db, { year: Y, name: 'Map' });
    const ohio = await slotOf(id, 'Ohio'); const utah = await slotOf(id, 'Utah');
    const r1 = await read('One'); const r2 = await read('Two');
    await fillSlot(db, ohio.id, r1, () => 0);
    const first = (await slotOf(id, 'Ohio')).color;
    await fillSlot(db, ohio.id, r2);
    expect((await slotOf(id, 'Ohio')).color).toBe(first);
    expect((await slotOf(id, 'Ohio')).fill?.title).toBe('Two');
    await fillSlot(db, utah.id, r2); // the same read moves from Ohio to Utah
    expect((await slotOf(id, 'Ohio')).fill).toBeNull();
    expect((await slotOf(id, 'Ohio')).color).toBeNull();
    expect((await slotOf(id, 'Utah')).color).not.toBeNull();
    expect((await getChallenge(db, id))!.done).toBe(1);
  });
  it('rolls a new color for a state on request, never the same one', async () => {
    const id = await createUsMap(db, { year: Y, name: 'Map' });
    const s = await slotOf(id, 'Maine');
    await fillSlot(db, s.id, await read('Pine'), () => 0);
    const before = (await slotOf(id, 'Maine')).color;
    const after = await rerollStateColor(db, s.id, () => 0);
    expect(after).not.toBe(before);
    expect((await slotOf(id, 'Maine')).color).toBe(after);
  });
  it('only rerolls states of a map', async () => {
    const { createGrid } = await import('../src/repo/challenges');
    const g = await createGrid(db, { year: Y, name: 'G', prompts: ['x'] });
    const x = (await getChallenge(db, g))!.loose[0];
    await expect(rerollStateColor(db, x.id)).rejects.toThrow('not a state');
  });
  it('shows its states in the Book Log choices, and fills from there', async () => {
    const id = await createUsMap(db, { year: Y, name: 'Map' });
    const r = await read('Atlas');
    const ch = (await listChallengeChoices(db, r, [Y])).find((c) => c.id === id)!;
    expect(ch.slots).toHaveLength(50);
    expect(ch.word).toBe(false);
    await fillSlot(db, ch.slots.find((s) => s.label === 'Nevada')!.id, r);
    expect((await slotOf(id, 'Nevada')).color).not.toBeNull();
  });
  it('appears on the monthly dashboard as the state in its color', async () => {
    const id = await createUsMap(db, { year: Y, name: 'Map' });
    await fillSlot(db, (await slotOf(id, 'Idaho')).id, await read('Potato'), () => 0);
    const d = await getMonthlyDashboard(db, Y, 3);
    const st = d.stickers.find((s) => s.label === 'Idaho')!;
    expect(st.usMap).toBe(true);
    expect(st.color).toBe(ACCENTS[0]);
  });
});

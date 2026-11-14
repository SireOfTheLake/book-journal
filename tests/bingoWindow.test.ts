import { describe, expect, it } from 'vitest';
import { migrateNodeDb } from '../src/db/nodeDb';
import * as bg from '../src/repo/bingo';
import * as ch from '../src/repo/challenges';
import { loadRandomizer } from '../src/repo/randomizer';
import { loadExtras } from '../src/repo/boardGame';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const plus = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const Y = new Date().getFullYear();
const make = async (db: any, name: string, from: string | null, until: string | null, publish = true) => {
  const bank = await bg.createBank(db, `B ${name}`, Array.from({ length: 30 }, (_, i) => `${name} prompt ${i}`));
  const id = await bg.createBingo(db, { year: Y, name, bankId: bank });
  if (publish) await bg.publishBingo(db, id);
  await ch.setActiveWindow(db, id, from, until);
  return id;
};

describe('timed Bingo boards in the Prompt Randomizer and the Board Game', () => {
  it('only offer a board while today is inside its dates (no dates means always)', async () => {
    const db = migrateNodeDb();
    await make(db, 'Now', plus(-3), plus(3));
    await make(db, 'Later', plus(10), plus(20));
    await make(db, 'Over', plus(-20), plus(-10));
    await make(db, 'Open', null, null);
    const names = (await loadRandomizer(db, Y)).challenges.map((c) => c.name).sort();
    expect(names).toEqual(['Now', 'Open']);
    const extra = new Set(((await loadExtras(db, Y)).challenge ?? []).map((c) => c.challenge));
    expect(extra.has('Now')).toBe(true); expect(extra.has('Open')).toBe(true);
    expect(extra.has('Later')).toBe(false); expect(extra.has('Over')).toBe(false);
  });
  it('the Book Log picker is not narrowed (a book can still be put on any board)', async () => {
    const db = migrateNodeDb();
    await make(db, 'Later', plus(10), plus(20));
    expect((await ch.listChallengeChoices(db, '', [Y])).map((c) => c.name)).toEqual(['Later']);
  });
});

describe('Bingo starting soon', () => {
  it('lists boards that start within a week, soonest first, drafts included', async () => {
    const db = migrateNodeDb();
    await make(db, 'Tomorrow', plus(1), plus(30));
    await make(db, 'Friday', plus(5), plus(30), false);
    await make(db, 'Far', plus(8), plus(30));
    await make(db, 'Running', plus(-1), plus(30));
    await make(db, 'Undated', null, null);
    const soon = await ch.listStartingSoon(db, plus(0));
    expect(soon.map((s) => [s.name, s.days, s.published])).toEqual([['Tomorrow', 1, true], ['Friday', 5, false]]);
  });
});

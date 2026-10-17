import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { createBook } from '../src/repo/books';
import { createRead } from '../src/repo/bookLog';
import * as ch from '../src/repo/challenges';
import { getHome } from '../src/repo/home';
import { copyYearlyGoals, getOverview, listGoals, listHomeGoals, saveGoal } from '../src/repo/goals';

let db: Db;
beforeEach(() => { db = migrateNodeDb(); });
const TODAY = '2026-10-15';

async function setup() {
  const one = await ch.createGrid(db, { year: 2026, name: 'Cozy', prompts: ['A', 'B', 'C', 'D'] });
  const two = await ch.createGrid(db, { year: 2026, name: 'Spicy', prompts: ['X', 'Y'] });
  const three = await ch.createGrid(db, { year: 2026, name: 'Old', prompts: ['Q'] });
  const b = await createBook(db, { title: 'Book', authors: ['Au'] });
  const r = await createRead(db, b, 'finished');
  const s1 = (await ch.getChallenge(db, one))!.loose;
  const s2 = (await ch.getChallenge(db, two))!.loose;
  await ch.fillSlot(db, s1[0].id, r); await ch.fillSlot(db, s2[0].id, r);
  return { one, two, three };
}

describe('challenge goals', () => {
  it('tracks every challenge of the year, with the target taken from their prompts', async () => {
    await setup();
    await saveGoal(db, 2026, { metric: 'challenges', target: 0 });
    const o = await getOverview(db, 2026, TODAY);
    expect(o.yearly[0]).toMatchObject({ label: 'Complete my challenges', value: 2, target: 7, challenge_ids: null });
  });
  it('tracks one challenge, or a chosen group of them', async () => {
    const { one, two, three } = await setup();
    await saveGoal(db, 2026, { metric: 'challenges', target: 0, label: 'Just Cozy', challenge_ids: [one] });
    await saveGoal(db, 2026, { metric: 'challenges', target: 0, label: 'Two of three', challenge_ids: [one, two] });
    const o = await getOverview(db, 2026, TODAY);
    expect(o.yearly.map((g) => [g.label, g.value, g.target])).toEqual([['Just Cozy', 1, 4], ['Two of three', 2, 6]]);
    void three;
  });
  it('follows the challenges as they change, and copes with having none', async () => {
    const { one } = await setup();
    const id = await saveGoal(db, 2026, { metric: 'challenges', target: 0, challenge_ids: [one] });
    await ch.addPrompt(db, one, null, 'E');
    expect((await getOverview(db, 2026, TODAY)).yearly[0]).toMatchObject({ value: 1, target: 5 });
    await ch.deleteChallenge(db, one);
    const g = (await getOverview(db, 2026, TODAY)).yearly[0];
    expect(g).toMatchObject({ id, value: 0, target: 0, pace: { percent: 0, text: 'No challenges to track yet' } });
  });
  it('still insists on a target for other goals', async () => {
    await expect(saveGoal(db, 2026, { metric: 'books', target: 0 })).rejects.toThrow('target');
  });
});

describe('goals on Home', () => {
  it('shows only goals ticked for Home, with the chosen display', async () => {
    await setup();
    await saveGoal(db, 2026, { metric: 'books', target: 10, label: 'Hidden' });
    await saveGoal(db, 2026, { metric: 'challenges', target: 0, label: 'Ring one', show_on_home: true, display: 'ring' });
    await saveGoal(db, 2026, { metric: 'books', target: 10, label: 'Bar one', show_on_home: true, display: 'bar' });
    const home = await listHomeGoals(db, TODAY);
    expect(home.map((g) => [g.label, g.display])).toEqual([['Ring one', 'ring'], ['Bar one', 'bar']]);
    expect((await getHome(db, TODAY)).goals.map((g) => g.label)).toEqual(['Ring one', 'Bar one']);
    expect((await listHomeGoals(db, '2027-01-02'))).toEqual([]);
  });
  it('edits the Home settings, and keeps them when goals are copied to next year', async () => {
    await saveGoal(db, 2026, { metric: 'books', target: 5, label: 'Read', show_on_home: true, display: 'bar' });
    const [g] = await listGoals(db, 2026);
    await saveGoal(db, 2026, { id: g.id, metric: 'books', target: 5, label: 'Read', show_on_home: false });
    expect((await listGoals(db, 2026))[0]).toMatchObject({ show_on_home: false, display: 'ring' });
    await saveGoal(db, 2026, { id: g.id, metric: 'books', target: 5, label: 'Read', show_on_home: true, display: 'bar' });
    await copyYearlyGoals(db, 2026, 2027);
    expect((await listGoals(db, 2027))[0]).toMatchObject({ show_on_home: true, display: 'bar' });
  });
});

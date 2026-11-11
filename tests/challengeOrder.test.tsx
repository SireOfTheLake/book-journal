// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import * as ch from '../src/repo/challenges';
import ChallengesView from '../src/pages/ChallengesView';

afterEach(cleanup);
let db: Db;
beforeEach(() => { db = migrateNodeDb(); });
const names = async () => (await ch.listChallenges(db, 2027)).map((c) => c.name);

describe('reordering challenges', () => {
  it('moves a challenge before another or to the end and keeps the order', async () => {
    const a = await ch.createGrid(db, { year: 2027, name: 'A', prompts: ['x'] });
    const b = await ch.createGrid(db, { year: 2027, name: 'B', prompts: ['x'] });
    const c = await ch.createGrid(db, { year: 2027, name: 'C', prompts: ['x'] });
    expect(await names()).toEqual(['A', 'B', 'C']);
    await ch.moveChallenge(db, c, a);
    expect(await names()).toEqual(['C', 'A', 'B']);
    await ch.moveChallenge(db, c, null);
    expect(await names()).toEqual(['A', 'B', 'C']);
    await ch.moveChallenge(db, a, c);
    expect(await names()).toEqual(['B', 'A', 'C']);
    const other = await ch.createGrid(db, { year: 2028, name: 'Z', prompts: ['x'] });
    await expect(ch.moveChallenge(db, b, other)).rejects.toThrow('another year');
  });
  it('has earlier/later buttons and drag and drop on the cards', async () => {
    const a = await ch.createGrid(db, { year: 2027, name: 'A', prompts: ['x'] });
    await ch.createGrid(db, { year: 2027, name: 'B', prompts: ['x'] });
    const c = await ch.createGrid(db, { year: 2027, name: 'C', prompts: ['x'] });
    const list = await ch.listChallenges(db, 2027);
    const onMove = vi.fn(async () => {});
    render(<MemoryRouter><ChallengesView year={2027} list={list} banks={[]} onCreate={async () => {}} onNewBank={async () => {}} onMove={onMove} /></MemoryRouter>);
    expect((screen.getByLabelText('Move A earlier') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('Move A later'));
    expect(onMove).toHaveBeenLastCalledWith(a, c); // A goes before C, so it lands after B
    fireEvent.click(screen.getByLabelText('Move C later') as HTMLButtonElement);
    expect(onMove).toHaveBeenCalledTimes(1); // C is last: the button is disabled
    fireEvent.click(screen.getByLabelText('Move B later'));
    expect(onMove).toHaveBeenLastCalledWith(list[1].id, null);
    const dt = { setData() {}, effectAllowed: '' };
    const wrap = (n: string) => screen.getByText(n).closest('.chalwrap')!;
    fireEvent.dragStart(wrap('C'), { dataTransfer: dt });
    fireEvent.dragOver(wrap('A'), { dataTransfer: dt });
    fireEvent.drop(wrap('A'), { dataTransfer: dt });
    expect(onMove).toHaveBeenLastCalledWith(c, a);
  });
});

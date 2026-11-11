// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { createBook } from '../src/repo/books';
import { createRead, updateRead } from '../src/repo/bookLog';
import * as ch from '../src/repo/challenges';
import { exportChallenges } from '../src/repo/challengeExport';
import GridView, { type GridActions } from '../src/pages/challenges/GridView';

afterEach(cleanup);
let db: Db;
beforeEach(() => { db = migrateNodeDb(); });
const labels = async (id: string) => { const c = (await ch.getChallenge(db, id))!; return { rows: c.groups.map((g) => g.slots.map((s) => s.label)), extras: c.loose.map((s) => s.label) }; };
const make = () => ch.createPyramid(db, { year: 2027, name: 'Series Pyramid', rows: ['Standalone', 'Duology', 'Trilogy'], extras: ['Series Starter', 'Series Finale'] });

describe('pyramid challenge', () => {
  it('row N has N prompts named after the row, plus an extras section', async () => {
    const id = await make();
    expect(await labels(id)).toEqual({ rows: [['Standalone slot 1'], ['Duology slot 1', 'Duology slot 2'], ['Trilogy slot 1', 'Trilogy slot 2', 'Trilogy slot 3']], extras: ['Series Starter', 'Series Finale'] });
    const c = (await ch.getChallenge(db, id))!;
    expect(c.pyramid).toBe(true); expect(c.kind).toBe('grid'); expect(c.total).toBe(8);
    expect((await ch.listChallenges(db, 2027))[0].pyramid).toBe(true);
    expect((await exportChallenges(db, { pictures: false })).challenges[0].type).toBe('Pyramid');
  });
  it('adding, renaming, moving and deleting rows keeps every row the right size and keeps books', async () => {
    const id = await make();
    await ch.addGroup(db, id, 'Quartet');
    expect((await labels(id)).rows[3]).toEqual(['Quartet slot 1', 'Quartet slot 2', 'Quartet slot 3', 'Quartet slot 4']);
    const g = (await ch.getChallenge(db, id))!.groups;
    await ch.renameGroup(db, g[1].id, 'Two-Book');
    expect((await labels(id)).rows[1]).toEqual(['Two-Book slot 1', 'Two-Book slot 2']);
    const b = await createBook(db, { title: 'Dua', authors: ['A'] }); const r = await createRead(db, b, 'finished'); await updateRead(db, r, { finish_date: '2027-01-02' });
    await ch.fillSlot(db, g[2].slots[2].id, r); // Trilogy slot 3
    await ch.moveRow(db, g[2].id, -1); // Trilogy becomes row 2: it shrinks and its third slot goes, with the book
    let l = await labels(id);
    expect(l.rows.map((x) => x.length)).toEqual([1, 2, 3, 4]);
    expect(l.rows[1][0]).toBe('Trilogy slot 1');
    expect((await ch.getChallenge(db, id))!.groups[1].slots.every((s) => !s.fill)).toBe(true);
    await ch.deleteGroup(db, g[0].id);
    l = await labels(id);
    expect(l.rows.map((x) => x.length)).toEqual([1, 2, 3]);
    expect((await ch.getChallenge(db, id))!.total).toBe(6 + 2);
  });
  it('refuses to edit pyramid prompts by hand but extras work like a grid, optional and limited', async () => {
    const id = await make();
    const c = (await ch.getChallenge(db, id))!;
    await expect(ch.addPrompt(db, id, c.groups[0].id, 'x')).rejects.toThrow('Add or remove a row');
    await expect(ch.renamePrompt(db, c.groups[1].slots[0].id, 'x')).rejects.toThrow('Add or remove a row');
    await expect(ch.deletePrompt(db, c.groups[1].slots[0].id)).rejects.toThrow('Add or remove a row');
    await expect(ch.movePrompt(db, c.loose[0].id, c.groups[0].id, null)).rejects.toThrow('cannot be moved');
    await ch.addPrompt(db, id, null, 'Extra three');
    await ch.setPromptOptional(db, (await ch.getChallenge(db, id))!.loose[2].id, true);
    await ch.setLimit(db, id, { required: 5, allowBonus: true });
    expect((await ch.getChallenge(db, id))!.required).toBe(5);
    await expect(ch.createPyramid(db, { year: 2027, name: 'P', rows: ['A', 'a'] })).rejects.toThrow('own title');
    await expect(ch.createPyramid(db, { year: 2027, name: 'P', rows: [] })).rejects.toThrow('at least one row');
  });
  it('shows the rows as locked prompts with the extras below', async () => {
    const id = await make();
    const c = (await ch.getChallenge(db, id))!;
    const act = { fill: vi.fn(), clear: vi.fn(), search: async () => [], rename: vi.fn(), color: vi.fn(), remove: vi.fn(), addGroup: vi.fn(), renameGroup: vi.fn(), groupColor: vi.fn(), removeGroup: vi.fn(), addPrompt: vi.fn(), renamePrompt: vi.fn(), removePrompt: vi.fn(), cardCols: vi.fn(), moveCard: vi.fn(), shuffleCards: vi.fn(), movePrompt: vi.fn(), shufflePrompts: vi.fn(), moveRow: vi.fn() } as unknown as GridActions;
    render(<MemoryRouter><GridView challenge={c} covers={{}} act={act} /></MemoryRouter>);
    expect(screen.getByText('Duology slot 2')).toBeTruthy();
    expect(screen.getByText('Extra prompts')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.queryByLabelText('Prompt: Duology slot 2')).toBeNull(); // locked
    expect(screen.getByLabelText('New row')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Move Trilogy up'));
    expect(act.moveRow).toHaveBeenCalledWith(c.groups[2].id, -1);
  });
});

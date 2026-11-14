// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { DbContext } from '../src/db/DbContext';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import * as ch from '../src/repo/challenges';
import * as cat from '../src/repo/challengeCategories';
import ChallengesPage from '../src/pages/ChallengesPage';
import { YearContext } from '../src/ui/Shell';

afterEach(cleanup);
let db: Db;
beforeEach(() => { db = migrateNodeDb(); });
const mk = (name: string) => ch.createGrid(db, { year: 2027, name, prompts: ['x'] });
const dt = () => ({ effectAllowed: '', setData() {}, getData: () => '' });
const dragOnto = (from: HTMLElement, to: HTMLElement) => { const d = dt(); fireEvent.dragStart(from, { dataTransfer: d }); fireEvent.dragOver(to, { dataTransfer: d }); fireEvent.drop(to, { dataTransfer: d }); };
const shape = async () => {
  const list = await ch.listChallenges(db, 2027);
  const name = (id: string) => list.find((c) => c.id === id)?.name;
  return (await cat.listLayout(db, 2027)).map((i) => i.kind === 'category' ? `[${i.name}: ${i.members.map(name).join(',')}]` : name(i.id)).join(' | ');
};
const page = () => render(<DbContext.Provider value={db}><YearContext.Provider value={2027}><MemoryRouter><ChallengesPage /></MemoryRouter></YearContext.Provider></DbContext.Provider>);
const wrap = (name: string) => screen.getByText(name, { selector: '.gname-sm' }).closest('.chalwrap') as HTMLElement;

it('adds a category, drags challenges into it and around, drags the category, and deletes it', async () => {
  await mk('Alpha'); await mk('Beta'); await mk('Gamma');
  page();
  await screen.findByText('Alpha');
  fireEvent.click(screen.getByRole('button', { name: '+ New category' }));
  fireEvent.change(screen.getByLabelText('New category name'), { target: { value: 'Maps' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add category' }));
  const section = await screen.findByRole('region', { name: 'Category Maps' });
  expect(within(section).getByText('Drag challenges here.')).toBeTruthy();
  dragOnto(wrap('Beta'), section); // onto the category: goes in
  await waitFor(async () => expect(await shape()).toBe('Alpha | Gamma | [Maps: Beta]'));
  dragOnto(wrap('Gamma'), wrap('Beta')); // onto a card in the category: goes in before it
  await waitFor(async () => expect(await shape()).toBe('Alpha | [Maps: Gamma,Beta]'));
  dragOnto(screen.getByRole('region', { name: 'Category Maps' }).querySelector('header') as HTMLElement, wrap('Alpha')); // the category goes before the loose card
  await waitFor(async () => expect(await shape()).toBe('[Maps: Gamma,Beta] | Alpha'));
  dragOnto(wrap('Beta'), wrap('Alpha')); // out of the category, before a loose card
  await waitFor(async () => expect(await shape()).toBe('[Maps: Gamma] | Beta | Alpha'));
  fireEvent.click(screen.getByRole('button', { name: 'Delete category Maps' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Delete category Maps' }));
  await waitFor(async () => expect(await shape()).toBe('Gamma | Beta | Alpha'));
  expect(screen.queryByRole('region', { name: 'Category Maps' })).toBeNull();
});
it('shows an error for a duplicate category name and renames a category', async () => {
  await mk('Alpha');
  await cat.createCategory(db, 2027, 'Maps');
  page();
  await screen.findByRole('region', { name: 'Category Maps' });
  fireEvent.click(screen.getByRole('button', { name: '+ New category' }));
  fireEvent.change(screen.getByLabelText('New category name'), { target: { value: 'maps' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add category' }));
  expect((await screen.findByRole('alert')).textContent).toMatch(/already a category/);
  fireEvent.click(screen.getByRole('button', { name: 'Rename category Maps' }));
  fireEvent.change(screen.getByLabelText('Category name'), { target: { value: 'Map challenges' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByRole('region', { name: 'Category Map challenges' });
});
it('has earlier/later buttons for categories and for challenges inside one', async () => {
  const a = await mk('Alpha'); const b = await mk('Beta');
  const m = await cat.createCategory(db, 2027, 'Maps');
  await cat.placeChallenge(db, a, m, null); await cat.placeChallenge(db, b, m, null);
  const t = await cat.createCategory(db, 2027, 'Tropes');
  page();
  await screen.findByRole('region', { name: 'Category Tropes' });
  fireEvent.click(screen.getByLabelText('Move category Tropes earlier'));
  await waitFor(async () => expect(await shape()).toBe('[Tropes: ] | [Maps: Alpha,Beta]'));
  fireEvent.click(screen.getByLabelText('Move Alpha later'));
  await waitFor(async () => expect(await shape()).toBe('[Tropes: ] | [Maps: Beta,Alpha]'));
  expect(t).toBeTruthy();
});

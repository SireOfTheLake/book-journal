// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DbContext } from '../src/db/DbContext';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { createBook } from '../src/repo/books';
import { createRead, updateRead } from '../src/repo/bookLog';
import * as ch from '../src/repo/challenges';
import ChallengePage from '../src/pages/ChallengePage';
import ChallengesPage from '../src/pages/ChallengesPage';

afterEach(cleanup);
let db: Db;
beforeEach(() => { db = migrateNodeDb(); });
const ui = (path: string) => render(
  <DbContext.Provider value={db}><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="journal/challenges" element={<ChallengesPage />} /><Route path="journal/challenges/:id" element={<ChallengePage />} /><Route path="*" element={<Outlet />} />
  </Routes></MemoryRouter></DbContext.Provider>);
async function seedBooks() {
  const a = await createBook(db, { title: 'Hooks In', authors: ['Ann Author'] }); await createRead(db, a, 'reading');
  const b = await createBook(db, { title: 'Quiet Done', authors: ['Bo Writer'] }); const r = await createRead(db, b, 'finished'); await updateRead(db, r, { finish_date: '2026-02-02' });
}
const grid = () => ch.createGrid(db, { year: new Date().getFullYear(), name: '100 Prompts', prompts: ['Free pick'], groups: [{ name: 'Main Character', prompts: ['A baker', 'A spy'] }] });

describe('challenge screens', () => {
  it('creates a grid with a sub-category from the form and opens it', async () => {
    ui('/journal/challenges');
    fireEvent.click(await screen.findByRole('button', { name: '+ New challenge' }));
    fireEvent.change(screen.getByPlaceholderText('100 Prompts'), { target: { value: 'Cozy Grid' } });
    fireEvent.click(screen.getByRole('button', { name: '+ Add a sub-category' }));
    fireEvent.change(screen.getByPlaceholderText('Main Character'), { target: { value: 'Setting' } });
    const boxes = screen.getAllByRole('textbox');
    fireEvent.change(boxes[boxes.length - 1], { target: { value: 'A castle\nA beach' } });
    fireEvent.change(boxes[2], { target: { value: 'Anything goes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create challenge' }));
    await screen.findByRole('heading', { name: 'Cozy Grid' });
    expect(screen.getByText('0/3')).toBeTruthy();
    expect(screen.getByText('3 left')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Setting' })).toBeTruthy();
  });
  it('shows an error instead of creating an empty challenge', async () => {
    ui('/journal/challenges');
    fireEvent.click(await screen.findByRole('button', { name: '+ New challenge' }));
    fireEvent.change(screen.getByDisplayValue('Reading Challenge'), { target: { value: ' ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create challenge' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/name/i);
  });
  it('starts with a name that fits the kind of challenge chosen, until you type your own', async () => {
    ui('/journal/challenges');
    fireEvent.click(await screen.findByRole('button', { name: '+ New challenge' }));
    expect(screen.getByDisplayValue('Reading Challenge')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Bingo' }));
    expect(screen.getByDisplayValue('Bingo')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sticker' }));
    expect(screen.getByDisplayValue('Sticker Challenge')).toBeTruthy();
    fireEvent.change(screen.getByDisplayValue('Sticker Challenge'), { target: { value: 'My Own' } });
    fireEvent.click(screen.getByRole('button', { name: 'Word builder' }));
    expect(screen.getByDisplayValue('My Own')).toBeTruthy();
  });
  it('lists the year\'s challenges with progress', async () => {
    await grid();
    ui('/journal/challenges');
    expect(await screen.findByText('100 Prompts')).toBeTruthy();
    expect(screen.getByText('0/3')).toBeTruthy();
  });
  it('picks a book for a prompt (in progress first), updates the tracker, and clears it', async () => {
    await seedBooks();
    const id = await grid();
    ui(`/journal/challenges/${id}`);
    await screen.findByText('A baker');
    fireEvent.click(screen.getByRole('button', { name: 'Add a book for A baker' }));
    const dlg = await screen.findByRole('dialog', { name: 'Choose a book' });
    await waitFor(() => expect(within(dlg).getAllByRole('button', { name: /by|Hooks|Quiet/ }).length).toBeGreaterThan(1));
    const picks = within(dlg).getAllByText(/Hooks In|Quiet Done/).map((e) => e.textContent);
    expect(picks).toEqual(['Hooks In', 'Quiet Done']);
    fireEvent.change(within(dlg).getByLabelText('Search books'), { target: { value: 'quiet' } });
    await waitFor(() => expect(within(dlg).queryByText('Hooks In')).toBeNull());
    fireEvent.click(within(dlg).getByText('Quiet Done'));
    await waitFor(() => expect(screen.getByText('1/3')).toBeTruthy());
    expect(screen.getByText('33%')).toBeTruthy();
    expect(screen.getByText('2 left')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Take Quiet Done off A baker' }));
    await waitFor(() => expect(screen.getByText('0/3')).toBeTruthy());
  });
  it('edits prompts and sub-categories, with a confirm before deleting', async () => {
    const id = await grid();
    ui(`/journal/challenges/${id}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    const box = screen.getByLabelText('Prompt: A spy');
    fireEvent.change(box, { target: { value: 'A thief' } }); fireEvent.blur(box);
    await screen.findByDisplayValue('A thief');
    fireEvent.change(screen.getByLabelText('New prompt for this sub-category'), { target: { value: 'A king' } });
    fireEvent.click(within(screen.getByRole('region', { name: 'Main Character' })).getByRole('button', { name: 'Add prompt' }));
    await screen.findByDisplayValue('A king');
    expect(screen.getByText('0/4')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Delete prompt A king' }));
    expect(screen.getByDisplayValue('A king')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Keep' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Delete prompt A king' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete it' }));
    await waitFor(() => expect(screen.queryByDisplayValue('A king')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Color for Main Character #4f8a8b' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Color for Main Character #4f8a8b' }).getAttribute('aria-pressed')).toBe('true'));
  });
  it('deletes a whole challenge after a confirm', async () => {
    const id = await grid();
    ui(`/journal/challenges/${id}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete challenge' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete the whole challenge' }));
    await waitFor(() => expect(screen.getByText(/No challenges for/)).toBeTruthy());
  });
});

describe('arranging in Edit mode', () => {
  const order = () => screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'));
  it('shows no arranging controls until Edit', async () => {
    const id = await grid();
    ui(`/journal/challenges/${id}`);
    await screen.findByText('A baker');
    expect(screen.queryByRole('group', { name: /Arrange/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getAllByRole('group', { name: /Arrange/ })).toHaveLength(2);
  });
  it('makes a card narrower and wider, and full width again', async () => {
    const id = await grid();
    ui(`/journal/challenges/${id}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    const card = within(screen.getByRole('region', { name: 'Main Character' }));
    expect(card.getByText('Full width')).toBeTruthy();
    fireEvent.click(card.getByRole('button', { name: 'Make Main Character narrower' }));
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Main Character' })).getByText('6 books wide')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Make Main Character narrower' }));
    await waitFor(() => expect(screen.getByText('5 books wide')).toBeTruthy());
    expect((screen.getByRole('region', { name: 'Main Character' }) as HTMLElement).style.getPropertyValue('--cols')).toBe('5');
    fireEvent.click(screen.getByRole('button', { name: 'Full width for Main Character' }));
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Main Character' })).getByText('Full width')).toBeTruthy());
  });
  it('moves cards earlier and later, by button and by dragging the grip', async () => {
    const id = await grid(); // cards: main prompts (the name), Main Character
    await ch.addGroup(db, id, 'Cover');
    ui(`/journal/challenges/${id}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    expect(order()).toEqual(['Main prompts', 'Main Character', 'Cover']);
    fireEvent.click(screen.getByRole('button', { name: 'Move Cover earlier' }));
    await waitFor(() => expect(order()).toEqual(['Main prompts', 'Cover', 'Main Character']));
    fireEvent.click(screen.getByRole('button', { name: 'Move Main prompts later' }));
    await waitFor(() => expect(order()).toEqual(['Cover', 'Main prompts', 'Main Character']));
    const grip = within(screen.getByRole('region', { name: 'Main Character' })).getByText(/Drag/);
    fireEvent.dragStart(grip);
    fireEvent.dragOver(screen.getByRole('region', { name: 'Cover' }));
    fireEvent.drop(screen.getByRole('region', { name: 'Cover' }));
    await waitFor(() => expect(order()).toEqual(['Main Character', 'Cover', 'Main prompts']));
  });
  it('drags a prompt before another, into another card, and puts a card in random order', async () => {
    const id = await grid();
    const g2 = await ch.addGroup(db, id, 'Cover');
    ui(`/journal/challenges/${id}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    const items = (name: string) => within(screen.getByRole('region', { name })).getAllByRole('textbox').map((i) => (i as HTMLInputElement).value).filter((v) => /^A /.test(v));
    expect(items('Main Character')).toEqual(['A baker', 'A spy']);
    const spyLi = screen.getByLabelText('Prompt: A spy').closest('li')!;
    const bakerLi = screen.getByLabelText('Prompt: A baker').closest('li')!;
    fireEvent.dragStart(spyLi); fireEvent.dragOver(bakerLi); fireEvent.drop(bakerLi);
    await waitFor(() => expect(items('Main Character')).toEqual(['A spy', 'A baker']));
    fireEvent.dragStart(screen.getByLabelText('Prompt: A baker').closest('li')!);
    const cover = screen.getByRole('region', { name: 'Cover' });
    fireEvent.dragOver(cover); fireEvent.drop(cover);
    await waitFor(() => expect(items('Cover')).toEqual(['A baker']));
    expect(items('Main Character')).toEqual(['A spy']);
    expect(g2).toBeTruthy();
    fireEvent.click(within(screen.getByRole('region', { name: 'Main prompts' })).getByRole('button', { name: 'Random order for Main prompts' }));
    await screen.findByLabelText('Prompt: Free pick');
  });
  it('without sub-categories a sticker challenge has a card of stickers next to a card of covers', async () => {
    const id = await ch.createSticker(db, { year: new Date().getFullYear(), name: 'S', stickers: [{ prompt: 'one', image: { dataUrl: 'data:a' } }] });
    ui(`/journal/challenges/${id}`);
    await screen.findByRole('region', { name: 'Stickers' });
    expect(document.querySelectorAll('.gslot .sticker')).toHaveLength(0);
    expect(document.querySelectorAll('.stickersheet .sticker')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Add a book for one' })).toBeTruthy();
    const cards = [...document.querySelectorAll('.gcards > .gcard')].map((e) => e.getAttribute('aria-label'));
    expect(cards).toEqual(['Stickers', 'S']); // side by side, stickers first
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const before = (screen.getByRole('region', { name: 'Stickers' }) as HTMLElement).style.getPropertyValue('--cols');
    fireEvent.click(screen.getByRole('button', { name: 'Make Stickers wider' }));
    await waitFor(() => expect((screen.getByRole('region', { name: 'Stickers' }) as HTMLElement).style.getPropertyValue('--cols')).toBe(String(Number(before) + 1)));
    expect((screen.getByRole('region', { name: 'S' }) as HTMLElement).style.getPropertyValue('--cols')).toBe('5');
  });
  it('with sub-categories each sticker sits above its cover', async () => {
    const id = await ch.createSticker(db, { year: new Date().getFullYear(), name: 'S', groups: [{ name: 'Heroes', color: '#c4683d' }], stickers: [{ prompt: 'one', image: { dataUrl: 'data:a' }, group: 'Heroes' }] });
    ui(`/journal/challenges/${id}`);
    await screen.findByRole('region', { name: 'Heroes' });
    const tile = document.querySelector('.gslot')!;
    expect([...tile.children].map((e) => e.className.split(' ')[0]).slice(0, 2)).toEqual(['sticker', 'gframe']);
    expect(document.querySelector('.stickersheet')).toBeNull();
  });
});

describe('uniform cards', () => {
  it('reserves the same room under every cover, with or without a book, and uses a plain x to take a book off', async () => {
    await seedBooks();
    const id = await grid();
    ui(`/journal/challenges/${id}`);
    await screen.findByText('A baker');
    const rows = () => [...document.querySelectorAll('.gslot')].map((li) => li.querySelectorAll('.gbook').length);
    expect(rows().every((n) => n === 1)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Add a book for A baker' }));
    fireEvent.click(await within(await screen.findByRole('dialog', { name: 'Choose a book' })).findByText('Hooks In'));
    const x = await screen.findByRole('button', { name: 'Take Hooks In off A baker' });
    expect(x.textContent).toBe('×');
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
    expect(rows().every((n) => n === 1)).toBe(true);
    expect(screen.getByText('Hooks In', { selector: 'a' }).getAttribute('title')).toBe('Hooks In');
  });
});

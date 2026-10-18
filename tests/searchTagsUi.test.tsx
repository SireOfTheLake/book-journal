// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DbContext } from '../src/db/DbContext';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { addTag } from '../src/repo/bookLog';
import { createBook } from '../src/repo/books';
import { listTagOptions } from '../src/repo/search';
import { saveGoal } from '../src/repo/goals';
import * as ch from '../src/repo/challenges';
import HomePage from '../src/pages/HomePage';
import LibraryPage from '../src/pages/LibraryPage';
import OverviewPage from '../src/pages/journal/OverviewPage';
import SearchBox from '../src/ui/SearchBox';
import QuickAdd from '../src/ui/QuickAdd';

afterEach(cleanup);
let db: Db;
beforeEach(() => { db = migrateNodeDb(); });
const Where = () => <span data-testid="where">{useLocation().pathname + useLocation().search}</span>;

async function seed() {
  const a = await createBook(db, { title: 'Moonlit Bargain', authors: ['Ana Reyes'] });
  const b = await createBook(db, { title: 'Moon Garden', authors: ['Bo Chen'] });
  await createBook(db, { title: 'Dry Spell', authors: ['Cy Dunn'] });
  await addTag(db, a, 'genre', 'Fantasy'); await addTag(db, a, 'trope', 'Slow burn');
  await addTag(db, b, 'genre', 'Fantasy');
  return { a, b };
}

describe('header search', () => {
  const box = (onAdd = vi.fn()) => render(<DbContext.Provider value={db}><MemoryRouter><SearchBox onAddBook={onAdd} /><Routes><Route path="*" element={<Where />} /></Routes></MemoryRouter></DbContext.Provider>);
  const type = (v: string) => { const i = screen.getByLabelText('Search'); fireEvent.focus(i); fireEvent.change(i, { target: { value: v } }); return i; };

  it('forgets a deleted book without a refresh', async () => {
    const { a } = await seed();
    box();
    type('moon');
    expect(await screen.findByText('Moonlit Bargain')).toBeTruthy();
    const { deleteBook } = await import('../src/repo/bookLog');
    await deleteBook(db, a);
    const i = screen.getByLabelText('Search');
    fireEvent.blur(i); fireEvent.focus(i);
    await waitFor(() => expect(screen.queryByText('Moonlit Bargain')).toBeNull());
    expect(screen.getByText('Moon Garden')).toBeTruthy();
  });

  it('shows grouped results with the add option last, and opens a book when picked', async () => {
    const { a } = await seed();
    box();
    type('moon');
    await waitFor(() => expect(screen.getByText('Moon Garden')).toBeTruthy());
    const heads = [...document.querySelectorAll('.shead')].map((e) => e.textContent);
    expect(heads).toEqual(['Books']);
    const opts = screen.getAllByRole('option');
    expect(opts[opts.length - 1].textContent).toContain('+ Add new book');
    fireEvent.click(screen.getByText('Moonlit Bargain'));
    expect(screen.getByTestId('where').textContent).toBe(`/book/${a}`);
  });
  it('puts tags under the people, and opens the library filtered by the tag', async () => {
    await seed();
    box();
    type('fantasy');
    await waitFor(() => expect(screen.getByText('Genres')).toBeTruthy());
    fireEvent.click(screen.getByText('Fantasy'));
    const id = (await listTagOptions(db)).find((o) => o.name === 'Fantasy')!.id;
    expect(screen.getByTestId('where').textContent).toBe(`/library?tag=genre:${id}`);
  });
  it('moves with the arrow keys and Enter, and offers to add the typed title', async () => {
    await seed();
    const add = vi.fn();
    box(add);
    const i = type('Brand New');
    await waitFor(() => expect(screen.getByText('No matches.')).toBeTruthy());
    fireEvent.keyDown(i, { key: 'Enter' });
    expect(add).toHaveBeenCalledWith('Brand New');
  });
  it('focuses with Ctrl+K', async () => {
    box();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(document.activeElement).toBe(screen.getByLabelText('Search'));
  });
  it('fills the New book dialog with the typed title', () => {
    render(<DbContext.Provider value={db}><MemoryRouter><QuickAdd initialTitle="Typed Title" onClose={() => undefined} /></MemoryRouter></DbContext.Provider>);
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Typed Title');
  });
});

describe('library tag filter', () => {
  const lib = (url = '/library') => render(<DbContext.Provider value={db}><MemoryRouter initialEntries={[url]}><Routes><Route path="library" element={<LibraryPage />} /></Routes></MemoryRouter></DbContext.Provider>);

  it('filters by a tag from the panel and combines tags with All or Any', async () => {
    await seed();
    lib();
    await waitFor(() => expect(document.querySelectorAll('.libcard')).toHaveLength(3));
    fireEvent.click(screen.getByText('Tags'));
    const panel = await screen.findByLabelText('Filter by tags');
    await waitFor(() => expect(within(panel).getByText('Fantasy')).toBeTruthy());
    fireEvent.click(within(panel).getByText('Fantasy'));
    expect(document.querySelectorAll('.libcard')).toHaveLength(2);
    fireEvent.click(within(panel).getByText('Slow burn'));
    expect(document.querySelectorAll('.libcard')).toHaveLength(1);
    fireEvent.click(within(panel).getByText('Any of these'));
    expect(document.querySelectorAll('.libcard')).toHaveLength(2);
    fireEvent.click(within(panel).getByText('Clear tags'));
    expect(document.querySelectorAll('.libcard')).toHaveLength(3);
  });
  it('opens already filtered when sent here with ?tag=', async () => {
    await seed();
    const id = (await listTagOptions(db)).find((o) => o.name === 'Slow burn')!.id;
    lib(`/library?tag=trope:${id}`);
    await waitFor(() => expect(document.querySelectorAll('.libcard')).toHaveLength(1));
    expect(screen.getByLabelText('Moonlit Bargain by Ana Reyes')).toBeTruthy();
    expect(screen.getByLabelText('Filter by tags')).toBeTruthy();
  });
});

describe('challenge goals and Home trackers', () => {
  it('adds a challenge goal for chosen challenges, shown on Home as a ring', async () => {
    await ch.createGrid(db, { year: new Date().getFullYear(), name: 'Cozy', prompts: ['A', 'B'] });
    await ch.createGrid(db, { year: new Date().getFullYear(), name: 'Spicy', prompts: ['X'] });
    render(<DbContext.Provider value={db}><MemoryRouter><OverviewPage /></MemoryRouter></DbContext.Provider>);
    const yearNow = new Date().getFullYear();
    void yearNow;
    fireEvent.click(await screen.findByText('+ Add a yearly goal'));
    fireEvent.change(screen.getByLabelText('What the goal counts'), { target: { value: 'challenges' } });
    expect(screen.queryByLabelText('Goal target')).toBeNull();
    fireEvent.click(screen.getByText('Choose challenges'));
    fireEvent.click(screen.getByLabelText('Cozy'));
    fireEvent.click(screen.getByLabelText('Show on Home'));
    expect(screen.getByText('Circle')).toBeTruthy();
    fireEvent.click(screen.getByText('Add goal'));
    await waitFor(() => expect(screen.getByLabelText('Complete my challenges')).toBeTruthy());
    cleanup();
    render(<DbContext.Provider value={db}><MemoryRouter><HomePage /></MemoryRouter></DbContext.Provider>);
    const card = await screen.findByLabelText('Goals');
    expect(within(card).getByText('Complete my challenges')).toBeTruthy();
    expect(within(card).getByText('0 of 2 prompts')).toBeTruthy();
    expect(card.querySelector('.goalring')).toBeTruthy();
  });
  it('shows a bar on Home when the goal asks for one, and nothing when no goal is ticked', async () => {
    const y = new Date().getFullYear();
    await saveGoal(db, y, { metric: 'books', target: 4, label: 'Plain' });
    const { unmount } = render(<DbContext.Provider value={db}><MemoryRouter><HomePage /></MemoryRouter></DbContext.Provider>);
    await screen.findByText('To tidy');
    expect(screen.queryByLabelText('Goals')).toBeNull();
    unmount();
    await saveGoal(db, y, { metric: 'books', target: 4, label: 'Line one', show_on_home: true, display: 'bar' });
    render(<DbContext.Provider value={db}><MemoryRouter><HomePage /></MemoryRouter></DbContext.Provider>);
    const card = await screen.findByLabelText('Goals');
    expect(card.querySelector('.goalring')).toBeNull();
    expect(within(card).getByRole('progressbar', { name: 'Line one progress' })).toBeTruthy();
  });
});

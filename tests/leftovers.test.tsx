// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DbContext } from '../src/db/DbContext';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { createBook } from '../src/repo/books';
import { createRead, updateBook, updateRead } from '../src/repo/bookLog';
import { setFormatRelease } from '../src/repo/series';
import { listShelf } from '../src/repo/shelf';
import { getReason, promptSuggestions, setReason } from '../src/repo/reason';
import DashboardPage from '../src/pages/DashboardPage';
import BookLogPage from '../src/pages/BookLogPage';
import ShelfPage from '../src/pages/ShelfPage';
import Shell from '../src/ui/Shell';

afterEach(cleanup);
let db: Db;
beforeEach(() => { db = migrateNodeDb(); });
const Y = new Date().getFullYear();
const iso = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

describe('favorites on the dashboard', () => {
  it('shows five, then the rest after Show more, and back with Show less', async () => {
    for (let i = 1; i <= 8; i++) {
      const b = await createBook(db, { title: `Fav ${i}`, authors: ['Ann'] });
      await updateBook(db, b, { is_favorite: 1 });
      const r = await createRead(db, b, 'finished');
      await updateRead(db, r, { finish_date: `${Y}-03-${String(i).padStart(2, '0')}` });
    }
    render(<DbContext.Provider value={db}><MemoryRouter><DashboardPage /></MemoryRouter></DbContext.Provider>);
    fireEvent.click(screen.getByRole('tab', { name: 'Yearly' }));
    const card = (await screen.findByText('Favorites')).closest('.bcard') as HTMLElement;
    await waitFor(() => expect(card.querySelectorAll('.favline')).toHaveLength(5));
    fireEvent.click(within(card).getByRole('button', { name: 'Show more (3 more)' }));
    expect(card.querySelectorAll('.favline')).toHaveLength(8);
    fireEvent.click(within(card).getByRole('button', { name: 'Show less' }));
    expect(card.querySelectorAll('.favline')).toHaveLength(5);
  });
  it('has no button when there are five or fewer', async () => {
    const b = await createBook(db, { title: 'Only', authors: ['Ann'] });
    await updateBook(db, b, { is_favorite: 1 });
    const r = await createRead(db, b, 'finished');
    await updateRead(db, r, { finish_date: `${Y}-03-04` });
    render(<DbContext.Provider value={db}><MemoryRouter><DashboardPage /></MemoryRouter></DbContext.Provider>);
    fireEvent.click(screen.getByRole('tab', { name: 'Yearly' }));
    const card = (await screen.findByText('Favorites')).closest('.bcard') as HTMLElement;
    await within(card).findByText('Only');
    expect(within(card).queryByRole('button')).toBeNull();
  });
});

describe('books that just came out', () => {
  it('are marked on the shelf for 30 days, unless something else is still to come', async () => {
    const id = await createBook(db, { title: 'Fresh', authors: ['X'], shelf: 'tbr' });
    const released = async () => (await listShelf(db))[0].released;
    expect(await released()).toBeNull();
    await setFormatRelease(db, id, 'ebook', iso(-3));
    expect(await released()).toBe(iso(-3));
    await setFormatRelease(db, id, 'audio', iso(20));
    expect(await released()).toBeNull();
    await setFormatRelease(db, id, 'audio', iso(-1));
    expect(await released()).toBe(iso(-1));
    await setFormatRelease(db, id, 'audio', null);
    await setFormatRelease(db, id, 'ebook', iso(-90));
    expect(await released()).toBeNull();
  });
  it('shows an "Out now" chip and a working Start button', async () => {
    const id = await createBook(db, { title: 'Fresh', authors: ['X'], shelf: 'tbr' });
    await setFormatRelease(db, id, 'ebook', iso(-2));
    render(<DbContext.Provider value={db}><MemoryRouter><ShelfPage /></MemoryRouter></DbContext.Provider>);
    await screen.findByText(/Out now/);
    expect((screen.getByLabelText('Start Fresh') as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('prompt suggestions', () => {
  const read = async (title: string) => createRead(db, await createBook(db, { title, authors: ['A'] }), 'reading');
  it('lists earlier Trick or Treat prompts, most used first, without the current one', async () => {
    const a = await read('A'), b = await read('B'), c = await read('C'), d = await read('D');
    await setReason(db, a, { kind: 'trick', prompt: 'Read a 700 page book' });
    await setReason(db, b, { kind: 'trick', prompt: 'Read a 700 page book' });
    await setReason(db, c, { kind: 'trick', prompt: 'Pick the oldest TBR' });
    await setReason(db, d, { kind: 'treat', prompt: 'Spicy romance' });
    expect(await promptSuggestions(db, 'trick')).toEqual(['Read a 700 page book', 'Pick the oldest TBR']);
    expect(await promptSuggestions(db, 'trick', 'read a 700 page book')).toEqual(['Pick the oldest TBR']);
    expect(await promptSuggestions(db, 'treat')).toEqual(['Spicy romance']);
    expect((await getReason(db, c)).suggestions).toEqual(['Read a 700 page book']);
  });
  it('shows them as buttons on the Book Log that fill in the prompt', async () => {
    const a = await read('A');
    await setReason(db, a, { kind: 'treat', prompt: 'Spicy romance' });
    const bookId = await createBook(db, { title: 'New One', authors: ['A'] });
    const rid = await createRead(db, bookId, 'reading');
    await setReason(db, rid, { kind: 'treat' });
    render(<DbContext.Provider value={db}><MemoryRouter initialEntries={[`/book/${bookId}/${rid}`]}><Routes><Route path="book/:bookId/:readId" element={<BookLogPage />} /></Routes></MemoryRouter></DbContext.Provider>);
    fireEvent.click(await screen.findByRole('button', { name: 'Spicy romance' }));
    await waitFor(async () => expect((await getReason(db, rid)).prompt).toBe('Spicy romance'));
  });
});

describe('sidebar icons', () => {
  it('puts an icon on every link without changing the link names', () => {
    render(<DbContext.Provider value={db}><MemoryRouter><Routes><Route element={<Shell />}><Route index element={<div />} /></Route></Routes></MemoryRouter></DbContext.Provider>);
    const nav = screen.getByRole('navigation', { name: 'Main' });
    const links = within(nav).getAllByRole('link');
    expect(links.length).toBe(22);
    for (const l of links) expect(l.querySelector('svg.ico[aria-hidden="true"]'), l.textContent ?? '').toBeTruthy();
    expect(within(nav).getByRole('link', { name: 'Home' })).toBeTruthy();
    expect(within(nav).getByRole('link', { name: 'Settings and themes' })).toBeTruthy();
  });
});

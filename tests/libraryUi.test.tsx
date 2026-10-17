// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DbContext } from '../src/db/DbContext';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { applyNotionPlan } from '../src/import/apply';
import { planNotionBooks } from '../src/import/notion';
import { setBookCover, updateBook, updateRead } from '../src/repo/bookLog';
import { listLibrary } from '../src/repo/library';
import ImportPage from '../src/pages/ImportPage';
import LibraryPage from '../src/pages/LibraryPage';
import LibraryView from '../src/pages/LibraryView';

afterEach(cleanup);
let db: Db;
beforeEach(async () => {
  db = migrateNodeDb();
  await applyNotionPlan(db, planNotionBooks(readFileSync(resolve(process.cwd(), 'tests/fixtures/book-tracker.csv'), 'utf8')), { tagDestinations: {} });
});
const bookId = async (t: string) => (await db.select<{ id: string }>('SELECT id FROM book WHERE title = ?', [t]))[0].id;

async function show(opts: { covers?: Record<string, string>; pageSize?: number } = {}) {
  const requestCovers = vi.fn(); const addBook = vi.fn(async () => undefined);
  render(<MemoryRouter><LibraryView books={await listLibrary(db)} covers={opts.covers ?? {}} requestCovers={requestCovers} act={{ addBook }} pageSize={opts.pageSize} /></MemoryRouter>);
  return { requestCovers, addBook };
}
const cards = () => document.querySelectorAll('.libcard');
const coverSrc = (label: RegExp) => screen.getByLabelText(label).querySelector('img.libimg')?.getAttribute('src') ?? null;

describe('the Library', () => {
  it('shows every book as a card with its status, and links to its Book Log', async () => {
    await show();
    expect(cards()).toHaveLength(15);
    expect(screen.getByText('15 of 15 books')).toBeTruthy();
    const card = screen.getByLabelText('Egotistical Puckboy by Eden Finley, Saxon James');
    expect(within(card).getByText('Read')).toBeTruthy();
    expect(within(card).getByText('Puckboys')).toBeTruthy();
    const rid = (await db.select<{ id: string }>("SELECT r.id AS id FROM read r JOIN book b ON b.id = r.book_id WHERE b.title = 'Egotistical Puckboy'"))[0].id;
    expect(card.getAttribute('href')).toBe(`/book/${await bookId('Egotistical Puckboy')}/${rid}`);
    expect(screen.getByLabelText(/^Hooks In/).getAttribute('href')).toBe(`/book/${await bookId('Hooks In')}`); // no read yet
  });
  it('searches as you type, across authors and series too', async () => {
    await show();
    fireEvent.change(screen.getByLabelText('Search the library'), { target: { value: 'puckboy eden' } });
    expect(cards()).toHaveLength(2);
    expect(screen.getByText('2 of 15 books')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search the library'), { target: { value: 'zzzz' } });
    expect(screen.getByText('No books match these filters.')).toBeTruthy();
  });
  it('filters by status, favorites, and missing cover', async () => {
    await updateBook(db, await bookId('Hush'), { is_favorite: 1 });
    await setBookCover(db, await bookId('Hush'), { dataUrl: 'data:image/png;base64,AAA' });
    await show();
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'up_next' } });
    expect(cards()).toHaveLength(3);
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'all' } });
    fireEvent.click(screen.getByText('Favorites'));
    expect(cards()).toHaveLength(1);
    fireEvent.click(screen.getByText('Favorites'));
    fireEvent.click(screen.getByText('No cover'));
    expect(cards()).toHaveLength(14);
  });
  it('sorts the cards', async () => {
    await show();
    const first = () => cards()[0].getAttribute('aria-label');
    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'finished' } });
    expect(first()).toMatch(/^(Corner Office|Murder at Pirate’s Cove)/); // finished 2026-10-08, the newest
    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'title' } });
    expect(first()).toMatch(/^68 Whiskey/);
  });
  it('shows a page at a time and loads covers only for the books on screen', async () => {
    const ids = await Promise.all(['68 Whiskey', 'Bro Doll', 'Hush', 'Hooks In'].map(bookId));
    for (const id of ids) await setBookCover(db, id, { dataUrl: 'data:image/png;base64,AAA' });
    const { requestCovers } = await show({ pageSize: 5 });
    expect(cards()).toHaveLength(5);
    expect(requestCovers).toHaveBeenCalled();
    const asked = requestCovers.mock.calls.flatMap((c) => c[0] as string[]);
    expect(asked.every((id) => ids.includes(id))).toBe(true); // only books that have a cover
    const onScreen = [...cards()].map((c) => c.getAttribute('aria-label')!);
    expect(asked.length).toBe(ids.filter((_, i) => onScreen.some((l) => l.startsWith(['68 Whiskey', 'Bro Doll', 'Hush', 'Hooks In'][i]))).length);
    fireEvent.click(screen.getByText('Show 5 more (10 left)'));
    expect(cards()).toHaveLength(10);
    fireEvent.click(screen.getByText('Show 5 more (5 left)'));
    expect(cards()).toHaveLength(15);
    expect(screen.queryByText(/more \(/)).toBeNull();
  });
  it('shows the real cover when it has loaded, and a generated one otherwise', async () => {
    const id = await bookId('Hush');
    await setBookCover(db, id, { dataUrl: 'data:image/png;base64,AAA' });
    await show({ covers: { [id]: 'data:image/png;base64,AAA' } });
    expect(coverSrc(/^Hush/)).toBe('data:image/png;base64,AAA');
    expect(coverSrc(/^Bro Doll/)).toBeNull();
    expect(within(screen.getByLabelText(/^Bro Doll/)).getByText('BRO DOLL')).toBeTruthy();
  });
  it('offers to find covers when books are missing them, and leaves the banner out when none are', async () => {
    await show();
    expect(screen.getByText('15 books have no cover yet.')).toBeTruthy();
    expect(screen.getByText('Find covers').getAttribute('href')).toBe('/import?tab=covers');
    cleanup();
    for (const b of await listLibrary(db)) await setBookCover(db, b.id, { dataUrl: 'data:image/png;base64,AAA' });
    await show();
    expect(screen.queryByText(/no cover yet/)).toBeNull();
  });
  it('switches to a list with each book on a row, including its rating and finish date', async () => {
    const rid = (await db.select<{ id: string }>("SELECT r.id AS id FROM read r JOIN book b ON b.id = r.book_id WHERE b.title = 'Hush'"))[0].id;
    await updateRead(db, rid, { rating: 16 });
    await show();
    fireEvent.click(screen.getByText('List'));
    expect(cards()).toHaveLength(0);
    expect(document.querySelectorAll('a.librow')).toHaveLength(15);
    expect(screen.getByText('Finished')).toBeTruthy();
    expect(screen.getByLabelText('4 of 5')).toBeTruthy();
  });
  it('adds a book from the row at the top, as TBR unless you choose otherwise', async () => {
    const { addBook } = await show();
    fireEvent.change(screen.getByLabelText('Add a book'), { target: { value: 'A Brand New Book' } });
    fireEvent.keyDown(screen.getByLabelText('Add a book'), { key: 'Enter' });
    await waitFor(() => expect(addBook).toHaveBeenCalledWith('A Brand New Book', 'tbr'));
    await waitFor(() => expect((screen.getByLabelText('Add a book') as HTMLInputElement).value).toBe(''));
    fireEvent.change(screen.getByLabelText('Add as'), { target: { value: 'reading' } });
    fireEvent.change(screen.getByLabelText('Add a book'), { target: { value: 'Another' } });
    fireEvent.click(screen.getByText('Add'));
    await waitFor(() => expect(addBook).toHaveBeenLastCalledWith('Another', 'reading'));
  });
  it('says so when the library is empty', async () => {
    render(<MemoryRouter><LibraryView books={[]} covers={{}} requestCovers={vi.fn()} act={{ addBook: vi.fn() }} /></MemoryRouter>);
    expect(screen.getByText(/Your library is empty/)).toBeTruthy();
  });
});

describe('the Library page', () => {
  it('loads the books, fetches covers for what is on screen, and shows a book added from the row', async () => {
    await setBookCover(db, await bookId('Hush'), { dataUrl: 'data:image/png;base64,HUSH' });
    render(<DbContext.Provider value={db}><MemoryRouter initialEntries={['/library']}><Routes><Route path="/library" element={<LibraryPage />} /></Routes></MemoryRouter></DbContext.Provider>);
    await waitFor(() => expect(cards()).toHaveLength(15));
    await waitFor(() => expect(coverSrc(/^Hush/)).toBe('data:image/png;base64,HUSH'));
    fireEvent.change(screen.getByLabelText('Add a book'), { target: { value: 'Typed Into The Library' } });
    fireEvent.keyDown(screen.getByLabelText('Add a book'), { key: 'Enter' });
    await waitFor(() => expect(cards()).toHaveLength(16));
    expect(screen.getByLabelText('Typed Into The Library')).toBeTruthy();
    expect((await listLibrary(db)).find((b) => b.title === 'Typed Into The Library')!.status).toBe('tbr');
  });
});

describe('the Import page', () => {
  it('opens on the Covers tab when the Library sends you there', async () => {
    render(<DbContext.Provider value={db}><MemoryRouter initialEntries={['/import?tab=covers']}><Routes><Route path="/import" element={<ImportPage />} /></Routes></MemoryRouter></DbContext.Provider>);
    expect(screen.getByRole('tab', { name: 'Covers' }).getAttribute('aria-selected')).toBe('true');
    await waitFor(() => expect(screen.getByText('Find covers')).toBeTruthy());
  });
  it('opens on Books by default', () => {
    render(<DbContext.Provider value={db}><MemoryRouter initialEntries={['/import']}><Routes><Route path="/import" element={<ImportPage />} /></Routes></MemoryRouter></DbContext.Provider>);
    expect(screen.getByRole('tab', { name: 'Books' }).getAttribute('aria-selected')).toBe('true');
  });
});

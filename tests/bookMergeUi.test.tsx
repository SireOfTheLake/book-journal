// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DbContext } from '../src/db/DbContext';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { createBook } from '../src/repo/books';
import { createRead, getBookLog, updateBook, updateRead } from '../src/repo/bookLog';
import BookLogPage from '../src/pages/BookLogPage';
import BookMergePage from '../src/pages/BookMergePage';

afterEach(cleanup);
let db: Db;
let a: string, b: string, ra: string;
beforeEach(async () => {
  db = migrateNodeDb();
  a = await createBook(db, { title: 'Dune', authors: ['Frank Herbert'] });
  b = await createBook(db, { title: 'Dune (Deluxe Edition)', authors: ['Frank Herbert'] });
  await createBook(db, { title: 'Emma', authors: ['Jane Austen'] });
  ra = await createRead(db, a, 'finished'); await updateRead(db, ra, { finish_date: '2026-02-01' });
  await updateBook(db, a, { page_count: 400, synopsis: 'Sand.' });
  await updateBook(db, b, { page_count: 412, synopsis: 'Spice.', heat_level: 2 });
});
const show = (path: string) => render(<DbContext.Provider value={db}><MemoryRouter initialEntries={[path]}><Routes>
  <Route path="book/:bookId/merge/:otherId" element={<BookMergePage />} />
  <Route path="book/:bookId/:readId" element={<BookLogPage />} /><Route path="book/:bookId" element={<p>BOOK PAGE</p>} /></Routes></MemoryRouter></DbContext.Provider>);

describe('the book menu', () => {
  it('has Delete and Merge in a [...] menu, and the old delete button is gone from the Status card', async () => {
    show(`/book/${a}/${ra}`);
    await screen.findByRole('button', { name: 'Book menu' });
    expect(screen.queryByRole('button', { name: 'Delete this book' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Book menu' }));
    expect(screen.getByRole('menuitem', { name: /Merge with another book/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Delete this book/ })).toBeTruthy();
  });
  it('suggests books with a similar title and goes to the review page for the one you pick', async () => {
    show(`/book/${a}/${ra}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Book menu' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Merge with another book/ }));
    const dlg = await screen.findByRole('dialog', { name: 'Merge with another book' });
    await within(dlg).findByRole('button', { name: 'Merge with Dune (Deluxe Edition)' });
    expect(within(dlg).queryByRole('button', { name: 'Merge with Emma' })).toBeNull();
    fireEvent.click(within(dlg).getByRole('button', { name: 'Merge with Dune (Deluxe Edition)' }));
    await screen.findByRole('heading', { name: 'MERGE BOOKS' });
  });
  it('can search all books when the title is not similar', async () => {
    show(`/book/${a}/${ra}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Book menu' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Merge with another book/ }));
    const box = await screen.findByLabelText('Search for a book');
    fireEvent.focus(box); fireEvent.change(box, { target: { value: 'emma' } });
    fireEvent.mouseDown(await screen.findByRole('option', { name: /Emma/ }));
    await screen.findByRole('heading', { name: 'MERGE BOOKS' });
  });
});

describe('the review page', () => {
  it('asks for a decision on every difference, fills the blanks, and merges when all are chosen', async () => {
    show(`/book/${a}/merge/${b}`);
    await screen.findByRole('heading', { name: 'MERGE BOOKS' });
    const merge = screen.getByRole('button', { name: 'Merge the books' }) as HTMLButtonElement;
    expect(merge.disabled).toBe(true);
    expect(screen.getByText(/3 decisions left/)).toBeTruthy(); // title, pages, synopsis
    const filled = screen.getByRole('region', { name: 'Filled in from the other book' });
    expect(within(filled).getByText('Heat level')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: "Title: Use this book's" }));
    fireEvent.click(screen.getByRole('radio', { name: "Pages: Use the other book's" }));
    expect(merge.disabled).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: 'Synopsis: Combine both, one after the other' }));
    expect(merge.disabled).toBe(false);
    expect(screen.queryByRole('radio', { name: /Pages: Combine/ })).toBeNull();
    fireEvent.click(merge);
    await screen.findByText('BOOK PAGE');
    const log = (await getBookLog(db, a))!;
    expect(log.book).toMatchObject({ title: 'Dune', page_count: 412, synopsis: 'Sand.\n\nSpice.', heat_level: 2 });
    expect(await getBookLog(db, b)).toBeNull();
  });
  it('lists the reads of both books and keeps only the ones left ticked', async () => {
    const rb = await createRead(db, b, 'finished'); await updateRead(db, rb, { finish_date: '2026-04-01', notes: 'The duplicate' });
    show(`/book/${a}/merge/${b}`);
    const reads = await screen.findByRole('region', { name: 'Reads to keep' });
    expect(within(reads).getByText('Reads to keep (2 of 2)')).toBeTruthy();
    expect(within(reads).getByText(/The duplicate/)).toBeTruthy();
    fireEvent.click(within(reads).getByRole('checkbox', { name: 'Keep Finished 2026-04-01 from Dune (Deluxe Edition)' }));
    expect(within(reads).getByText('Reads to keep (1 of 2)')).toBeTruthy();
    for (const [n, v] of [['Title', "Use this book's"], ['Pages', "Use this book's"], ['Synopsis', "Use this book's"]]) fireEvent.click(screen.getByRole('radio', { name: `${n}: ${v}` }));
    fireEvent.click(screen.getByRole('button', { name: 'Merge the books' }));
    await screen.findByText('BOOK PAGE');
    expect((await getBookLog(db, a))!.reads.map((r) => r.id)).toEqual([ra]);
  });
  it('Cancel changes nothing', async () => {
    show(`/book/${a}/merge/${b}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await screen.findByText('BOOK PAGE');
    expect(await getBookLog(db, b)).not.toBeNull();
  });
  it('says so when the other book is not there', async () => {
    show(`/book/${a}/merge/nope`);
    await waitFor(() => expect(screen.getByText(/could not be found/)).toBeTruthy());
  });
});

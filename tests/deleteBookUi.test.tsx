// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DbContext } from '../src/db/DbContext';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { createRead, updateRead } from '../src/repo/bookLog';
import { createBook } from '../src/repo/books';
import BookLogPage from '../src/pages/BookLogPage';

afterEach(cleanup);
let db: Db; let bookId = ''; let readId = '';
beforeEach(async () => {
  db = migrateNodeDb();
  bookId = await createBook(db, { title: 'Doomed Book', authors: ['Someone'] });
  readId = await createRead(db, bookId, 'finished');
  await updateRead(db, readId, { finish_date: '2026-01-05' });
});
const show = () => render(<DbContext.Provider value={db}><MemoryRouter initialEntries={[`/book/${bookId}/${readId}`]}><Routes>
  <Route path="book/:bookId/:readId" element={<BookLogPage />} /><Route path="library" element={<p>LIBRARY PAGE</p>} /></Routes></MemoryRouter></DbContext.Provider>);

describe('deleting a whole book from the Book Log', () => {
  it('asks first, then deletes the book and goes to the Library', async () => {
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Book menu' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Delete this book/ }));
    expect(screen.getByText(/all of its reads, ratings/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(screen.queryByText(/all of its reads, ratings/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Book menu' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Delete this book/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete the book' }));
    await screen.findByText('LIBRARY PAGE');
    expect((await db.select('SELECT id FROM book WHERE deleted_at IS NULL')).length).toBe(0);
  });
  it('puts Why I am reading this beside Narration, and Challenges beside Notes, each starting a row', async () => {
    show();
    const cards = [...(await screen.findByText("Why I'm reading this")).closest('.cards, .bgrid, div:has(> .bcard)')!.querySelectorAll(':scope > .bcard')].map((c) => c.querySelector('.lbl2')?.textContent);
    const i = cards.indexOf("Why I'm reading this");
    expect(cards.slice(i, i + 4)).toEqual(["Why I'm reading this", 'Narration', 'Challenges', 'Notes']);
  });
});

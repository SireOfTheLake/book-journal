// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DbContext } from '../src/db/DbContext';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { createBook } from '../src/repo/books';
import { createRead, updateRead } from '../src/repo/bookLog';
import BookLogPage from '../src/pages/BookLogPage';

afterEach(cleanup);
let db: Db;
let bookId = ''; let first = ''; let second = '';
beforeEach(async () => {
  db = migrateNodeDb();
  bookId = await createBook(db, { title: 'Twice Read', authors: ['Someone'] });
  first = await createRead(db, bookId, 'finished');
  await updateRead(db, first, { finish_date: '2026-01-05' });
  second = await createRead(db, bookId, 'finished');
  await updateRead(db, second, { finish_date: '2026-03-05' });
});
const show = (path: string) => render(<DbContext.Provider value={db}><MemoryRouter initialEntries={[path]}><Routes><Route path="book/:bookId/:readId" element={<BookLogPage />} /><Route path="book/:bookId" element={<BookLogPage />} /></Routes></MemoryRouter></DbContext.Provider>);

describe('deleting a read from the Book Log', () => {
  it('asks first, then removes the read and shows the one that is left', async () => {
    show(`/book/${bookId}/${second}`);
    await screen.findByText('Read 2 · 2026-03-05');
    fireEvent.click(screen.getByRole('button', { name: 'Delete this read' }));
    expect(screen.getByText(/The book and its other reads stay/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(screen.queryByText(/The book and its other reads stay/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Delete this read' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete it' }));
    await waitFor(() => expect(screen.queryByText('Read 2 · 2026-03-05')).toBeNull());
    expect(screen.getByText('Read 1 · 2026-01-05')).toBeTruthy();
  });
  it('leaves a book with no reads when its only read is deleted', async () => {
    const solo = await createBook(db, { title: 'Once Read', authors: ['Someone'] });
    const only = await createRead(db, solo, 'finished');
    await updateRead(db, only, { finish_date: '2026-02-02' });
    show(`/book/${solo}/${only}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete this read' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete it' }));
    await screen.findByText(/This book has no reads yet/);
    expect(screen.queryByRole('button', { name: 'Delete this read' })).toBeNull();
  });
});

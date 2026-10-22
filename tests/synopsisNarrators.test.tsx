// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { DbContext } from '../src/db/DbContext';
import { migrateNodeDb } from '../src/db/nodeDb';
import BookLogPage from '../src/pages/BookLogPage';
import { addBookNarrator, createRead, getBookLog, quickAdd, removeBookNarrator, setStatus, updateBook, updateRead } from '../src/repo/bookLog';

afterEach(cleanup);
const show = (db: ReturnType<typeof migrateNodeDb>, bookId: string) => render(
  <DbContext.Provider value={db}><MemoryRouter initialEntries={[`/book/${bookId}`]}><Routes><Route path="book/:bookId" element={<BookLogPage />} /><Route path="book/:bookId/:readId" element={<BookLogPage />} /></Routes></MemoryRouter></DbContext.Provider>);

describe('usual narrators and audiobook length on a book with no read', () => {
  it('a new read starts with the book\'s narrators and length, and can then change them', async () => {
    const db = migrateNodeDb();
    const { bookId } = await quickAdd(db, { title: 'Wanted', authors: ['A'], status: 'tbr' });
    await addBookNarrator(db, bookId, 'Daniel Lewis'); await addBookNarrator(db, bookId, 'daniel lewis'); await addBookNarrator(db, bookId, 'Ava Wells');
    await updateBook(db, bookId, { audio_length_seconds: 9 * 3600 + 5 * 60 });
    expect((await getBookLog(db, bookId))!.defaultNarrators.map((n) => n.name)).toEqual(['Daniel Lewis', 'Ava Wells']);
    const rid = await createRead(db, bookId, 'reading');
    const log = (await getBookLog(db, bookId, rid))!;
    expect(log.narrators.map((n) => n.name)).toEqual(['Daniel Lewis', 'Ava Wells']);
    expect(log.read!.audio_length_seconds).toBe(9 * 3600 + 5 * 60);
    await updateRead(db, rid, { audio_length_seconds: 10 * 3600 });
    expect((await getBookLog(db, bookId, rid))!.book.audio_length_seconds).toBe(9 * 3600 + 5 * 60); // the usual length is not overwritten by one read
  });
  it('the first length typed on a read becomes the usual one; removing a usual narrator leaves the others', async () => {
    const db = migrateNodeDb();
    const { bookId, readId } = await quickAdd(db, { title: 'Heard', authors: ['A'], status: 'finished' });
    await updateRead(db, readId!, { audio_length_seconds: 7200 });
    expect((await getBookLog(db, bookId))!.book.audio_length_seconds).toBe(7200);
    await addBookNarrator(db, bookId, 'One'); await addBookNarrator(db, bookId, 'Two');
    const one = (await getBookLog(db, bookId))!.defaultNarrators[0].id;
    await removeBookNarrator(db, bookId, one);
    expect((await getBookLog(db, bookId))!.defaultNarrators.map((n) => n.name)).toEqual(['Two']);
  });
  it('an Up Next book\'s placeholder read starts with them too', async () => {
    const db = migrateNodeDb();
    const { bookId } = await quickAdd(db, { title: 'Soon', authors: ['A'], status: 'tbr' });
    await addBookNarrator(db, bookId, 'Voice'); await updateBook(db, bookId, { audio_length_seconds: 3600 });
    await setStatus(db, bookId, null, 'up_next');
    const log = (await getBookLog(db, bookId))!;
    expect(log.narrators.map((n) => n.name)).toEqual(['Voice']);
    expect(log.read!.audio_length_seconds).toBe(3600);
  });
  it('the screen adds and removes narrators and sets the length on a TBR book', async () => {
    const db = migrateNodeDb();
    const { bookId } = await quickAdd(db, { title: 'Wanted', authors: ['A'], status: 'tbr' });
    show(db, bookId);
    await screen.findByText('Wanted');
    fireEvent.click(await screen.findByRole('button', { name: 'Add narrator' }));
    const box = screen.getByLabelText('Search narrators');
    fireEvent.change(box, { target: { value: 'Ava Wells' } });
    fireEvent.mouseDown(await screen.findByText('+ Add "Ava Wells" as a new narrator'));
    await screen.findByLabelText('Remove Ava Wells');
    fireEvent.click(screen.getByRole('button', { name: 'Add audio length' }));
    const len = screen.getByLabelText('Audio length');
    fireEvent.change(len, { target: { value: '8:30' } }); fireEvent.blur(len);
    await waitFor(async () => expect((await getBookLog(db, bookId))!.book.audio_length_seconds).toBe(8 * 3600 + 30 * 60));
    fireEvent.click(screen.getByLabelText('Remove Ava Wells'));
    await waitFor(() => expect(screen.queryByLabelText('Remove Ava Wells')).toBeNull());
  });
});

describe('synopsis button', () => {
  it('says Add synopsis when there is none, saves one, then reads, edits and deletes it', async () => {
    const db = migrateNodeDb();
    const { bookId } = await quickAdd(db, { title: 'Blurbed', authors: ['A'], status: 'tbr' });
    show(db, bookId);
    fireEvent.click(await screen.findByRole('button', { name: 'Add synopsis' }));
    const dlg = screen.getByRole('dialog', { name: /Synopsis of Blurbed/ });
    fireEvent.change(within(dlg).getByLabelText('Synopsis'), { target: { value: 'Two rivals, one rink.' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    await within(dlg).findByText('Two rivals, one rink.');
    fireEvent.click(within(dlg).getByRole('button', { name: 'Close' }));
    expect((await getBookLog(db, bookId))!.book.synopsis).toBe('Two rivals, one rink.');
    fireEvent.click(await screen.findByRole('button', { name: 'Read synopsis' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Synopsis'), { target: { value: 'Rivals on ice.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Rivals on ice.');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByText('Delete this synopsis?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Delete it' }));
    await screen.findByRole('button', { name: 'Add synopsis' });
    expect((await getBookLog(db, bookId))!.book.synopsis).toBeNull();
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { DbContext } from '../src/db/DbContext';
import { migrateNodeDb } from '../src/db/nodeDb';
import { createListItem, quickAdd, updateRead } from '../src/repo/bookLog';
import { applyBulk, deleteBooks, describeBulk } from '../src/repo/bulkEdit';
import LibraryPage from '../src/pages/LibraryPage';

afterEach(cleanup);
async function setup() {
  const db = migrateNodeDb();
  const a = await quickAdd(db, { title: 'Alpha', authors: ['X'], status: 'tbr' });
  const b = await quickAdd(db, { title: 'Beta', authors: ['Y'], status: 'reading' });
  const c = await quickAdd(db, { title: 'Gamma', authors: ['Z'], status: 'finished' });
  return { db, a: a.bookId, b: b.bookId, c: c.bookId };
}
const one = async (db: ReturnType<typeof migrateNodeDb>, sql: string, args: unknown[] = []) => (await db.select<Record<string, unknown>>(sql, args as never))[0];

describe('bulk edit logic', () => {
  it('previews what it will do, then does exactly that', async () => {
    const { db, a, b, c } = await setup();
    const src = await createListItem(db, 'source', 'Library');
    const changes = { format: 'audio' as const, sourceId: src, sourceName: 'Library', genres: ['Romance'], own: ['ebook' as const], placeholderPermanent: true };
    const lines = await describeBulk(db, [a, b, c], changes);
    expect(lines.join('\n')).toMatch(/Format: set to Audio on 2 books\. 1 book has no reading/);
    expect(lines.join('\n')).toMatch(/Genre: add "Romance" to 3 books/);
    const r = await applyBulk(db, [a, b, c], changes);
    expect(r).toEqual({ books: 3, skippedNoRead: 1 });
    expect((await one(db, "SELECT format, source_id FROM read WHERE book_id = ?", [b])).format).toBe('audio');
    expect((await one(db, 'SELECT own_ebook, placeholder_permanent FROM book WHERE id = ?', [a]))).toEqual({ own_ebook: 1, placeholder_permanent: 1 });
    expect(await describeBulk(db, [a], { genres: ['romance'] })).toEqual(['Genre: add "romance" to 0 books (1 book already has it).']);
  });
  it('a status change comes first, so a TBR book that gets a reading can take a format', async () => {
    const { db, a } = await setup();
    expect((await describeBulk(db, [a], { status: 'reading', format: 'ebook' })).join(' ')).not.toMatch(/skipped/);
    await applyBulk(db, [a], { status: 'reading', format: 'ebook' });
    expect((await one(db, 'SELECT status, format FROM read WHERE book_id = ?', [a]))).toEqual({ status: 'reading', format: 'ebook' });
    void updateRead;
  });
  it('deletes books', async () => {
    const { db, a, b } = await setup();
    expect(await deleteBooks(db, [a, b])).toBe(2);
    expect((await db.select('SELECT id FROM book WHERE deleted_at IS NULL')).length).toBe(1);
  });
});

describe('bulk edit screen', () => {
  async function open() {
    const s = await setup();
    render(<MemoryRouter><DbContext.Provider value={s.db}><LibraryPage /></DbContext.Provider></MemoryRouter>);
    await screen.findByText('3 of 3 books');
    return s;
  }
  it('selects covers, asks before deleting', async () => {
    const { db } = await open();
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    fireEvent.click(screen.getByLabelText(/^Alpha/));
    fireEvent.click(screen.getByLabelText(/^Beta/));
    expect(screen.getByText('2 selected')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Unselect' }));
    expect(screen.getByText('0 selected')).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/^Alpha/));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dlg = screen.getByRole('alertdialog');
    expect(within(dlg).getByText('Alpha')).toBeTruthy();
    fireEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }));
    expect((await db.select('SELECT id FROM book WHERE deleted_at IS NULL')).length).toBe(3);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete it' }));
    await screen.findByText('2 of 2 books');
    expect(screen.getByText('Deleted 1 book.')).toBeTruthy();
  });
  it('edits in list mode after a warning that lists the changes', async () => {
    const { db, b } = await open();
    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    fireEvent.click(screen.getByLabelText('Select every book shown'));
    expect(screen.getByText('3 selected')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const dlg = await screen.findByRole('dialog');
    expect((within(dlg).getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(dlg).getByLabelText('Status'), { target: { value: 'on_hold' } });
    fireEvent.change(within(dlg).getByLabelText('Genre to add'), { target: { value: 'Fantasy' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Add genre' }));
    fireEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    await within(dlg).findByText('MAKE THESE CHANGES?');
    expect(within(dlg).getByText('Status: set to Paused on 3 books.')).toBeTruthy();
    expect(within(dlg).getByText('Genre: add "Fantasy" to 3 books.')).toBeTruthy();
    expect((await db.select('SELECT id FROM book_genre')).length).toBe(0); // nothing yet
    fireEvent.click(within(dlg).getByRole('button', { name: 'Yes, make the changes' }));
    await screen.findByText('Changed 3 books.');
    expect((await one(db, 'SELECT status FROM read WHERE book_id = ?', [b])).status).toBe('on_hold');
    expect((await db.select('SELECT id FROM book_genre WHERE deleted_at IS NULL')).length).toBe(3);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

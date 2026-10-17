// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { migrateNodeDb } from '../src/db/nodeDb';
import { DbContext } from '../src/db/DbContext';
import { LISTS, addEntry, deleteEntry, listEntries, renameEntry } from '../src/repo/lists';
import ListsCard from '../src/pages/settings/ListsCard';
import { newId } from '../src/domain/ids';

afterEach(cleanup);

describe('pick-list repo', () => {
  it('every list can be read, added to, renamed and deleted', async () => {
    const db = migrateNodeDb();
    for (const l of LISTS) {
      const before = (await listEntries(db, l.kind)).length;
      const id = await addEntry(db, l.kind, '  Zed One ');
      expect((await listEntries(db, l.kind)).find((r) => r.id === id)).toMatchObject({ name: 'Zed One', uses: 0 });
      await expect(addEntry(db, l.kind, 'zed one')).rejects.toThrow(/already one/);
      await renameEntry(db, l.kind, id, 'Zed Two');
      await expect(renameEntry(db, l.kind, id, '')).rejects.toThrow();
      await deleteEntry(db, l.kind, id);
      expect((await listEntries(db, l.kind)).length).toBe(before);
      await addEntry(db, l.kind, 'Zed One'); // the name is free again after a delete
    }
  });
  it('counts uses, and deleting clears them without touching the books', async () => {
    const db = migrateNodeDb();
    const bookId = newId();
    await db.execute("INSERT INTO book (id, title) VALUES (?, 'B')", [bookId]);
    const g = await addEntry(db, 'genre', 'Gaslamp');
    await db.execute('INSERT INTO book_genre (id, book_id, genre_id) VALUES (?, ?, ?)', [newId(), bookId, g]);
    const s = await addEntry(db, 'source', 'Library');
    const readId = newId();
    await db.execute("INSERT INTO read (id, book_id, status, source_id) VALUES (?, ?, 'finished', ?)", [readId, bookId, s]);
    expect((await listEntries(db, 'genre')).find((r) => r.id === g)!.uses).toBe(1);
    expect((await listEntries(db, 'source')).find((r) => r.id === s)!.uses).toBe(1);
    await deleteEntry(db, 'genre', g);
    await deleteEntry(db, 'source', s);
    expect((await db.select<{ n: number }>('SELECT count(*) AS n FROM book_genre WHERE deleted_at IS NULL'))[0].n).toBe(0);
    expect((await db.select<{ source_id: string | null }>('SELECT source_id FROM read WHERE id = ?', [readId]))[0].source_id).toBeNull();
    expect((await db.select<{ n: number }>('SELECT count(*) AS n FROM book WHERE deleted_at IS NULL'))[0].n).toBe(1);
  });
});

describe('Settings > Lists', () => {
  it('adds, renames and deletes an entry', async () => {
    const db = migrateNodeDb();
    render(<MemoryRouter><DbContext.Provider value={db}><ListsCard /></DbContext.Provider></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Tropes' }));
    fireEvent.change(await screen.findByLabelText('New trope'), { target: { value: 'Found family' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    const box = await screen.findByLabelText('Rename Found family');
    fireEvent.change(box, { target: { value: 'Chosen family' } });
    fireEvent.blur(box);
    await screen.findByLabelText('Rename Chosen family');
    fireEvent.click(screen.getByRole('button', { name: 'Delete Chosen family' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Chosen family' }));
    await waitFor(() => expect(screen.queryByLabelText('Rename Chosen family')).toBeNull());
  });
  it('says so when a name is already taken', async () => {
    const db = migrateNodeDb();
    await addEntry(db, 'theme', 'Grief');
    render(<MemoryRouter><DbContext.Provider value={db}><ListsCard /></DbContext.Provider></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Themes' }));
    fireEvent.change(await screen.findByLabelText('New theme'), { target: { value: 'grief' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/already one called/);
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { BackupProvider } from '../src/backup/context';
import { DbContext } from '../src/db/DbContext';
import { migrateNodeDb } from '../src/db/nodeDb';
import BookCsvImport from '../src/pages/BookCsvImport';
import { quickAdd } from '../src/repo/bookLog';
import { tempBackupEnv } from './helpers/backupEnv';

afterEach(cleanup);
const asFile = (text: string, name: string) => { const f = new File([text], name); Object.defineProperty(f, 'text', { value: async () => text }); return f; };

describe('importing a book list from a spreadsheet', () => {
  it('shows existing and new authors and series, waits for a decision, then imports and can undo', async () => {
    const db = migrateNodeDb();
    await quickAdd(db, { title: 'Old Book', authors: ['A.J. Sherwood'], status: 'tbr' });
    const env = tempBackupEnv({}).env;
    render(<MemoryRouter><BackupProvider env={env}><DbContext.Provider value={db}><BookCsvImport /></DbContext.Provider></BackupProvider></MemoryRouter>);
    const csv = 'Title,Author,Series,Position,Page Number,Copies I Own\r\nThe Prince Pact,AJ Sherwood,Royal Bargains,1,384,Physical\r\nOld Book,A.J. Sherwood,,,,\r\nWinter Harbour,Mara Quill,,,340,Ebook\r\n';
    fireEvent.change(screen.getByLabelText('Book list CSV'), { target: { files: [asFile(csv, 'books.csv')] } });

    await screen.findByText('2. Review');
    expect(screen.getByLabelText('AJ Sherwood status').textContent).toBe('Existing author: A.J. Sherwood');
    expect(screen.getByLabelText('Mara Quill status').textContent).toMatch(/New author/);
    expect(screen.getByLabelText('Royal Bargains status').textContent).toMatch(/New series/);
    expect(screen.getByText('Already in your library (A.J. Sherwood)')).toBeTruthy(); // the second row is left out by default
    const go = screen.getByRole('button', { name: /^Import 2 books/ }) as HTMLButtonElement;
    expect(go.disabled).toBe(true);
    expect(screen.getByText(/2 names still need an answer/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Create new author' }));
    expect(screen.getByLabelText('Mara Quill status').textContent).toBe('New author: will be created');
    fireEvent.click(screen.getByRole('button', { name: 'Create new series' }));
    await waitFor(() => expect((screen.getByRole('button', { name: /^Import 2 books/ }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: /^Import 2 books/ }));

    await screen.findByText('Imported');
    const rows = await db.select<{ title: string; series_position: number | null; own_physical: number; own_ebook: number }>('SELECT title, series_position, own_physical, own_ebook FROM book WHERE deleted_at IS NULL ORDER BY title');
    expect(rows.map((r) => r.title)).toEqual(['Old Book', 'The Prince Pact', 'Winter Harbour']);
    expect(rows[1]).toMatchObject({ series_position: 1, own_physical: 1 });
    // AJ Sherwood was matched to the existing author, not made again.
    expect(await db.select("SELECT 1 FROM author WHERE name LIKE '%Sherwood%' AND deleted_at IS NULL")).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Undo this import' }));
    await screen.findByText('Import undone');
    expect(await db.select('SELECT 1 FROM book WHERE deleted_at IS NULL')).toHaveLength(1);
  });

  it('can create every new name at once, and explains a file with no Title column', async () => {
    const db = migrateNodeDb();
    render(<MemoryRouter><BackupProvider env={tempBackupEnv({}).env}><DbContext.Provider value={db}><BookCsvImport /></DbContext.Provider></BackupProvider></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Book list CSV'), { target: { files: [asFile('Who,Where\r\nx,y\r\n', 'bad.csv')] } });
    expect((await screen.findByRole('alert')).textContent).toMatch(/no Title column/);
    fireEvent.change(screen.getByLabelText('Book list CSV'), { target: { files: [asFile('Title,Author\r\nA,Ann\r\nB,Bob\r\n', 'ok.csv')] } });
    await screen.findByText('2. Review');
    fireEvent.click(screen.getByRole('button', { name: 'Create all 2 new authors' }));
    const list = screen.getByText('Authors').closest('.card') as HTMLElement;
    expect(within(list).getAllByText('New author: will be created')).toHaveLength(2);
  });
});

// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BackupProvider } from '../src/backup/context';
import { tempBackupEnv } from './helpers/backupEnv';
import { DbContext } from '../src/db/DbContext';
import { migrateNodeDb } from '../src/db/nodeDb';
import JournalImport from '../src/pages/JournalImport';

afterEach(cleanup);
const asFile = (text: string, name: string) => { const f = new File([text], name); Object.defineProperty(f, 'text', { value: async () => text }); return f; };
const sample = readFileSync(resolve(process.cwd(), 'tests/fixtures/journal-2026-sample.json'), 'utf8');

describe('the Journal pages import', () => {
  it('shows the review, lets a bad date be fixed, then imports and can undo', async () => {
    const db = migrateNodeDb();
    const tmp = tempBackupEnv({}); const env = tmp.env;
    render(<BackupProvider env={env}><DbContext.Provider value={db}><JournalImport /></DbContext.Provider></BackupProvider>);
    const file = asFile(sample, 'journal.json');
    fireEvent.change(screen.getByLabelText('Journal transcription'), { target: { files: [file] } });
    expect(await screen.findByText('2. Review')).toBeTruthy();
    expect(screen.getAllByText(/^New book ·/).length).toBe(21);
    expect(screen.getByText(/is before started/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Finish date for Ignite'), { target: { value: '2026-08-01' } });
    fireEvent.click(screen.getByLabelText('Import Glory Troll')); // leave one out
    fireEvent.click(screen.getByRole('button', { name: /Import 20 pages/ }));
    expect(await screen.findByText('Imported', {}, { timeout: 5000 })).toBeTruthy();
    expect((await db.select<{ n: number }>("SELECT count(*) AS n FROM book WHERE deleted_at IS NULL"))[0].n).toBe(20);
    expect((await db.select<{ f: string }>("SELECT r.finish_date AS f FROM read r JOIN book b ON b.id = r.book_id WHERE b.title = 'Ignite'"))[0].f).toBe('2026-08-01');
    fireEvent.click(screen.getByRole('button', { name: 'Undo this import' }));
    await waitFor(() => expect(screen.getByText('Undone')).toBeTruthy());
    expect((await db.select<{ n: number }>("SELECT count(*) AS n FROM book WHERE deleted_at IS NULL"))[0].n).toBe(0);
  });
  it('explains a file that is not a transcription', async () => {
    const db = migrateNodeDb();
    render(<DbContext.Provider value={db}><JournalImport /></DbContext.Provider>);
    fireEvent.change(screen.getByLabelText('Journal transcription'), { target: { files: [asFile('{}', 'x.json')] } });
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/not a journal transcription/);
  });
});

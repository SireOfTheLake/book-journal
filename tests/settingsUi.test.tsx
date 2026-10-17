// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BackupProvider } from '../src/backup/context';
import { DbContext } from '../src/db/DbContext';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { applyNotionPlan } from '../src/import/apply';
import { planNotionBooks } from '../src/import/notion';
import { setBookCover } from '../src/repo/bookLog';
import ImportPage from '../src/pages/ImportPage';
import SettingsPage from '../src/pages/SettingsPage';
import { tempBackupEnv } from './helpers/backupEnv';

const csv = (f: string) => readFileSync(resolve(process.cwd(), 'tests/fixtures', f), 'utf8');
let db: Db; let tmp: ReturnType<typeof tempBackupEnv> | null = null;
beforeEach(async () => {
  db = migrateNodeDb();
  await applyNotionPlan(db, planNotionBooks(csv('book-tracker.csv')), { tagDestinations: {} });
});
afterEach(() => { cleanup(); tmp?.cleanup(); tmp = null; });

function mount(opts: Parameters<typeof tempBackupEnv>[0] = {}, withEnv = true) {
  tmp = tempBackupEnv(opts);
  const page = <DbContext.Provider value={db}><MemoryRouter><SettingsPage /></MemoryRouter></DbContext.Provider>;
  return render(withEnv ? <BackupProvider env={tmp.env}>{page}</BackupProvider> : page);
}

describe('Settings: backup and export', () => {
  it('starts with no backups and says so', async () => {
    mount();
    await waitFor(() => expect(screen.getByText('No backups yet.')).toBeTruthy());
    expect(screen.getByText(/You have not made a backup yet\./)).toBeTruthy();
    expect(screen.getByText(/Kept in .*bj-ui-backups/)).toBeTruthy();
    expect(screen.getByText(/To restore a backup: close Book Journal/)).toBeTruthy();
  });
  it('backs up now, and lists the new backup with when it was made', async () => {
    mount();
    await waitFor(() => expect(screen.getByText('Back up now')).toBeTruthy());
    fireEvent.click(screen.getByText('Back up now'));
    await waitFor(() => expect(screen.getByText(/^Backed up as manual-\d{8}-\d{6}\.db\.$/)).toBeTruthy());
    expect(readdirSync(tmp!.dir)).toHaveLength(1);
    expect(screen.getByText('Backed up by you')).toBeTruthy();
    expect(screen.getByText(/^Your last backup was /)).toBeTruthy();
    expect(screen.queryByText(/You have not made a backup yet\./)).toBeNull();
    expect(screen.queryByText('No backups yet.')).toBeNull();
  });
  it('saves a copy to the place you choose', async () => {
    mount();
    await waitFor(() => expect(screen.getByText('Save a copy somewhere else...')).toBeTruthy());
    fireEvent.click(screen.getByText('Save a copy somewhere else...'));
    await waitFor(() => expect(screen.getByText(/A copy was saved to .*book-journal-backup-\d{4}-\d{2}-\d{2}\.db/)).toBeTruthy());
    expect(readdirSync(tmp!.elsewhere)).toHaveLength(1);
  });
  it('does nothing, and says nothing, if you cancel the Save dialog', async () => {
    mount({ pick: () => null });
    await waitFor(() => expect(screen.getByText('Save a copy somewhere else...')).toBeTruthy());
    fireEvent.click(screen.getByText('Save a copy somewhere else...'));
    await waitFor(() => expect((screen.getByText('Save a copy somewhere else...') as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByRole('status')).toBeNull();
    expect(readdirSync(tmp!.dir)).toEqual([]);
  });
  it('shows what went wrong, and lets you try again', async () => {
    mount({ failCopy: true });
    await waitFor(() => expect(screen.getByText('Save a copy somewhere else...')).toBeTruthy());
    fireEvent.click(screen.getByText('Save a copy somewhere else...'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('The drive is full.'));
    expect((screen.getByText('Save a copy somewhere else...') as HTMLButtonElement).disabled).toBe(false);
  });
  it('exports your data as JSON, without pictures unless you tick the box', async () => {
    const [{ id }] = await db.select<{ id: string }>("SELECT id FROM book WHERE title = 'Hush'");
    await setBookCover(db, id, { dataUrl: 'data:image/png;base64,PICTURE' });
    mount();
    await waitFor(() => expect(screen.getByText('Export all data (JSON)...')).toBeTruthy());
    fireEvent.click(screen.getByText('Export all data (JSON)...'));
    await waitFor(() => expect(screen.getByText(/Exported [\d,]+ records from \d+ tables to .*\(without pictures\)\./)).toBeTruthy());
    const [file] = readdirSync(tmp!.elsewhere);
    expect(file).toMatch(/^book-journal-export-\d{4}-\d{2}-\d{2}\.json$/);
    expect(readFileSync(resolve(tmp!.elsewhere, file), 'utf8')).not.toContain('PICTURE');
    fireEvent.click(screen.getByLabelText(/Include pictures/));
    fireEvent.click(screen.getByText('Export all data (JSON)...'));
    await waitFor(() => expect(screen.getByText(/Exported [\d,]+ records from \d+ tables to [^(]*\.$/)).toBeTruthy());
    expect(readFileSync(resolve(tmp!.elsewhere, file), 'utf8')).toContain('PICTURE'); // the second export replaced the first (same day)
  });
  it('says backups need the app window when they are not available, and turns the buttons off', async () => {
    mount({}, false); // no backup environment, as in a plain browser
    await waitFor(() => expect(screen.getByText(/Backups can only be made inside the app window/)).toBeTruthy());
    for (const b of ['Back up now', 'Save a copy somewhere else...', 'Export all data (JSON)...']) expect((screen.getByText(b) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('importing makes a backup first', () => {
  const importBooks = async (env: ReturnType<typeof tempBackupEnv>) => {
    const empty = migrateNodeDb();
    render(<BackupProvider env={env.env}><DbContext.Provider value={empty}><MemoryRouter><ImportPage /></MemoryRouter></DbContext.Provider></BackupProvider>);
    const input = screen.getByLabelText('Notion books CSV');
    const text = csv('book-tracker.csv');
    const file = Object.assign(new File([text], 'books.csv', { type: 'text/csv' }), { text: async () => text }); // the test browser's File cannot read itself
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(screen.getByText(/^Import \d+ books$/)).toBeTruthy());
    return { empty, run: () => fireEvent.click(screen.getByText(/^Import \d+ books$/)) };
  };

  it('takes a safety copy of the database, then imports', async () => {
    tmp = tempBackupEnv();
    const { empty, run } = await importBooks(tmp);
    run();
    await waitFor(() => expect(screen.getByText('Imported')).toBeTruthy());
    const backups = readdirSync(tmp.dir);
    expect(backups).toHaveLength(1);
    expect(backups[0]).toMatch(/^before-import-\d{8}-\d{6}\.db$/);
    expect((await empty.select<{ n: number }>('SELECT count(*) AS n FROM book'))[0].n).toBe(15);
  });
  it('does not import if the safety copy cannot be made', async () => {
    tmp = tempBackupEnv();
    tmp.env.backupsDir = async () => { throw new Error('The folder is not writable.'); };
    const { empty, run } = await importBooks(tmp);
    run();
    await waitFor(() => expect(screen.getByText(/A backup could not be made first, so nothing was imported\. \(The folder is not writable\.\)/)).toBeTruthy());
    expect((await empty.select<{ n: number }>('SELECT count(*) AS n FROM book'))[0].n).toBe(0);
    expect(within(document.body).queryByText('Imported')).toBeNull();
  });
});

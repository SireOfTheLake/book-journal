import { createRequire } from 'node:module';
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildExport, exportJson, KEEP_AUTOMATIC, lastBackupAt, listBackups, makeBackup, parseBackupName, saveCopy, stampOf, type BackupEnv } from '../src/backup/backup';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { applyNotionPlan } from '../src/import/apply';
import { planNotionBooks } from '../src/import/notion';
import { setBookCover } from '../src/repo/bookLog';
import { readFileSync as read } from 'node:fs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

let dir: string; let elsewhere: string; let db: Db; let clock: Date;
const nameCount = (d: string) => readdirSync(d).length;

// A backup environment that uses real folders and files, with a clock and Save dialog you control.
function env(opts: { pick?: string | null } = {}): BackupEnv {
  return {
    backupsDir: async () => dir,
    list: async (d) => readdirSync(d),
    remove: async (p) => unlinkSync(p),
    copy: async (a, b) => copyFileSync(a, b),
    pickSavePath: async () => (opts.pick === undefined ? join(elsewhere, 'chosen.out') : opts.pick),
    writeText: async (p, t) => writeFileSync(p, t),
    join: (d, n) => join(d, n),
    now: () => clock,
  };
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'bj-backups-')); elsewhere = mkdtempSync(join(tmpdir(), 'bj-elsewhere-'));
  clock = new Date(Date.UTC(2026, 9, 14, 15, 30, 0));
  db = migrateNodeDb();
  await applyNotionPlan(db, planNotionBooks(read(new URL('./fixtures/book-tracker.csv', import.meta.url), 'utf8')), { tagDestinations: {} });
});
afterEach(() => { rmSync(dir, { recursive: true, force: true }); rmSync(elsewhere, { recursive: true, force: true }); });

describe('backup file names', () => {
  it('uses a UTC date and time, and reads it back', () => {
    expect(stampOf(new Date(Date.UTC(2026, 9, 14, 15, 30, 5)))).toBe('20261014-153005');
    const f = parseBackupName('before-import-20261014-153005.db')!;
    expect(f).toMatchObject({ kind: 'before-import', name: 'before-import-20261014-153005.db' });
    expect(f.at.toISOString()).toBe('2026-10-14T15:30:05.000Z');
    expect(parseBackupName('manual-20261014-153005-2.db')!.kind).toBe('manual');
    expect(parseBackupName('before-upgrade-20261014-153005.db')!.kind).toBe('before-upgrade');
  });
  it('ignores anything that is not a backup', () => {
    for (const n of ['schema-version.txt', 'notes.db', 'manual-2026-10-14.db', 'manual-20261014-153005.sqlite', 'other-20261014-153005.db']) expect(parseBackupName(n)).toBeNull();
  });
});

describe('making a backup', () => {
  it('writes a complete, readable copy of the database, pictures included', async () => {
    const [{ id }] = await db.select<{ id: string }>("SELECT id FROM book WHERE title = 'Hush'");
    await setBookCover(db, id, { dataUrl: 'data:image/png;base64,PICTURE' });
    const made = await makeBackup(db, env(), 'manual');
    expect(made.name).toBe('manual-20261014-153000.db');
    expect(existsSync(made.path)).toBe(true);
    const copy = new DatabaseSync(made.path);
    expect((copy.prepare('SELECT count(*) AS n FROM book').get() as { n: number }).n).toBe(15);
    expect((copy.prepare("SELECT file_path AS p FROM image WHERE file_path LIKE '%PICTURE'").get() as { p: string }).p).toBe('data:image/png;base64,PICTURE');
    copy.close();
  });
  it('does not overwrite a backup made in the same second', async () => {
    const a = await makeBackup(db, env(), 'manual');
    const b = await makeBackup(db, env(), 'manual');
    const c = await makeBackup(db, env(), 'manual');
    expect([a.name, b.name, c.name]).toEqual(['manual-20261014-153000.db', 'manual-20261014-153000-2.db', 'manual-20261014-153000-3.db']);
    expect(nameCount(dir)).toBe(3);
  });
  it('remembers when the last backup was made', async () => {
    expect(await lastBackupAt(db)).toBeNull();
    await makeBackup(db, env(), 'manual');
    expect((await lastBackupAt(db))!.toISOString()).toBe('2026-10-14T15:30:00.000Z');
    clock = new Date(Date.UTC(2026, 9, 20, 8, 0, 0));
    await makeBackup(db, env(), 'before-import');
    expect((await lastBackupAt(db))!.toISOString()).toBe('2026-10-20T08:00:00.000Z');
  });
  it('lists backups newest first and ignores other files', async () => {
    writeFileSync(join(dir, 'schema-version.txt'), '7');
    await makeBackup(db, env(), 'manual');
    clock = new Date(Date.UTC(2026, 9, 15, 9, 0, 0));
    await makeBackup(db, env(), 'before-import');
    expect((await listBackups(env())).map((f) => f.name)).toEqual(['before-import-20261015-090000.db', 'manual-20261014-153000.db']);
  });
});

describe('keeping the backups folder tidy', () => {
  it('keeps the newest automatic backups, and never removes ones you made yourself', async () => {
    for (let i = 1; i <= 25; i++) writeFileSync(join(dir, `before-import-202601${String(i).padStart(2, '0')}-000000.db`), 'x');
    writeFileSync(join(dir, 'before-upgrade-20250101-000000.db'), 'x');
    writeFileSync(join(dir, 'manual-20240101-000000.db'), 'x');
    writeFileSync(join(dir, 'manual-20240102-000000.db'), 'x');
    await makeBackup(db, env(), 'before-import');
    const left = await listBackups(env());
    const auto = left.filter((f) => f.kind !== 'manual');
    expect(auto).toHaveLength(KEEP_AUTOMATIC);
    expect(auto[0].name).toBe('before-import-20261014-153000.db'); // the one just made
    expect(auto.some((f) => f.name === 'before-upgrade-20250101-000000.db')).toBe(false); // the oldest went
    expect(left.filter((f) => f.kind === 'manual')).toHaveLength(2);
  });
  it('does not trim when you make a manual backup', async () => {
    for (let i = 1; i <= 25; i++) writeFileSync(join(dir, `before-import-202601${String(i).padStart(2, '0')}-000000.db`), 'x');
    await makeBackup(db, env(), 'manual');
    expect((await listBackups(env())).filter((f) => f.kind === 'before-import')).toHaveLength(25);
  });
});

describe('saving a copy somewhere else', () => {
  it('makes a fresh backup and copies it to the place you choose', async () => {
    const r = await saveCopy(db, env());
    expect(r).toEqual({ path: join(elsewhere, 'chosen.out') });
    const copy = new DatabaseSync(r!.path);
    expect((copy.prepare('SELECT count(*) AS n FROM book').get() as { n: number }).n).toBe(15);
    copy.close();
    expect((await listBackups(env())).map((f) => f.kind)).toEqual(['manual']); // and one stays in the app's folder too
  });
  it('does nothing if you cancel the Save dialog', async () => {
    expect(await saveCopy(db, env({ pick: null }))).toBeNull();
    expect(nameCount(dir)).toBe(0);
    expect(await lastBackupAt(db)).toBeNull();
  });
});

describe('exporting your data', () => {
  it('writes every table with its rows as readable JSON, leaving out deleted records and search tables', async () => {
    await db.execute("UPDATE book SET deleted_at = '2026-01-01T00:00:00Z' WHERE title = 'Hush'");
    const out = await exportJson(db, env(), { includePictures: false });
    const file = JSON.parse(readFileSync(out!.path, 'utf8'));
    expect(file).toMatchObject({ app: 'Book Journal', exportedAt: '2026-10-14T15:30:00.000Z', includesPictures: false, schemaVersion: null });
    expect(Object.keys(file.tables)).toEqual(expect.arrayContaining(['book', 'read', 'author', 'series', 'character', 'narrator', 'genre']));
    expect(Object.keys(file.tables).some((t) => t.startsWith('search_fts') || t.startsWith('sqlite_'))).toBe(false);
    expect(file.tables.book).toHaveLength(14); // the deleted one is not exported
    expect(file.tables.book.some((b: { title: string }) => b.title === 'Hush')).toBe(false);
    expect(file.tables.book[0]).toHaveProperty('title');
    expect(out).toMatchObject({ tables: Object.keys(file.tables).length, includesPictures: false });
    expect(out!.rows).toBe(Object.values(file.tables as Record<string, unknown[]>).reduce((n, t) => n + t.length, 0));
  });
  it('leaves pictures out unless asked, because they make the file large', async () => {
    const [{ id }] = await db.select<{ id: string }>("SELECT id FROM book WHERE title = 'Bro Doll'");
    await setBookCover(db, id, { dataUrl: 'data:image/png;base64,PICTURE' });
    const without = (await buildExport(db, { includePictures: false, now: clock })).data as { tables: { image: { file_path: string | null; mime_type: unknown }[] } };
    expect(without.tables.image).toHaveLength(1);
    expect(without.tables.image[0].file_path).toBeNull();
    const withPics = (await buildExport(db, { includePictures: true, now: clock })).data as { includesPictures: boolean; tables: { image: { file_path: string }[] } };
    expect(withPics.tables.image[0].file_path).toBe('data:image/png;base64,PICTURE');
    expect(withPics.includesPictures).toBe(true);
  });
  it('does nothing if you cancel the Save dialog', async () => {
    expect(await exportJson(db, env({ pick: null }), { includePictures: false })).toBeNull();
    expect(readdirSync(elsewhere)).toEqual([]);
  });
});

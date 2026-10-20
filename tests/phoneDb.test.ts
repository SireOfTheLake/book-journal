import { beforeAll, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { getBookLog, quickAdd, updateBook, addTag } from '../src/repo/bookLog';
import { syncOnce } from '../src/sync/engine';
import { openPhoneDatabase, usableMigration, type PhoneStorage } from '../src/phone/sqljsDb';
import { FakeCloud } from './helpers/fakeCloud';

let SQL: SqlJsStatic;
const files = readdirSync('src-tauri/migrations').filter((f) => f.endsWith('.sql')).sort().map((f) => readFileSync(`src-tauri/migrations/${f}`, 'utf8'));
beforeAll(async () => { SQL = await initSqlJs(); });

function memoryStorage() {
  const s = { bytes: null as Uint8Array | null, applied: 0, saves: 0 };
  const storage: PhoneStorage = { load: async () => ({ bytes: s.bytes, applied: s.applied }), save: async (b, a) => { s.bytes = b; s.applied = a; s.saves++; } };
  return { s, storage };
}

describe('the phone database', () => {
  it('takes the full-text table out of the migration it cannot run', () => {
    expect(usableMigration(files[0])).not.toMatch(/search_fts/);
  });
  it('applies every migration and the app code runs on it', async () => {
    const { storage } = memoryStorage();
    const { db } = await openPhoneDatabase(SQL, files, storage);
    const { bookId } = await quickAdd(db, { title: 'The Phone Book', authors: ['Ann Author'], status: 'tbr' });
    await addTag(db, bookId, 'genre', 'Romance');
    const log = await getBookLog(db, bookId);
    expect(log!.book.title).toBe('The Phone Book');
    expect(log!.genres.map((g) => g.name)).toEqual(['Romance']);
  });
  it('saves after a change and opens again with the same data, applying nothing twice', async () => {
    const { s, storage } = memoryStorage();
    const first = await openPhoneDatabase(SQL, files, storage, 5);
    await quickAdd(first.db, { title: 'Kept', authors: [], status: 'tbr' });
    await first.flush();
    const savesAfterFirst = s.saves;
    const second = await openPhoneDatabase(SQL, files, storage, 5);
    expect((await second.db.select<{ title: string }>('SELECT title FROM book')).map((r) => r.title)).toEqual(['Kept']);
    expect(s.saves).toBe(savesAfterFirst); // nothing new to apply, nothing re-saved
  });
  it('applies only new migrations to a database from an earlier version', async () => {
    const { s, storage } = memoryStorage();
    const old = await openPhoneDatabase(SQL, files.slice(0, 20), storage);
    await old.flush();
    expect(s.applied).toBe(20);
    const now = await openPhoneDatabase(SQL, files, storage);
    expect(s.applied).toBe(files.length);
    await quickAdd(now.db, { title: 'After upgrade', authors: [], status: 'tbr' }); // the newest tables exist
    expect((await now.db.select('SELECT * FROM reading_order')).length).toBe(0);
  });
  it('syncs with a desktop copy through the same engine, in both directions', async () => {
    const cloud = new FakeCloud();
    const desktop: Db = migrateNodeDb();
    const { storage } = memoryStorage();
    const { db: phone } = await openPhoneDatabase(SQL, files, storage);
    const { bookId } = await quickAdd(desktop, { title: 'From desktop', authors: ['Dee'], status: 'up_next' });
    await syncOnce(desktop, cloud.transport());
    await syncOnce(phone, cloud.transport(), { skipPull: ['image'] });
    expect((await getBookLog(phone, bookId))!.authors.map((a) => a.name)).toEqual(['Dee']);
    await updateBook(phone, bookId, { page_count: 321 });
    await syncOnce(phone, cloud.transport(), { skipPull: ['image'] });
    await syncOnce(desktop, cloud.transport());
    expect((await getBookLog(desktop, bookId))!.book.page_count).toBe(321);
  });
  it('does not need the pictures table to bring in a book that has a cover', async () => {
    const cloud = new FakeCloud();
    const desktop: Db = migrateNodeDb();
    const { storage } = memoryStorage();
    const { db: phone } = await openPhoneDatabase(SQL, files, storage);
    const { bookId } = await quickAdd(desktop, { title: 'Covered', authors: [], status: 'tbr' });
    await desktop.execute("INSERT INTO image (id, file_path) VALUES ('img1', 'data:image/png;base64,AAAA')");
    await desktop.execute("UPDATE book SET cover_image_id = 'img1' WHERE id = ?", [bookId]);
    await syncOnce(desktop, cloud.transport());
    await syncOnce(phone, cloud.transport(), { skipPull: ['image'] });
    const [b] = await phone.select<{ cover_image_id: string }>('SELECT cover_image_id FROM book WHERE id = ?', [bookId]);
    expect(b.cover_image_id).toBe('img1');
    expect((await phone.select('SELECT * FROM image')).length).toBe(0);
  });
});

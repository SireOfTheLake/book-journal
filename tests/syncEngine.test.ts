import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { addTag, deleteBook, getBookLog, quickAdd, updateBook } from '../src/repo/bookLog';
import { getFeatures, setFeature } from '../src/repo/features';
import { syncOnce, SyncVersionError } from '../src/sync/engine';
import { FakeCloud } from './helpers/fakeCloud';

let a: Db; let b: Db; let cloud: FakeCloud;
beforeEach(() => { a = migrateNodeDb(); b = migrateNodeDb(); cloud = new FakeCloud(); });
const sync = (db: Db) => syncOnce(db, cloud.transport());
const wait = () => new Promise((r) => setTimeout(r, 5));
const titles = async (db: Db) => (await db.select<{ title: string }>('SELECT title FROM book WHERE deleted_at IS NULL ORDER BY title')).map((r) => r.title);
const active = async (db: Db, table: string) => (await db.select<{ id: string; name: string }>(`SELECT id, name FROM ${table} WHERE deleted_at IS NULL ORDER BY name`));
const links = async (db: Db, table: string) => (await db.select<Record<string, string>>(`SELECT * FROM ${table} WHERE deleted_at IS NULL`));

describe('syncing two devices', () => {
  it('a book added on one device appears on the other, with its author', async () => {
    const { bookId } = await quickAdd(a, { title: 'First', authors: ['Ann'], status: 'tbr' });
    await sync(a); const r = await sync(b);
    expect(r.pulled).toBeGreaterThan(0);
    expect(await titles(b)).toEqual(['First']);
    expect((await getBookLog(b, bookId))!.authors.map((x) => x.name)).toEqual(['Ann']);
    expect((await sync(b)).pushed).toBe(0); // nothing to send back
  });
  it('the newest edit wins on both devices, and deletes travel', async () => {
    const { bookId } = await quickAdd(a, { title: 'Draft', authors: ['Ann'], status: 'tbr' });
    await sync(a); await sync(b);
    await updateBook(a, bookId, { title: 'From A' });
    await wait();
    await updateBook(b, bookId, { title: 'From B' });
    await sync(a); await sync(b); await sync(a);
    expect(await titles(a)).toEqual(['From B']);
    expect(await titles(b)).toEqual(['From B']);
    await deleteBook(a, bookId);
    await sync(a); await sync(b);
    expect(await titles(b)).toEqual([]);
  });
  it('the same new genre made on both devices becomes one, with every book still tagged', async () => {
    const x = (await quickAdd(a, { title: 'On A', authors: ['Ann'], status: 'tbr' })).bookId;
    await wait();
    const y = (await quickAdd(b, { title: 'On B', authors: ['Bob'], status: 'tbr' })).bookId;
    await addTag(a, x, 'genre', 'Fantasy');
    await wait();
    await addTag(b, y, 'genre', 'fantasy');
    for (let i = 0; i < 3; i++) { await sync(a); await sync(b); }
    for (const d of [a, b]) {
      expect((await active(d, 'genre')).length).toBe(1);
      const g = (await active(d, 'genre'))[0].id;
      expect((await links(d, 'book_genre')).map((l) => l.genre_id)).toEqual([g, g]);
      expect(await titles(d)).toEqual(['On A', 'On B']);
    }
    expect((await active(a, 'genre'))[0].id).toBe((await active(b, 'genre'))[0].id);
  });
  it('the same tag added to the same book on both devices ends as one link', async () => {
    const { bookId } = await quickAdd(a, { title: 'Shared', authors: ['Ann'], status: 'tbr' });
    await sync(a); await sync(b);
    await addTag(a, bookId, 'genre', 'Fantasy');
    await wait();
    await addTag(b, bookId, 'genre', 'Fantasy');
    for (let i = 0; i < 3; i++) { await sync(a); await sync(b); }
    for (const d of [a, b]) { expect((await links(d, 'book_genre')).length).toBe(1); expect((await active(d, 'genre')).length).toBe(1); }
    expect((await links(a, 'book_genre'))[0].id).toBe((await links(b, 'book_genre'))[0].id);
  });
  it('feature switches follow you, the theme does not', async () => {
    await setFeature(a, 'quotes', false);
    await a.execute("INSERT INTO app_setting (key, value) VALUES ('theme', 'x') ON CONFLICT(key) DO UPDATE SET value = 'x'");
    await sync(a); await sync(b);
    expect((await getFeatures(b)).quotes).toBe(false);
    expect(await b.select('SELECT 1 FROM app_setting WHERE key = ?', ['theme'])).toHaveLength(0);
  });
  it('refuses to sync when the versions differ', async () => {
    cloud.version = 99;
    await expect(sync(a)).rejects.toMatchObject({ which: 'this_is_older' });
    cloud.version = 1;
    const err = await sync(a).catch((e) => e);
    expect(err).toBeInstanceOf(SyncVersionError);
    expect(err.which).toBe('this_is_newer');
  });
  it('a big first sync arrives in pages', async () => {
    for (let i = 0; i < 30; i++) await quickAdd(a, { title: `Book ${String(i).padStart(2, '0')}`, authors: ['Ann'], status: 'tbr' });
    await sync(a); await sync(b);
    expect((await titles(b)).length).toBe(30);
  });
});

describe('rows from before a column existed', () => {
  it('arrive with the column\'s starting value instead of failing', async () => {
    const { createMap } = await import('../src/repo/usmap');
    await createMap(a, { year: 2026, name: 'Canada', region: 'canada' });
    await sync(a);
    for (const r of cloud.tables.get('challenge_slot')!.values()) (r as Record<string, unknown>).is_bonus = null;
    for (const r of cloud.tables.get('challenge')!.values()) { (r as Record<string, unknown>).bonus_mode = null; (r as Record<string, unknown>).map_australia = null; }
    await sync(b);
    const slots = await b.select<{ is_bonus: number }>('SELECT is_bonus FROM challenge_slot WHERE deleted_at IS NULL');
    expect(slots).toHaveLength(13);
    expect(slots.every((s) => s.is_bonus === 0)).toBe(true);
    expect((await b.select<{ bonus_mode: string }>('SELECT bonus_mode FROM challenge'))[0].bonus_mode).toBe('optional');
  });
});

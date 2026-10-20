import { readdirSync, readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { quickAdd, updateBook } from '../src/repo/bookLog';
import { applyOrder, applyRemoteRow, changedSince, readSchema, schemaProblems, syncedTables } from '../src/sync/schema';
import { canSync, compareVersions, databaseVersion, SCHEMA_VERSION } from '../src/sync/version';

let db: Db;
beforeEach(() => { db = migrateNodeDb(); });

describe('sync readiness', () => {
  it('every table is either syncable or explicitly left out', async () => {
    const tables = await syncedTables(db);
    expect(tables.length).toBeGreaterThan(60);
    expect(schemaProblems(tables)).toEqual([]);
  });
  it('orders tables so parents come before children', async () => {
    const tables = await syncedTables(db);
    const order = applyOrder(tables);
    expect(order).toHaveLength(tables.length);
    for (const t of tables) for (const p of t.parents) if (order.includes(p)) expect(order.indexOf(p), `${p} before ${t.name}`).toBeLessThan(order.indexOf(t.name));
  });
  it('applies a newer remote row, ignores an older one, and never re-stamps the time', async () => {
    const { bookId } = await quickAdd(db, { title: 'Mine', authors: ['A'], status: 'tbr' });
    const cols = (await readSchema(db)).find((t) => t.name === 'book')!.columns;
    const [local] = await db.select<Record<string, never>>('SELECT * FROM book WHERE id = ?', [bookId]);
    const newer = { ...local, title: 'Theirs', updated_at: '2999-01-01T00:00:00.000Z' };
    expect(await applyRemoteRow(db, 'book', cols, newer)).toBe(true);
    const [after] = await db.select<{ title: string; updated_at: string }>('SELECT title, updated_at FROM book WHERE id = ?', [bookId]);
    expect(after).toEqual({ title: 'Theirs', updated_at: '2999-01-01T00:00:00.000Z' });
    expect(await applyRemoteRow(db, 'book', cols, { ...local, title: 'Old', updated_at: '2000-01-01T00:00:00.000Z' })).toBe(false);
    expect(await applyRemoteRow(db, 'book', cols, { ...newer })).toBe(false);
    // A brand new row from the other device is inserted.
    expect(await applyRemoteRow(db, 'book', cols, { ...local, id: 'remote-1', title: 'New there' })).toBe(true);
    expect((await db.select('SELECT id FROM book WHERE id = ?', ['remote-1']))).toHaveLength(1);
  });
  it('finds what changed since a time', async () => {
    const { bookId } = await quickAdd(db, { title: 'X', authors: ['A'], status: 'tbr' });
    await db.execute("UPDATE book SET updated_at = '2020-01-01T00:00:00.000Z' WHERE id = ?", [bookId]);
    expect((await changedSince(db, 'book', '2021-01-01T00:00:00.000Z'))).toHaveLength(0);
    await updateBook(db, bookId, { title: 'Y' });
    expect((await changedSince(db, 'book', '2021-01-01T00:00:00.000Z')).map((r) => r.title)).toEqual(['Y']);
  });
});

describe('database version', () => {
  it('matches the newest migration and the Rust list', () => {
    const files = readdirSync('src-tauri/migrations').filter((f) => f.endsWith('.sql')).map((f) => Number(f.slice(0, 4)));
    expect(SCHEMA_VERSION).toBe(Math.max(...files));
    const versions = [...readFileSync('src-tauri/src/lib.rs', 'utf8').matchAll(/version:\s*(\d+)/g)].map((m) => Number(m[1]));
    expect(Math.max(...versions)).toBe(SCHEMA_VERSION);
    expect(new Set(versions).size).toBe(versions.length);
  });
  it('compares versions', async () => {
    expect(compareVersions(27, 27)).toBe('same');
    expect(compareVersions(26, 27)).toBe('this_is_older');
    expect(compareVersions(28, 27)).toBe('this_is_newer');
    expect(canSync(27, 26)).toBe(false);
    expect(await databaseVersion(db)).toBe(SCHEMA_VERSION);
  });
});

import { dataSize, megabytes } from '../src/sync/size';
describe('journal size', () => {
  it('splits pictures from everything else', async () => {
    await db.execute("INSERT INTO image (id, file_path) VALUES ('i1', ?)", ['x'.repeat(1000)]);
    await db.execute("INSERT INTO image (id, file_path, deleted_at) VALUES ('i2', ?, '2020-01-01')", ['x'.repeat(5000)]);
    const s = await dataSize(db);
    expect([s.pictures, s.pictureBytes]).toEqual([1, 1000]);
    expect(s.textBytes).toBeGreaterThan(0);
    expect(megabytes(1572864)).toBe('1.5');
  });
});

import { cloudTables, generateSupabaseSql } from '../src/sync/supabaseSchema';
describe('Supabase setup script', () => {
  it('is up to date with the app database, and covers every synced table', async () => {
    const sql = generateSupabaseSql(await cloudTables(db), SCHEMA_VERSION);
    expect(readFileSync('supabase/schema.sql', 'utf8'), 'run: npm run supabase-sql').toBe(sql);
    const tables = await syncedTables(db);
    for (const t of tables) expect(sql).toContain(`create table if not exists public."${t.name}"`);
    expect(sql).toContain('public."app_setting" ("key" text primary key');
    expect(sql).toContain(`insert into public.sync_schema (version) values (${SCHEMA_VERSION});`);
    // No app column may clash with the two the cloud adds.
    for (const t of tables) expect(t.columns.filter((c) => c === 'user_id' || c === 'synced_at')).toEqual([]);
  });
});

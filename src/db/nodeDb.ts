import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { Db, SqlValue } from './adapter';

// node:sqlite is loaded with require so the test runner does not try to bundle it.
const here = import.meta.url.startsWith('file:') ? import.meta.url : `file://${process.cwd()}/package.json`;
const { DatabaseSync } = createRequire(here)('node:sqlite') as typeof import('node:sqlite');
type Conn = InstanceType<typeof DatabaseSync>;

function wrap(db: Conn): Db {
  return {
    async execute(sql: string, params: SqlValue[] = []) {
      db.prepare(sql).run(...params);
    },
    async select<T>(sql: string, params: SqlValue[] = []) {
      return db.prepare(sql).all(...params) as T[];
    },
  };
}

// Node-only adapters for tests and command-line scripts (for example a dry run of an importer).
export function openNodeDb(path = ':memory:'): Db {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON;');
  return wrap(db);
}

// Creates the database and applies the same migration files, in order, that the Rust shell embeds.
export function migrateNodeDb(path = ':memory:'): Db {
  const db = new DatabaseSync(path);
  // A test that pretends to be a browser gets a web address here instead of a file path, so fall back to the project folder.
  const root = import.meta.url.startsWith('file:') ? resolve(dirname(fileURLToPath(import.meta.url)), '../..') : process.cwd();
  const dir = resolve(root, 'src-tauri/migrations');
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) db.exec(readFileSync(resolve(dir, file), 'utf8'));
  db.exec('PRAGMA foreign_keys = ON;');
  return wrap(db);
}

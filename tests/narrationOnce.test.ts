import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
const dir = resolve(process.cwd(), 'src-tauri/migrations');
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

describe('one-time solo / dual narration migration', () => {
  it('fills only blank reads with one or two narrators, leaves the rest, and nothing changes later', () => {
    const db = new DatabaseSync(':memory:');
    for (const f of files.filter((x) => !x.startsWith('0022'))) db.exec(readFileSync(resolve(dir, f), 'utf8'));
    db.exec("INSERT INTO book (id, title) VALUES ('b', 'B')");
    for (const n of ['n1', 'n2', 'n3']) db.exec(`INSERT INTO narrator (id, name) VALUES ('${n}', '${n}')`);
    const read = (id: string, style: string | null, narrators: string[], extra = '') => {
      db.exec(`INSERT INTO read (id, book_id, status, narration_style${extra ? ', deleted_at' : ''}) VALUES ('${id}', 'b', 'finished', ${style ? `'${style}'` : 'NULL'}${extra ? `, '${extra}'` : ''})`);
      narrators.forEach((n, i) => db.exec(`INSERT INTO read_narrator (id, read_id, narrator_id, sort_order) VALUES ('${id}-${n}-${i}', '${id}', '${n}', ${i})`));
    };
    read('one', null, ['n1']); read('two', null, ['n1', 'n2']); read('three', null, ['n1', 'n2', 'n3']); read('none', null, []);
    read('kept', 'full_cast', ['n1']); read('keptdual', 'duet', ['n1', 'n2']);
    db.exec("INSERT INTO read_narrator (id, read_id, narrator_id, sort_order, deleted_at) VALUES ('gone', 'two', 'n3', 5, '2026-01-01')"); // a removed narrator does not count
    db.exec(readFileSync(resolve(dir, files.find((f) => f.startsWith('0022'))!), 'utf8'));
    const style = (id: string) => (db.prepare('SELECT narration_style AS s FROM read WHERE id = ?').get(id) as { s: string | null }).s;
    expect(['one', 'two', 'three', 'none', 'kept', 'keptdual'].map(style)).toEqual(['solo', 'dual', null, null, 'full_cast', 'duet']);
    // adding a narrator or a book afterwards does not touch any style
    db.exec("INSERT INTO read_narrator (id, read_id, narrator_id, sort_order) VALUES ('later', 'one', 'n2', 9)");
    db.exec("INSERT INTO read (id, book_id, status) VALUES ('newread', 'b', 'reading')");
    expect(style('one')).toBe('solo'); expect(style('newread')).toBeNull();
  });
});

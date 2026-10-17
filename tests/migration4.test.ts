import { createRequire } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
const dir = new URL('../src-tauri/migrations/', import.meta.url);
const file = (n: string) => readFileSync(new URL(n, dir), 'utf8');

function before() {
  const db = new DatabaseSync(':memory:');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql') && x < '0004').sort()) db.exec(file(f));
  db.exec('PRAGMA foreign_keys = ON;');
  const ch = (id: string, name: string, featured: number, origin: string | null = null) => db.prepare('INSERT INTO character (id, name, is_featured, origin_note) VALUES (?, ?, ?, ?)').run(id, name, featured, origin);
  ch('a-aiden', 'Aiden', 1, 'TAME'); ch('b-caspian', 'Caspian Devereaux', 1); ch('c-seraphina', 'Seraphina', 0);
  ch('a0-basic', 'Lena', 0); ch('d-inbook', 'Kit', 0); ch('e-reid', 'Reid', 1, 'DOLL'); ch('f-reid2', 'Reid', 1, 'doll');
  db.prepare("INSERT INTO book (id, title) VALUES ('bk1', 'A Book')").run();
  db.prepare("INSERT INTO book_character (id, book_id, character_id, role) VALUES ('l1', 'bk1', 'd-inbook', 'main')").run();
  const rel = (id: string, a: string, b: string, type: string, cur: number | null, ab: string | null, ba: string | null) =>
    db.prepare('INSERT INTO character_relationship (id, character_a_id, character_b_id, rel_type, is_current, a_is_to_b, b_is_to_a) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, a, b, type, cur, ab, ba);
  rel('r1', 'a-aiden', 'c-seraphina', 'friend', null, null, 'friend');          // Seraphina is Aiden's friend
  rel('r2', 'b-caspian', 'c-seraphina', 'family', null, null, 'relative');      // a different Seraphina, Caspian's relative
  rel('r3', 'a0-basic', 'b-caspian', 'family', null, 'sister', null);           // Lena (basic) is Caspian's sister
  rel('r4', 'a-aiden', 'b-caspian', 'friend', null, 'friend', 'friend');        // two real characters stay linked
  db.prepare("INSERT INTO character_alt_name (id, character_id, name) VALUES ('n1', 'c-seraphina', 'Sera')").run();
  return db;
}
const all = (db: InstanceType<typeof DatabaseSync>, sql: string) => db.prepare(sql).all() as Record<string, unknown>[];

describe('migration 4', () => {
  it('turns each mention of a basic character into a separate plain person on the mentioning character', () => {
    const db = before();
    db.exec(file('0004_plain_people_and_origin_tags.sql'));
    const people = all(db, "SELECT character_id AS owner, name, rel_type AS type, label FROM related_person ORDER BY owner, name");
    expect(people).toEqual([
      { owner: 'a-aiden', name: 'Seraphina', type: 'friend', label: 'friend' },
      { owner: 'b-caspian', name: 'Lena', type: 'family', label: 'sister' },
      { owner: 'b-caspian', name: 'Seraphina', type: 'family', label: 'relative' },
    ]);
    expect(all(db, "SELECT id FROM related_person WHERE name = 'Seraphina'")).toHaveLength(2); // not merged
  });
  it('removes the basic characters and their relationships, and keeps real ones', () => {
    const db = before();
    db.exec(file('0004_plain_people_and_origin_tags.sql'));
    expect(all(db, "SELECT name FROM character WHERE deleted_at IS NULL ORDER BY id").map((r) => r.name)).toEqual(['Aiden', 'Caspian Devereaux', 'Kit', 'Reid', 'Reid']);
    expect(all(db, "SELECT id FROM character_relationship WHERE deleted_at IS NULL").map((r) => r.id)).toEqual(['r4']);
    expect(all(db, "SELECT id FROM character_alt_name WHERE deleted_at IS NULL")).toEqual([]);
  });
  it('gives every remaining character a page, including a basic one that is in a book', () => {
    const db = before();
    db.exec(file('0004_plain_people_and_origin_tags.sql'));
    expect(all(db, 'SELECT count(*) AS n FROM character WHERE deleted_at IS NULL AND is_featured = 0')[0].n).toBe(0);
  });
  it('turns the parenthetical note into a tag, once for notes that differ only in capitals', () => {
    const db = before();
    db.exec(file('0004_plain_people_and_origin_tags.sql'));
    const tags = all(db, "SELECT c.name AS who, t.name AS tag FROM character_tag_link l JOIN character c ON c.id = l.character_id JOIN character_tag t ON t.id = l.character_tag_id WHERE l.deleted_at IS NULL ORDER BY c.id");
    expect(tags.map((t) => [t.who, String(t.tag).toLowerCase()])).toEqual([['Aiden', 'tame'], ['Reid', 'doll'], ['Reid', 'doll']]);
    expect(all(db, "SELECT count(*) AS n FROM character_tag WHERE lower(name) = 'doll'")[0].n).toBe(1);
    expect(all(db, 'SELECT color FROM character_tag').every((r) => /^#[0-9a-f]{6}$/i.test(String(r.color)))).toBe(true);
  });
  it('can run on an empty database', () => {
    const db = new DatabaseSync(':memory:');
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) db.exec(file(f));
    expect(all(db, 'SELECT count(*) AS n FROM related_person')[0].n).toBe(0);
  });
});

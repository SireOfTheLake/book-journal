import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { createBook, listBookList } from '../src/repo/books';
import { newId } from '../src/domain/ids';
import { bucket } from '../src/domain/makeup';

let db: Db;
beforeEach(() => { db = migrateNodeDb(); });

async function rejects(fn: () => Promise<unknown>) {
  await expect(fn()).rejects.toThrow();
}

describe('schema', () => {
  it('creates the seeded categories', async () => {
    const rows = await db.select<{ name: string }>("SELECT name FROM category ORDER BY name");
    expect(rows.map((r) => r.name)).toEqual(['Free Read', 'Next in Series', 'TBR', 'Treat', 'Trick']);
  });
  it('rejects bad data', async () => {
    const book = await createBook(db, { title: 'Test' });
    await rejects(() => db.execute('INSERT INTO read (id, book_id, rating) VALUES (?, ?, 21)', [newId(), book]));
    await rejects(() => db.execute('UPDATE book SET heat_level = 6 WHERE id = ?', [book]));
    await rejects(() => db.execute("INSERT INTO read (id, book_id, finish_time) VALUES (?, ?, '25:99')", [newId(), book]));
    await rejects(() => db.execute("INSERT INTO format_release (id, book_id, format, status) VALUES (?, ?, 'audio', 'dated')", [newId(), book]));
  });
  it('lets one read fill a slot in two challenges but not twice in one', async () => {
    const book = await createBook(db, { title: 'Slots' });
    const read = newId();
    await db.execute("INSERT INTO read (id, book_id, finish_date) VALUES (?, ?, '2026-03-01')", [read, book]);
    const year = newId();
    await db.execute('INSERT INTO journal_year (id, year) VALUES (?, 2026)', [year]);
    const ids = { c1: newId(), c2: newId(), s1: newId(), s2: newId(), s3: newId() };
    for (const c of [ids.c1, ids.c2]) await db.execute("INSERT INTO challenge (id, journal_year_id, name, slot_kind) VALUES (?, ?, 'C', 'named')", [c, year]);
    await db.execute('INSERT INTO challenge_slot (id, challenge_id, label, position) VALUES (?, ?, ?, 1)', [ids.s1, ids.c1, 'A']);
    await db.execute('INSERT INTO challenge_slot (id, challenge_id, label, position) VALUES (?, ?, ?, 2)', [ids.s2, ids.c1, 'B']);
    await db.execute('INSERT INTO challenge_slot (id, challenge_id, label, position) VALUES (?, ?, ?, 1)', [ids.s3, ids.c2, 'C']);
    const fill = (c: string, s: string) => db.execute('INSERT INTO challenge_completion (id, read_id, challenge_id, slot_id) VALUES (?, ?, ?, ?)', [newId(), read, c, s]);
    await fill(ids.c1, ids.s1);
    await fill(ids.c2, ids.s3);
    await rejects(() => fill(ids.c1, ids.s2));
    await rejects(() => fill(ids.c2, ids.s1));
  });
});

describe('views match the TypeScript rules', () => {
  const genderOf = { M: 'male', F: 'female', X: 'non_binary' } as const;
  for (const m of ['MM', 'MF', 'FX', 'MX', 'XX', 'FFF', 'MMMMMM', 'MMF', 'MMX']) {
    it(`bucket for ${m}`, async () => {
      const book = await createBook(db, { title: `Book ${m}` });
      for (const [i, ch] of [...m].entries()) {
        const c = newId();
        await db.execute('INSERT INTO character (id, name, gender) VALUES (?, ?, ?)', [c, `c${i}`, genderOf[ch as 'M' | 'F' | 'X']]);
        await db.execute("INSERT INTO book_character (id, book_id, character_id, role, sort_order) VALUES (?, ?, ?, 'main', ?)", [newId(), book, c, i]);
      }
      const [row] = await db.select<{ makeup: string; dashboard_bucket: string }>('SELECT makeup, dashboard_bucket FROM v_book_bucket WHERE book_id = ?', [book]);
      expect(row.makeup).toBe(m);
      expect(row.dashboard_bucket).toBe(bucket(m));
    });
  }
});

describe('book list and yearly numbering', () => {
  it('lists finished reads for a year, newest first, numbered by finish order', async () => {
    const add = async (title: string, date: string, time: string | null, author: string) => {
      const book = await createBook(db, { title, authors: [author] });
      await db.execute("INSERT INTO read (id, book_id, status, finish_date, finish_time, format) VALUES (?, ?, 'finished', ?, ?, 'audio')", [newId(), book, date, time]);
    };
    await add('First', '2026-01-02', null, 'C.S. Poe');
    await add('Second', '2026-03-01', '08:15', 'Lark Taylor');
    await add('Third', '2026-03-01', '21:30', 'Lark Taylor');
    await add('Last year', '2025-12-31', null, 'C.S. Poe');
    const rows = await listBookList(db, 2026);
    expect(rows.map((r) => r.title)).toEqual(['Third', 'Second', 'First']);
    expect(rows.map((r) => r.year_number)).toEqual([3, 2, 1]);
    expect(rows[0].authors).toBe('Lark Taylor');
  });
  it('reuses an author by name, ignoring case', async () => {
    await createBook(db, { title: 'One', authors: ['C.S. Poe'] });
    await createBook(db, { title: 'Two', authors: ['c.s. poe'] });
    const authors = await db.select('SELECT id FROM author');
    expect(authors).toHaveLength(1);
  });
});

describe('migration 3 (tag colors)', () => {
  it('gives existing tags without a color one from the palette', () => {
    const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
    const raw = new DatabaseSync(':memory:');
    const dir = new URL('../src-tauri/migrations/', import.meta.url);
    raw.exec(readFileSync(new URL('0001_initial.sql', dir), 'utf8'));
    for (const t of ['genre', 'theme', 'trope']) for (let i = 0; i < 12; i++) raw.prepare(`INSERT INTO ${t} (id, name) VALUES (?, ?)`).run(`${t}${i}`, `${t} ${i}`);
    raw.exec(readFileSync(new URL('0003_tag_colors.sql', dir), 'utf8'));
    const colors = raw.prepare('SELECT color FROM genre').all().map((r) => String((r as { color: string }).color));
    expect(colors.every((c) => /^#[0-9a-f]{6}$/i.test(c))).toBe(true);
    expect(new Set(colors).size).toBeGreaterThan(1); // random, not the same for every tag
  });
});

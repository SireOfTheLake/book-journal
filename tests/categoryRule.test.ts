import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { createBook } from '../src/repo/books';
import { createRead } from '../src/repo/bookLog';
import * as ch from '../src/repo/challenges';

let db: Db;
beforeEach(() => { db = migrateNodeDb(); });

async function mk(name: string, category: string | null) {
  const id = await ch.createGrid(db, { year: 2027, name, prompts: ['One', 'Two'] });
  await db.execute('UPDATE challenge SET published = 1, category_id = ? WHERE id = ?', [category, id]);
  return (await ch.getChallenge(db, id))!;
}

describe('one challenge per category', () => {
  it('lets a book fill prompts in different categories, and refuses a second in the same one', async () => {
    const a = await mk('2027 A', null), b = await mk('2027 B', null), c = await mk('2027 C', null);
    const yr = (await db.select<{ journal_year_id: string }>('SELECT journal_year_id FROM challenge WHERE id = ?', [a.id]))[0].journal_year_id;
    await db.execute("INSERT INTO challenge_category (id, journal_year_id, name, sort_order) VALUES ('c1', ?, 'Titles', 1), ('c2', ?, 'Plot', 2)", [yr, yr]);
    await db.execute("UPDATE challenge SET category_id = 'c1' WHERE id IN (?, ?)", [a.id, b.id]);
    await db.execute("UPDATE challenge SET category_id = 'c2' WHERE id = ?", [c.id]);
    const read = await createRead(db, await createBook(db, { title: 'Dual', authors: ['X'] }), 'finished');
    await ch.fillSlot(db, a.loose[0].id, read);
    await ch.fillSlot(db, c.loose[0].id, read); // another category: fine
    await expect(ch.fillSlot(db, b.loose[0].id, read)).rejects.toThrow(/same category/);
    await ch.fillSlot(db, a.loose[1].id, read); // moving within its own challenge is still fine
  });
});

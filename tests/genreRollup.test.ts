import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { addTag, createRead, updateRead } from '../src/repo/bookLog';
import { createBook } from '../src/repo/books';
import { getAuthor } from '../src/repo/people';
import { getYearlyDashboard } from '../src/repo/dashboard';
import { listBookTags, listTagOptions } from '../src/repo/search';

let db: Db;
beforeEach(() => { db = migrateNodeDb(); });

// 4 Romance books, 2 Dark Romance books, and one book with both: Romance counts 6 unique books, Dark Romance counts 2... plus the one with both
async function seed() {
  const ids: string[] = [];
  const mk = async (title: string, tags: string[]) => {
    const b = await createBook(db, { title, authors: ['Au'] });
    for (const t of tags) await addTag(db, b, 'genre', t);
    const r = await createRead(db, b, 'finished');
    await updateRead(db, r, { finish_date: '2026-03-05' });
    ids.push(b); return b;
  };
  for (let i = 0; i < 4; i++) await mk(`R${i}`, ['Romance']);
  for (let i = 0; i < 2; i++) await mk(`D${i}`, ['Dark Romance']);
  await mk('Both', ['Romance', 'Dark Romance']);
  await mk('Dark only', ['Dark']);
  return ids;
}

describe('Dark Romance counts as Romance', () => {
  it('tag options count each unique book once, and Romance does not count as Dark Romance', async () => {
    await seed();
    const o = await listTagOptions(db);
    const n = (name: string) => o.find((x) => x.kind === 'genre' && x.name === name)!.count;
    expect(n('Romance')).toBe(7); // 4 + 2 + the one with both
    expect(n('Dark Romance')).toBe(3);
    expect(n('Dark')).toBe(1);
  });
  it('searching by the Romance tag finds Dark Romance books too, once each', async () => {
    await seed();
    const o = await listTagOptions(db); const t = await listBookTags(db);
    const id = (name: string) => o.find((x) => x.name === name)!.id;
    expect(t[`genre:${id('Romance')}`]).toHaveLength(7);
    expect(new Set(t[`genre:${id('Romance')}`]).size).toBe(7);
    expect(t[`genre:${id('Dark Romance')}`]).toHaveLength(3);
  });
  it('the dashboard and an author page count the same way', async () => {
    await seed();
    const d = await getYearlyDashboard(db, 2026, '2026-12-31');
    const top = d.top.genres.find((g) => g.name === 'Romance');
    expect(top?.count).toBe(7);
    expect(d.top.genres.find((g) => g.name === 'Dark Romance')?.count).toBe(3);
    const [{ id }] = await db.select<{ id: string }>("SELECT id FROM author WHERE name = 'Au'");
    const a = (await getAuthor(db, id))!;
    expect(a.genres.find((g) => g.name === 'Romance')?.n).toBe(7);
  });
});

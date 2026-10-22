import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { migrateNodeDb } from '../src/db/nodeDb';
import { createNarrator } from '../src/repo/bookLog';
import { quickAdd } from '../src/repo/bookLog';

const links = async (db: ReturnType<typeof migrateNodeDb>, table: 'author' | 'narrator', name: string) =>
  JSON.parse((await db.select<{ links: string }>(`SELECT links FROM ${table} WHERE name = ?`, [name]))[0].links);

describe('Audible page links', () => {
  it('are filled in for the authors and narrators you already have, once, keeping their other links', async () => {
    const db = migrateNodeDb();
    await db.execute("INSERT INTO author (id, name, links) VALUES ('a1', 'A.J. Sherwood', NULL), ('a2', 'Eden Finley', '[{\"label\":\"Site\",\"url\":\"https://e.com\"}]'), ('a3', 'Done Already', '[{\"label\":\"Audible Page\",\"url\":\"https://x\"}]')");
    await db.execute("INSERT INTO narrator (id, name, links) VALUES ('n1', 'Joe Jameson', NULL)");
    await db.execute("UPDATE author SET links = NULL WHERE id = 'a1'");
    const sql = readFileSync('src-tauri/migrations/0029_audible_links_and_accents.sql', 'utf8');
    for (const st of sql.split(/;\s*\n/).filter((x) => /^\s*UPDATE (author|narrator) SET links/m.test(x))) await db.execute(st);
    const one = async (t: string, id: string) => JSON.parse((await db.select<{ links: string }>(`SELECT links FROM ${t} WHERE id = ?`, [id]))[0].links);
    expect(await one('author', 'a1')).toEqual([{ label: 'Audible Page', url: 'https://www.audible.ca/author/A-J-Sherwood' }]);
    expect((await one('author', 'a2')).map((l: { label: string }) => l.label)).toEqual(['Site', 'Audible Page']);
    expect(await one('author', 'a3')).toEqual([{ label: 'Audible Page', url: 'https://x' }]);
    expect((await one('narrator', 'n1'))[0].url).toBe('https://www.audible.ca/search?searchNarrator=Joe+Jameson');
  });
  it('are added to every new author and narrator', async () => {
    const db = migrateNodeDb();
    await quickAdd(db, { title: 'B', authors: ['J.J. Mulder', 'Ann Lee'], status: 'tbr' });
    await createNarrator(db, 'Daniel Lewis');
    expect(await links(db, 'author', 'J.J. Mulder')).toEqual([{ label: 'Audible Page', url: 'https://www.audible.ca/author/J-J-Mulder' }]);
    expect(await links(db, 'author', 'Ann Lee')).toEqual([{ label: 'Audible Page', url: 'https://www.audible.ca/author/Ann-Lee' }]);
    expect(await links(db, 'narrator', 'Daniel Lewis')).toEqual([{ label: 'Audible Page', url: 'https://www.audible.ca/search?searchNarrator=Daniel+Lewis' }]);
  });
  it('do not come back for one that already has links', async () => {
    const db = migrateNodeDb();
    await db.execute("INSERT INTO narrator (id, name, links) VALUES ('n1', 'Zed Q', '[]')");
    expect(await links(db, 'narrator', 'Zed Q')).toEqual([]);
  });
});

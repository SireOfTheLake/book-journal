import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { applyNotionPlan } from '../src/import/apply';
import { applyNotionCharacters } from '../src/import/applyCharacters';
import { parseRef, parseRefs, planNotionCharacters, splitTopLevel } from '../src/import/notionCharacters';
import { planNotionBooks } from '../src/import/notion';
import { undoImport } from '../src/import/writer';

const csv = readFileSync(new URL('./fixtures/characters.csv', import.meta.url), 'utf8');
const n = async (db: Db, sql: string, p: (string | number | null)[] = []) => Number((await db.select<{ n: number }>(sql, p))[0].n);

describe('parsing the text properties', () => {
  it('reads a linked friend with a label after the link', () => {
    expect(parseRef('Troy Nichols (Troy%20Nichols%20297a585107068059abf2f3daf7c49fa0.md) (old teammate)')).toEqual({
      name: 'Troy Nichols', origin: null, notionId: '297a585107068059abf2f3daf7c49fa0', label: 'old teammate', linked: true });
  });
  it('reads a name with an origin and a link that has its own parentheses', () => {
    expect(parseRef('Ray (Hole) (Ray%20(Hole)%20330a585107068078948ae043d0f8f428.csv)')).toMatchObject({
      name: 'Ray', origin: 'Hole', notionId: '330a585107068078948ae043d0f8f428', linked: true });
  });
  it('does not split on commas inside labels', () => {
    expect(splitTopLevel('Mary (mother, deceased), David (father)')).toEqual(['Mary (mother, deceased)', 'David (father)']);
    expect(parseRefs('Mary (mother, deceased), David (father)').map((r) => [r.name, r.label])).toEqual([['Mary', 'mother, deceased'], ['David', 'father']]);
  });
  it('reads unlinked names with and without labels', () => {
    expect(parseRef('Billy Rolker (ex-boyfriend)')).toMatchObject({ name: 'Billy Rolker', label: 'ex-boyfriend', linked: false });
    expect(parseRef('Kat')).toMatchObject({ name: 'Kat', label: null, linked: false });
  });
});

describe('planning your real characters file', () => {
  const plan = planNotionCharacters(csv);
  const row = (name: string) => plan.rows.find((r) => r.name === name)!;
  it('reads all 12 characters with their details', () => {
    expect(plan.rows).toHaveLength(12);
    expect(row('Emery Hazard').nicknames.map((x) => x.name)).toEqual(['Em', 'Ree']);
    expect(row('Emery Hazard').previousPartners.map((x) => x.name)).toEqual(['Billy Rolker', 'Nico Flores']);
    expect(row('Nico Flores').occupations).toEqual(['Model', 'Student']);
    expect(row('Matt')).toMatchObject({ origin: 'Hole' });
  });
  it('learns each page id from the links other characters make to it', () => {
    expect(row('John-Henry Somerset').notionId).toBe('32aa58510706801488a0c2b0ddc87b20');
    expect(row('Ray').notionId).toBe('330a585107068078948ae043d0f8f428');
  });
  it('merges the two spellings of St Louis', () => {
    expect(plan.places.filter((p) => p.name.toLowerCase().replace('.', '') === 'st louis')).toHaveLength(1);
    expect(plan.warnings.some((w) => w.message.includes('St Louis') && w.message.includes('St. Louis'))).toBe(true);
    expect(plan.places).toHaveLength(7);
  });
});

describe('applying the characters import', () => {
  let db: Db;
  beforeEach(() => { db = migrateNodeDb(); });
  const plan = planNotionCharacters(csv);

  it('creates featured characters, basic ones, names, places, and relationships', async () => {
    const r = await applyNotionCharacters(db, plan);
    expect(r.featured).toBe(12);
    expect(await n(db, 'SELECT count(*) AS n FROM character WHERE is_featured = 1')).toBe(r.charactersCreated); // every character has a page
    expect(r.peopleAdded).toBeGreaterThan(10); // Aileen, Frank, Billy, Kat, Mary, David ...
    expect(await n(db, "SELECT count(*) AS n FROM character WHERE name = 'Aileen'")).toBe(0); // only named, so not a character
    const [aileen] = await db.select<{ who: string; label: string }>("SELECT c.name AS who, p.label AS label FROM related_person p JOIN character c ON c.id = p.character_id WHERE p.name = 'Aileen'");
    expect(aileen).toEqual({ who: 'Emery Hazard', label: 'mother' });
    expect(await n(db, "SELECT count(*) AS n FROM place WHERE lower(replace(name, '.', '')) = 'st louis'")).toBe(1);
    expect(await n(db, 'SELECT count(*) AS n FROM sexuality')).toBe(3);
    expect(await n(db, "SELECT count(*) AS n FROM character_occupation co JOIN occupation o ON o.id = co.occupation_id WHERE o.name = 'Private Detective/Investigator'")).toBe(2);
  });
  it('records partners once even when both characters list each other', async () => {
    await applyNotionCharacters(db, plan);
    const pair = (a: string, b: string) => n(db,
      `SELECT count(*) AS n FROM character_relationship r JOIN character x ON x.id = r.character_a_id JOIN character y ON y.id = r.character_b_id
       WHERE r.rel_type = 'partner' AND ((x.name = ? AND y.name = ?) OR (x.name = ? AND y.name = ?))`, [a, b, b, a]);
    expect(await pair('Emery Hazard', 'John-Henry Somerset')).toBe(1);
    expect(await pair('Matt', 'Ray')).toBe(1);
    const [cur] = await db.select<{ c: number }>("SELECT r.is_current AS c FROM character_relationship r JOIN character x ON x.id = r.character_a_id JOIN character y ON y.id = r.character_b_id WHERE x.name IN ('Emery Hazard', 'John-Henry Somerset') AND y.name IN ('Emery Hazard', 'John-Henry Somerset')");
    expect(cur.c).toBe(1);
  });
  it('keeps both labels when each side describes the same ex', async () => {
    await applyNotionCharacters(db, plan);
    const [r] = await db.select<{ a: string; b: string }>(
      `SELECT a_is_to_b AS a, b_is_to_a AS b FROM character_relationship r JOIN character x ON x.id = r.character_a_id JOIN character y ON y.id = r.character_b_id
       WHERE x.name IN ('Emery Hazard', 'Nico Flores') AND y.name IN ('Emery Hazard', 'Nico Flores')`);
    expect([r.a, r.b].sort()).toEqual(['boyfriend', 'boyfriend - Pretty Pretty Boys-Guilt by Association']);
  });
  it('adds nicknames as typed alternative names', async () => {
    await applyNotionCharacters(db, plan);
    const names = await db.select<{ n: string; t: string }>("SELECT a.name AS n, t.name AS t FROM character_alt_name a JOIN name_type t ON t.id = a.name_type_id JOIN character c ON c.id = a.character_id WHERE c.name IN ('Emery Hazard', 'Shaw Aldrich') ORDER BY a.name");
    expect(names).toEqual([{ n: 'Em', t: 'Nickname' }, { n: 'Kingsley Shaw Wilder Aldrich', t: 'Real name' }, { n: 'Ree', t: 'Nickname' }]);
  });
  it('adds nothing the second time', async () => {
    await applyNotionCharacters(db, plan);
    const again = await applyNotionCharacters(db, plan);
    expect(again).toMatchObject({ charactersCreated: 0, peopleAdded: 0, altNames: 0, relationships: 0, placesCreated: 0 });
  });
});

describe('names, notes in parentheses, and people with the same name', () => {
  it('moves a note in parentheses to a tag and keeps the name clean', async () => {
    const db = migrateNodeDb();
    await applyNotionCharacters(db, planNotionCharacters(csv));
    const rows = await db.select<{ name: string; tag: string }>("SELECT c.name AS name, t.name AS tag FROM character c JOIN character_tag_link l ON l.character_id = c.id JOIN character_tag t ON t.id = l.character_tag_id WHERE c.name IN ('Matt', 'Ray')");
    expect(rows.map((r) => [r.name, r.tag])).toEqual(expect.arrayContaining([['Matt', 'Hole'], ['Ray', 'Hole']]));
    expect(await n(db, "SELECT count(*) AS n FROM character_tag WHERE lower(name) = 'hole'")).toBe(1); // one shared tag
    expect(await n(db, "SELECT count(*) AS n FROM character WHERE name LIKE '%(%'")).toBe(0);
  });
  it('keeps two same-named people on different characters apart', async () => {
    const db = migrateNodeDb();
    const two = 'Name,Friends,Family\nAiden (TAME),"Seraphina (friend)",\nCaspian Devereaux,,"Seraphina (relative)"\n';
    const r = await applyNotionCharacters(db, planNotionCharacters(two));
    expect(r).toMatchObject({ charactersCreated: 2, peopleAdded: 2 });
    expect(await n(db, "SELECT count(*) AS n FROM character WHERE name = 'Seraphina'")).toBe(0);
    const rows = await db.select<{ who: string; type: string; label: string }>("SELECT c.name AS who, p.rel_type AS type, p.label AS label FROM related_person p JOIN character c ON c.id = p.character_id WHERE p.name = 'Seraphina' ORDER BY c.name");
    expect(rows).toEqual([{ who: 'Aiden', type: 'friend', label: 'friend' }, { who: 'Caspian Devereaux', type: 'family', label: 'relative' }]);
    expect(await n(db, "SELECT count(*) AS n FROM character_tag_link l JOIN character_tag t ON t.id = l.character_tag_id WHERE t.name = 'TAME'")).toBe(1);
  });
});

describe('together with the books import', () => {
  const books = 'Title,Author,Characters,Connected Characters,Date Read,Format,Narrator,Notes,Series,Tags\n'
    + 'Bro Doll,J. De Saint,"Reid (DOLL) (https://app.notion.com/p/Reid-DOLL-3f0a58510706809b9887efe50df4c3cf?pvs=21), Plain Person","","October 4, 2026",eBook,,,,\n';
  const chars = 'Name,Organization,Current Partner\n"Reid (DOLL)",,\nKit Adler,,"Reid (DOLL) (Reid%20(DOLL)%203f0a58510706809b9887efe50df4c3cf.csv)"\nPlain Person,Club,\n';
  const count = (db: Db) => n(db, "SELECT count(*) AS n FROM character WHERE name = 'Reid'");

  it('does not duplicate a character, whichever file is imported first', async () => {
    for (const order of ['books-first', 'characters-first']) {
      const db = migrateNodeDb();
      const run = async (which: 'b' | 'c') => which === 'b' ? applyNotionPlan(db, planNotionBooks(books), { tagDestinations: {} }) : applyNotionCharacters(db, planNotionCharacters(chars));
      for (const w of (order === 'books-first' ? ['b', 'c'] : ['c', 'b']) as ('b' | 'c')[]) await run(w);
      expect(await count(db)).toBe(1);
      expect(await n(db, "SELECT count(*) AS n FROM character_tag_link l JOIN character_tag t ON t.id = l.character_tag_id WHERE t.name = 'DOLL'")).toBe(1); // tagged once, from either file
      expect(await n(db, "SELECT count(*) AS n FROM character WHERE name = 'Plain Person'")).toBe(1);
      expect(await n(db, "SELECT count(*) AS n FROM character WHERE name = 'Reid' AND json_extract(external_ids, '$.notion_page_id') = '3f0a58510706809b9887efe50df4c3cf'")).toBe(1);
      expect(await n(db, "SELECT count(*) AS n FROM book_character")).toBe(2);
    }
  });
  it('undo removes what was added and puts back what was filled in', async () => {
    const db = migrateNodeDb();
    await applyNotionPlan(db, planNotionBooks(books), { tagDestinations: {} });
    const [before] = await db.select<{ f: number; o: string | null }>("SELECT is_featured AS f, organization AS o FROM character WHERE name = 'Plain Person'");
    expect(before).toEqual({ f: 1, o: null });
    const r = await applyNotionCharacters(db, planNotionCharacters(chars));
    const [mid] = await db.select<{ f: number; o: string | null }>("SELECT is_featured AS f, organization AS o FROM character WHERE name = 'Plain Person'");
    expect(mid).toEqual({ f: 1, o: 'Club' });
    await undoImport(db, r.batchId);
    const [after] = await db.select<{ f: number; o: string | null }>("SELECT is_featured AS f, organization AS o FROM character WHERE name = 'Plain Person' AND deleted_at IS NULL");
    expect(after).toEqual({ f: 1, o: null });
    expect(await n(db, "SELECT count(*) AS n FROM character WHERE name = 'Kit Adler' AND deleted_at IS NULL")).toBe(0);
    expect(await n(db, 'SELECT count(*) AS n FROM character_relationship WHERE deleted_at IS NULL')).toBe(0);
  });
});

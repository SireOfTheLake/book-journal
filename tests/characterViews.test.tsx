import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { beforeAll, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { applyNotionPlan } from '../src/import/apply';
import { applyNotionCharacters } from '../src/import/applyCharacters';
import { planNotionBooks } from '../src/import/notion';
import { planNotionCharacters } from '../src/import/notionCharacters';
import CharacterListView from '../src/pages/characters/CharacterListView';
import CharacterView, { type CharacterActions } from '../src/pages/characters/CharacterView';
import { getCharacter, listBookOptions, listCharacterOptions, listCharacters, listNamed, updateCharacter } from '../src/repo/characters';

const read = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');
const noop = () => undefined;
const act = new Proxy({}, { get: () => noop }) as CharacterActions;
let db: Db;
const idOf = async (n: string) => (await db.select<{ id: string }>('SELECT id FROM character WHERE name = ?', [n]))[0].id;
const wrap = (el: JSX.Element) => renderToString(<StaticRouter location="/">{el}</StaticRouter>);

beforeAll(async () => {
  db = migrateNodeDb();
  await applyNotionPlan(db, planNotionBooks(read('book-tracker.csv')), { tagDestinations: {} });
  await applyNotionCharacters(db, planNotionCharacters(read('characters.csv')));
});

async function page(name: string) {
  const d = (await getCharacter(db, await idOf(name)))!;
  const lists = { sexualities: await listNamed(db, 'sexuality'), occupations: await listNamed(db, 'occupation'), places: await listNamed(db, 'place'), nameTypes: await listNamed(db, 'name_type'), tags: await listNamed(db, 'character_tag'), characters: await listCharacterOptions(db), books: await listBookOptions(db) };
  return wrap(<CharacterView d={d} lists={lists} act={act} />);
}

it('renders the character list with featured and basic characters', async () => {
  const html = wrap(<CharacterListView rows={await listCharacters(db)} onCreate={noop} />);
  for (const text of ['Find a character', 'Emery Hazard', 'John-Henry Somerset', 'New character', 'Not in a book yet', 'Hole']) expect(html, text).toContain(text);
  expect(html).not.toContain('>Aileen<'); // only named, so not in the character list
  expect(html).not.toContain('Basic');
});

it('renders a featured character page with art, identity, relationships, and books', async () => {
  const id = await idOf('Emery Hazard');
  await updateCharacter(db, id, { gender: 'male', age_min: 30, age_max: 34, age_is_approximate: 1 });
  const html = await page('Emery Hazard');
  for (const text of ['Add main art', 'Gallery', 'Identity', 'Gender', 'Transgender', '30 to 34', 'approx.', 'Work and places', 'Wahredua', 'St Louis', 'Alternative names', 'Em', 'Ree', 'Relationships', 'Current Partner', 'John-Henry Somerset', 'Previous Partner', 'Billy Rolker', 'Nico Flores', 'Family', 'Aileen', 'mother', 'Make a character', 'Link to a character', 'Books', 'Add to a book', 'Description', 'Add status', '+ status', 'Main art from a link']) expect(html, text).toContain(text);
  expect(html).not.toContain('Featured page');
});

it('shows a character that is not in a book yet, with the tag that says which book', async () => {
  const html = await page('Matt');
  expect(html).toContain('Not in a book yet');
  expect(html).toContain('Hole');
  expect(html).toContain('Add to a book');
});

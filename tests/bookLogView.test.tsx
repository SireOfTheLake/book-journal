import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { applyNotionPlan } from '../src/import/apply';
import { applyNotionCharacters } from '../src/import/applyCharacters';
import { planNotionBooks } from '../src/import/notion';
import { planNotionCharacters } from '../src/import/notionCharacters';
import BookLogView, { type Actions } from '../src/pages/bookLog/BookLogView';
import { getBookLog, listItems, listTagOptions, updateRead } from '../src/repo/bookLog';

const read = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');
const noop = () => undefined;
const act: Actions = { setStatus: noop, updateBook: noop, updateRead: noop, addTag: noop, removeTag: noop, renameTag: noop, narratorRating: noop, addNarratorAccent: noop, removeNarratorAccent: noop, renameAccent: noop, saveEntry: noop, deleteEntry: noop, newRead: noop, deleteRead: noop, createItem: noop, setSeries: noop, createSeries: noop, addCharacter: noop, createCharacter: noop, removeCharacter: noop, addAuthor: noop, createAuthor: noop, removeAuthor: noop, addNarrator: noop, createNarrator: noop, removeNarrator: noop, setCoverFile: noop, setCoverUrl: async () => undefined, setCoverCandidate: async () => undefined, removeCover: noop, removeTimePeriod: () => undefined, startReading: () => undefined, renameItem: () => undefined, removeSource: () => undefined, voiceAdd: () => undefined, voiceRemove: () => undefined, saveLocation: async () => undefined };
let db: Db;

async function html(title: string) {
  const [{ id }] = await db.select<{ id: string }>('SELECT id FROM book WHERE title = ?', [title]);
  const log = (await getBookLog(db, id))!;
  const lists = { sources: await listItems(db, 'source'), timePeriods: await listItems(db, 'time_period'), accents: await listItems(db, 'accent'), places: await listItems(db, 'place'), genres: await listTagOptions(db, 'genre'), themes: await listTagOptions(db, 'theme'), tropes: await listTagOptions(db, 'trope'), series: [], characters: [], authors: [], narrators: [] };
  return renderToString(<StaticRouter location="/"><BookLogView log={log} lists={lists} act={act} /></StaticRouter>);
}

beforeAll(async () => {
  db = migrateNodeDb();
  await applyNotionPlan(db, planNotionBooks(read('book-tracker.csv')), { tagDestinations: { hockey: 'genre', sports: 'genre' } });
  await applyNotionCharacters(db, planNotionCharacters(read('characters.csv')));
});

describe('Book Log screen', () => {
  it('shows a finished audiobook with all of its parts', async () => {
    const [{ id }] = await db.select<{ id: string }>("SELECT id FROM book WHERE title = 'Egotistical Puckboy'");
    const [{ rid }] = await db.select<{ rid: string }>('SELECT id AS rid FROM read WHERE book_id = ?', [id]);
    await updateRead(db, rid, { rating: 18 });
    const out = await html('Egotistical Puckboy');
    for (const text of ['BOOK LOG', 'Egotistical Puckboy', 'Eden Finley', 'Saxon James', 'Puckboys', 'Alexander Cendese', 'Iggy Toma', 'hockey', 'Heat level', 'Day log', 'Add another read', 'Characters in this book', '2025-07-27']) {
      expect(out, text).toContain(text);
    }
    expect(out).toMatch(/Read <!-- -->1/);
    expect(out).toContain('Change status');
    expect(out).toContain('+ Add character');
    expect(out).toContain('clip-path'); // a 4.5 rating shades part of a star
    for (const text of ['Add pages', 'Add publication date', '+ add', 'Add time period', 'Add source', 'Add notes', 'Add genre', 'Add trope', 'Add theme']) expect(out, text).toContain(text);
    expect(out).toContain('style="border-color:');
    // Setting and Time period are stacked in one column; publication is its own card.
    expect(out.indexOf('Setting')).toBeLessThan(out.indexOf('Time period'));
    expect(out).toContain('stackcol');
  });
  it('shows a book on the Up Next shelf without read details', async () => {
    const out = await html('Hooks In');
    expect(out).toContain('Hooks In');
    expect(out).toContain('Start the book to rate it.');
    expect(out).toContain('Choose <b>In Progress</b>');
    expect(out).not.toContain('Day log');
  });
  it('shows main characters with their details and relationships', async () => {
    const [{ id }] = await db.select<{ id: string }>("SELECT id FROM book WHERE title = 'Bro Doll'");
    await db.execute("UPDATE character SET gender = 'male' WHERE id IN (SELECT character_id FROM book_character WHERE book_id = ? AND role = 'main')", [id]);
    const out = await html('Bro Doll');
    expect(out).toContain('>Reid<');
    expect(out).not.toContain('(DOLL)'); // the note is a tag on the character, not part of the name
    expect(out).toMatch(/M(\/M)+/);
    expect(out).toContain('Main');
  });
});

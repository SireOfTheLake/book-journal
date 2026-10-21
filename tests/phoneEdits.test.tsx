// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readdirSync, readFileSync } from 'node:fs';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { DbContext } from '../src/db/DbContext';
import { openPhoneDatabase } from '../src/phone/sqljsDb';
import BookLog from '../src/phone/screens/BookLog';
import Character from '../src/phone/screens/Character';
import { getBookLog, quickAdd } from '../src/repo/bookLog';
import { addCharacterToBook, addRelationship, createCharacter, getCharacter } from '../src/repo/characters';

let SQL: SqlJsStatic;
const files = readdirSync('src-tauri/migrations').filter((f) => f.endsWith('.sql')).sort().map((f) => readFileSync(`src-tauri/migrations/${f}`, 'utf8'));
beforeAll(async () => { SQL = await initSqlJs(); });
afterEach(cleanup);
async function freshDb(): Promise<Db> {
  const { db } = await openPhoneDatabase(SQL, files, { load: async () => ({ bytes: null, applied: 0 }), save: async () => undefined }, 60_000);
  return db;
}
const at = (db: Db, path: string) => render(
  <DbContext.Provider value={db}><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/book/:bookId" element={<BookLog />} /><Route path="/book/:bookId/:readId" element={<BookLog />} /><Route path="/character/:characterId" element={<Character />} />
  </Routes></MemoryRouter></DbContext.Provider>);
const press = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));

describe('phone: book log edits', () => {
  it('has no synopsis, and the series can be added, repositioned, changed and removed on the book', async () => {
    const db = await freshDb();
    const { bookId } = await quickAdd(db, { title: 'Solo Book', authors: ['Ann'], status: 'reading' });
    await db.execute("INSERT INTO series (id, title) VALUES ('s2', 'Other Saga')");
    at(db, `/book/${bookId}`);
    await screen.findByText('Solo Book', { selector: 'h1' });
    expect(screen.queryByText('Synopsis')).toBeNull();
    press('Edit title and pages');
    expect(screen.queryByLabelText('Synopsis')).toBeNull();
    expect(screen.queryByLabelText('Series number')).toBeNull();
    press('Done');

    press('+ Add to a series');
    fireEvent.change(screen.getByLabelText('Search series'), { target: { value: 'Brand New' } });
    // the create row comes first, above the keyboard
    const opts = screen.getAllByRole('button').filter((b) => b.classList.contains('ph-opt'));
    expect(opts[0].textContent).toMatch(/Create new series.*Brand New/);
    fireEvent.click(opts[0]);
    await screen.findByLabelText('Take this book out of Brand New');
    fireEvent.change(screen.getByLabelText('Position in series'), { target: { value: '2.5' } });
    fireEvent.blur(screen.getByLabelText('Position in series'));
    await waitFor(async () => expect((await getBookLog(db, bookId))?.book.series_position).toBe(2.5));

    press('Change series');
    fireEvent.click(await screen.findByText('Other Saga'));
    await screen.findByLabelText('Take this book out of Other Saga');
    expect((await getBookLog(db, bookId))?.book.series_position).toBe(2.5); // the position stays

    fireEvent.click(screen.getByLabelText('Take this book out of Other Saga'));
    await screen.findByText('+ Add to a series');
    const log = await getBookLog(db, bookId);
    expect([log?.series, log?.book.series_position]).toEqual([null, null]);
  });

  it('adds a location from the existing ones, or a new one with country, area and city', async () => {
    const db = await freshDb();
    const { bookId } = await quickAdd(db, { title: 'Travel Book', authors: ['Ann'], status: 'reading' });
    await db.execute("INSERT INTO place (id, name, city, country, located) VALUES ('p1', 'Dublin, Ireland', 'Dublin', 'Ireland', 1)");
    await db.execute("INSERT INTO place (id, name, located) VALUES ('p2', 'Somewhere odd', 0)");
    at(db, `/book/${bookId}`);
    await screen.findByText('Setting');
    press('+ Add location');
    fireEvent.click(await screen.findByText('Dublin, Ireland'));
    await screen.findByLabelText('Remove Dublin, Ireland');

    press('+ Add location');
    fireEvent.click(await screen.findByText('Somewhere odd'));
    await screen.findByLabelText('Needs updating'); // plain text, like on the computer

    press('+ Add location');
    fireEvent.click(await screen.findByText('New location...'));
    fireEvent.change(screen.getByPlaceholderText('Country'), { target: { value: 'Canada' } });
    fireEvent.change(screen.getByPlaceholderText('Area'), { target: { value: 'Manitoba' } });
    fireEvent.change(screen.getByPlaceholderText('City'), { target: { value: 'Winnipeg' } });
    press('Save location');
    await waitFor(async () => expect((await getBookLog(db, bookId))?.places.map((p) => p.name).join('|')).toMatch(/Winnipeg/));
    const places = (await getBookLog(db, bookId))!.places;
    expect(places).toHaveLength(3);
    expect(places.find((p) => /Winnipeg/.test(p.name))).toMatchObject({ city: 'Winnipeg', country: 'Canada', needsUpdate: false });
  });

  it('shows main characters apart from side ones, orange only for those with a page, and no way to demote a main one', async () => {
    const db = await freshDb();
    const { bookId } = await quickAdd(db, { title: 'Cast Book', authors: ['Ann'], status: 'reading' });
    const hero = await createCharacter(db, 'Hero'); const extra = await createCharacter(db, 'Extra', false);
    await db.execute('UPDATE character SET is_featured = 1 WHERE id = ?', [hero]);
    await addCharacterToBook(db, hero, bookId, 'main'); await addCharacterToBook(db, extra, bookId, 'side');
    at(db, `/book/${bookId}`);
    await screen.findByText('Main characters');
    expect(screen.getByText('Side characters')).toBeTruthy();
    expect(screen.getByText('Hero').classList.contains('page')).toBe(true);
    expect(screen.getByText('Extra').classList.contains('page')).toBe(false);
    expect(screen.queryByRole('button', { name: 'Make side' })).toBeNull();
    const main = screen.getByText('Main characters').closest('.ph-cast') as HTMLElement;
    expect(within(main).queryByRole('button', { name: 'Make main' })).toBeNull();
    press('Make main');
    await waitFor(async () => expect((await getBookLog(db, bookId))!.characters.map((c) => c.role)).toEqual(['main', 'main']));
    // removing asks first
    fireEvent.click(screen.getByLabelText('Remove Extra from this book'));
    expect((await getBookLog(db, bookId))!.characters).toHaveLength(2);
    fireEvent.click(await screen.findByLabelText('Confirm: Remove Extra from this book'));
    await waitFor(async () => expect((await getBookLog(db, bookId))!.characters).toHaveLength(1));
  });
});

describe('phone: character edits', () => {
  it('removes connected characters (after asking) and edits current and previous places', async () => {
    const db = await freshDb();
    const a = await createCharacter(db, 'Alaric'); const w = await createCharacter(db, 'Wren');
    await addRelationship(db, w, { id: a }, 'partner', 1, 'partner');
    await db.execute("INSERT INTO place (id, name, city, country, located) VALUES ('p1', 'Dublin, Ireland', 'Dublin', 'Ireland', 1)");
    await db.execute("INSERT INTO place (id, name, city, country, located) VALUES ('p2', 'Paris, France', 'Paris', 'France', 1)");
    await db.execute("INSERT INTO place (id, name, city, country, located) VALUES ('p3', 'Oslo, Norway', 'Oslo', 'Norway', 1)");
    at(db, `/character/${w}`);
    await screen.findByText('Alaric');

    fireEvent.click(screen.getByLabelText('Remove the link to Alaric'));
    expect((await getCharacter(db, w))!.relationships).toHaveLength(1);
    fireEvent.click(await screen.findByLabelText('Confirm: Remove the link to Alaric'));
    await waitFor(async () => expect((await getCharacter(db, w))!.relationships).toHaveLength(0));

    press('+ Add current place');
    fireEvent.click(await screen.findByText('Dublin, Ireland'));
    await waitFor(async () => expect((await getCharacter(db, w))!.place?.name).toBe('Dublin, Ireland'));
    press('Change current place'); // only one current place: picking replaces it
    fireEvent.click(await screen.findByText('Paris, France'));
    await waitFor(async () => expect((await getCharacter(db, w))!.place?.name).toBe('Paris, France'));

    press('+ Add previous place');
    fireEvent.click(await screen.findByText('Dublin, Ireland'));
    await waitFor(async () => expect((await getCharacter(db, w))!.previousPlaces).toHaveLength(1));
    press('+ Add previous place');
    fireEvent.click(await screen.findByText('Oslo, Norway'));
    await waitFor(async () => expect((await getCharacter(db, w))!.previousPlaces.map((p) => p.name)).toEqual(['Dublin, Ireland', 'Oslo, Norway']));
  });
});

describe('phone: keyboard', () => {
  it('lifts a sheet above the keyboard and keeps it inside the visible area', async () => {
    const { PickerSheet } = await import('../src/phone/kit');
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    const listeners: Record<string, () => void> = {};
    const vv = { height: 400, offsetTop: 0, addEventListener: (n: string, f: () => void) => { listeners[n] = f; }, removeEventListener: () => undefined };
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
    render(<PickerSheet title="Tags" options={[{ id: '1', name: 'One' }]} onPick={() => undefined} onClose={() => undefined} />);
    const sheet = screen.getByRole('dialog', { name: 'Tags' });
    expect(sheet.style.bottom).toBe('400px'); // it sits on top of the keyboard
    expect(sheet.style.maxHeight).toBe('368px'); // and never taller than what can be seen
    vv.height = 800; listeners.resize?.();
    await waitFor(() => expect(sheet.style.bottom).toBe('0px'));
    Object.defineProperty(window, 'visualViewport', { value: undefined, configurable: true });
  });
});

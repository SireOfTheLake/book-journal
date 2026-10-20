// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readdirSync, readFileSync } from 'node:fs';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { DbContext } from '../src/db/DbContext';
import { addTag, getBookLog, quickAdd, updateRead } from '../src/repo/bookLog';
import { openPhoneDatabase } from '../src/phone/sqljsDb';
import { parseAge } from '../src/phone/screens/Character';
import AddBook from '../src/phone/screens/AddBook';
import BookLog from '../src/phone/screens/BookLog';
import Character from '../src/phone/screens/Character';
import Home from '../src/phone/screens/Home';
import { createCharacter } from '../src/repo/characters';
import { addCharacterToBook } from '../src/repo/characters';

let SQL: SqlJsStatic;
const files = readdirSync('src-tauri/migrations').filter((f) => f.endsWith('.sql')).sort().map((f) => readFileSync(`src-tauri/migrations/${f}`, 'utf8'));
beforeAll(async () => { SQL = await initSqlJs(); });
afterEach(cleanup);

async function freshDb(): Promise<Db> {
  const { db } = await openPhoneDatabase(SQL, files, { load: async () => ({ bytes: null, applied: 0 }), save: async () => undefined }, 60_000);
  return db;
}
const at = (db: Db, path: string) => render(
  <DbContext.Provider value={db}>
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/add" element={<AddBook />} />
        <Route path="/book/:bookId" element={<BookLog />} />
        <Route path="/book/:bookId/:readId" element={<BookLog />} />
        <Route path="/character/:characterId" element={<Character />} />
      </Routes>
    </MemoryRouter>
  </DbContext.Provider>,
);

describe('phone: home', () => {
  it('shows what you are reading and the Up next list, collapsible', async () => {
    const db = await freshDb();
    await quickAdd(db, { title: 'Now Book', authors: ['Ann'], status: 'reading' });
    await quickAdd(db, { title: 'Soon Book', authors: ['Bo'], status: 'up_next' });
    at(db, '/');
    await screen.findByText('Reading now');
    expect((await screen.findAllByText('Now Book')).length).toBeGreaterThan(0);
    const up = (await screen.findByText('Up next')).closest('details')!;
    expect(up.open).toBe(true);
    expect(within(up).getByText('Soon Book')).toBeTruthy();
  });
});

describe('phone: book log', () => {
  it('changes status, rating and tags and saves them', async () => {
    const db = await freshDb();
    const { bookId, readId } = await quickAdd(db, { title: 'Editable', authors: ['Ann'], status: 'reading' });
    await updateRead(db, readId!, { format: 'ebook' });
    await addTag(db, bookId, 'genre', 'Romance');
    at(db, `/book/${bookId}/${readId}`);
    await screen.findByRole('heading', { name: 'Editable' });
    fireEvent.click(screen.getByRole('button', { name: 'Read' }));
    await waitFor(async () => expect((await getBookLog(db, bookId))!.read!.status).toBe('finished'));
    fireEvent.click(screen.getByRole('button', { name: /\+ ¼/ }));
    await waitFor(async () => expect((await getBookLog(db, bookId))!.read!.rating).toBe(1));
    fireEvent.click(within(screen.getByRole('group', { name: 'Format' })).getByRole('button', { name: 'Audio' }));
    await waitFor(async () => expect((await getBookLog(db, bookId))!.read!.format).toBe('audio'));
    fireEvent.click(screen.getByRole('button', { name: '+ Add genre' }));
    fireEvent.change(await screen.findByLabelText('Search genres'), { target: { value: 'Slow' } });
    fireEvent.click(await screen.findByRole('button', { name: /Create new genre/ }));
    await waitFor(async () => expect((await getBookLog(db, bookId))!.genres.map((g) => g.name).sort()).toEqual(['Romance', 'Slow']));
  });
  it('shows a notes box that saves when you leave it', async () => {
    const db = await freshDb();
    const { bookId, readId } = await quickAdd(db, { title: 'Noted', authors: [], status: 'reading' });
    at(db, `/book/${bookId}/${readId}`);
    const box = await screen.findByLabelText('Notes');
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: 'Loved it' } });
    fireEvent.blur(box);
    await waitFor(async () => expect((await getBookLog(db, bookId))!.read!.notes).toBe('Loved it'));
  });
  it('hides the optional cards until the feature is on', async () => {
    const db = await freshDb();
    const { bookId, readId } = await quickAdd(db, { title: 'Plain', authors: [], status: 'reading' });
    at(db, `/book/${bookId}/${readId}`);
    await screen.findByRole('heading', { name: 'Plain' });
    expect(screen.queryByText('Mood')).toBeNull();
    expect(screen.queryByText('Content warnings')).toBeNull();
  });
});

describe('phone: add a book', () => {
  it('says whether the author and series are existing or new, and matches A.J. to AJ', async () => {
    const db = await freshDb();
    await quickAdd(db, { title: 'Old', authors: ['A.J. Sherwood'], status: 'tbr' });
    at(db, '/add');
    fireEvent.change(await screen.findByLabelText('Author'), { target: { value: 'AJ Sherwood' } });
    await waitFor(() => expect(screen.getByText(/Existing author: A\.J\. Sherwood/)).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Series'), { target: { value: 'Brand New Series' } });
    expect(screen.getByText(/New series/)).toBeTruthy();
  });
  it('adds the book to Up Next with the matched author and a new series', async () => {
    const db = await freshDb();
    await quickAdd(db, { title: 'Old', authors: ['A.J. Sherwood'], status: 'tbr' });
    at(db, '/add');
    fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'The Fox of Sherborne' } });
    fireEvent.change(screen.getByLabelText('Author'), { target: { value: 'AJ Sherwood' } });
    fireEvent.change(screen.getByLabelText('Series'), { target: { value: 'Salt Road' } });
    fireEvent.change(screen.getByLabelText('Series number'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Up Next' }));
    await waitFor(() => expect(screen.getByText(/Existing author/)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Add to my library' }));
    await waitFor(async () => expect((await db.select('SELECT id FROM book WHERE title = ?', ['The Fox of Sherborne'])).length).toBe(1));
    const [b] = await db.select<{ id: string; shelf: string; series_position: number }>('SELECT id, shelf, series_position FROM book WHERE title = ?', ['The Fox of Sherborne']);
    expect(b.shelf).toBe('up_next');
    expect(b.series_position).toBe(1);
    const log = (await getBookLog(db, b.id))!;
    expect(log.authors.map((a) => a.name)).toEqual(['A.J. Sherwood']); // no second author made
    expect(log.series!.title).toBe('Salt Road');
    expect((await db.select('SELECT id FROM author WHERE deleted_at IS NULL')).length).toBe(1);
  });
  it('will not add a book without a title', async () => {
    const db = await freshDb();
    at(db, '/add');
    fireEvent.click(await screen.findByRole('button', { name: 'Add to my library' }));
    expect((await screen.findByRole('alert')).textContent).toContain('needs a title');
  });
});

describe('phone: character', () => {
  it('edits gender, age and occupations', async () => {
    const db = await freshDb();
    const { bookId } = await quickAdd(db, { title: 'B', authors: [], status: 'tbr' });
    const cid = await createCharacter(db, 'Wren');
    await addCharacterToBook(db, cid, bookId, 'side');
    at(db, `/character/${cid}`);
    await screen.findByDisplayValue('Wren');
    fireEvent.click(screen.getByRole('button', { name: 'Female' }));
    fireEvent.click(screen.getByRole('button', { name: 'Main' }));
    const age = screen.getByLabelText('Age');
    fireEvent.focus(age); fireEvent.change(age, { target: { value: '29 to 35' } }); fireEvent.blur(age);
    await waitFor(async () => {
      const [c] = await db.select<{ gender: string; age_min: number; age_max: number }>('SELECT gender, age_min, age_max FROM character WHERE id = ?', [cid]);
      expect(c).toEqual({ gender: 'female', age_min: 29, age_max: 35 });
    });
    const [bc] = await db.select<{ role: string }>('SELECT role FROM book_character WHERE character_id = ?', [cid]);
    expect(bc.role).toBe('main');
  });
  it('reads ages the way people type them', () => {
    expect(parseAge('29')).toEqual({ min: 29, max: 29 });
    expect(parseAge('35 to 29')).toEqual({ min: 29, max: 35 });
    expect(parseAge('29-35')).toEqual({ min: 29, max: 35 });
    expect(parseAge('')).toEqual({ min: null, max: null });
    expect(parseAge('old')).toBeNull();
  });
});

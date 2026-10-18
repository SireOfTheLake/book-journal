// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DbContext } from '../src/db/DbContext';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { createBook } from '../src/repo/books';
import { addTag } from '../src/repo/bookLog';
import { createCharacter } from '../src/repo/characters';
import { getPlaceDetail, listPlaces } from '../src/repo/places';
import LocationsPage from '../src/pages/LocationsPage';
import LocationDetailPage from '../src/pages/locations/LocationDetailPage';

afterEach(cleanup);
let db: Db;
beforeEach(() => { db = migrateNodeDb(); });
const show = (path: string) => render(<DbContext.Provider value={db}><MemoryRouter initialEntries={[path]}><Routes>
  <Route path="locations" element={<LocationsPage />} /><Route path="locations/:placeId" element={<LocationDetailPage />} /></Routes></MemoryRouter></DbContext.Provider>);

describe('location detail', () => {
  it('counts characters, lists books and characters, and updates a flagged location', async () => {
    const b = await createBook(db, { title: 'Spooky Book', authors: ['Ann'] });
    await addTag(db, b, 'place', 'The old manor');
    const [p] = await listPlaces(db);
    const c = await createCharacter(db, 'Ghost Gary');
    await db.execute('UPDATE character SET current_place_id = ? WHERE id = ?', [p.id, c]);
    const c2 = await createCharacter(db, 'Past Pat');
    await db.execute("INSERT INTO character_previous_place (id, character_id, place_id) VALUES ('cp1', ?, ?)", [c2, p.id]);
    const d = (await getPlaceDetail(db, p.id))!;
    expect(d.place.characters).toBe(2);
    expect(d.characters.map((x) => [x.name, x.how])).toEqual([['Ghost Gary', 'Lives here now'], ['Past Pat', 'Lived here before']]);

    show('/locations');
    expect(await screen.findByText('1 book, 2 characters')).toBeTruthy();
    cleanup();

    show(`/locations/${p.id}`);
    expect(await screen.findByText('Spooky Book')).toBeTruthy();
    expect(screen.getByText('Ghost Gary')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'City' }));
    fireEvent.change(screen.getAllByLabelText('Country')[0], { target: { value: 'United Kingdom' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save location' }));
    await waitFor(async () => expect((await listPlaces(db))[0].needsUpdate).toBe(false));
    expect((await listPlaces(db))[0].name).toBe('The old manor, United Kingdom');
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { DbContext } from '../src/db/DbContext';
import { migrateNodeDb } from '../src/db/nodeDb';
import CharacterPageContainer from '../src/pages/characters/CharacterPageContainer';
import { getCharacter } from '../src/repo/characters';

afterEach(cleanup);

describe('a character\'s places work like a book\'s locations', () => {
  it('holds one current place (replaced when you pick another) and many previous places, each editable and with the warning', async () => {
    const db = migrateNodeDb();
    await db.execute("INSERT INTO character (id, name) VALUES ('c1', 'Wren')");
    await db.execute("INSERT INTO place (id, name, located) VALUES ('p1', 'Boston', 0), ('p2', 'Paris, France', 0)");
    await db.execute("INSERT INTO place (id, name, city, country, located) VALUES ('p3', 'Dublin, Ireland', 'Dublin', 'Ireland', 1)");
    render(<MemoryRouter initialEntries={['/characters/c1']}><DbContext.Provider value={db}><Routes><Route path="/characters/:characterId" element={<CharacterPageContainer />} /></Routes></DbContext.Provider></MemoryRouter>);
    await screen.findByText('Previous places');

    // current place: pick one, then change it
    fireEvent.click(screen.getByTitle('Add a current place'));
    fireEvent.mouseDown(await screen.findByText('Boston'));
    await waitFor(async () => expect((await getCharacter(db, 'c1'))?.place?.name).toBe('Boston'));
    expect((await screen.findAllByLabelText('Needs updating')).length).toBe(1); // plain-text Boston is flagged, like on a book
    fireEvent.click(await screen.findByTitle('Change the current place'));
    fireEvent.mouseDown(await screen.findByText('Dublin, Ireland'));
    await waitFor(async () => expect((await getCharacter(db, 'c1'))?.place?.name).toBe('Dublin, Ireland'));

    // previous places: several
    fireEvent.click(screen.getByTitle('Add a previous place'));
    fireEvent.mouseDown(await screen.findByText('Paris, France'));
    await waitFor(async () => expect((await getCharacter(db, 'c1'))?.previousPlaces.map((p) => p.name)).toEqual(['Paris, France']));
    fireEvent.click(screen.getByTitle('Add a previous place'));
    fireEvent.mouseDown(await screen.findByText('Boston'));
    await waitFor(async () => expect((await getCharacter(db, 'c1'))?.previousPlaces.map((p) => p.name)).toEqual(['Paris, France', 'Boston']));

    // removing one
    fireEvent.click(screen.getByLabelText('Remove Paris, France'));
    await waitFor(async () => expect((await getCharacter(db, 'c1'))?.previousPlaces.map((p) => p.name)).toEqual(['Boston']));
    expect(within(screen.getByText('Work and places').closest('section') ?? document.body).getAllByRole('button', { name: /^Edit / }).length).toBeGreaterThan(0);
  });
});

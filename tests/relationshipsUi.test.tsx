// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { DbContext } from '../src/db/DbContext';
import { migrateNodeDb } from '../src/db/nodeDb';
import CharacterPageContainer from '../src/pages/characters/CharacterPageContainer';
import { createCharacter, getCharacter } from '../src/repo/characters';

afterEach(cleanup);
const open = (db: ReturnType<typeof migrateNodeDb>, id: string) => render(
  <DbContext.Provider value={db}><MemoryRouter initialEntries={[`/characters/${id}`]}><Routes><Route path="characters/:characterId" element={<CharacterPageContainer />} /></Routes></MemoryRouter></DbContext.Provider>);
const group = (title: string) => screen.getByText(title, { selector: '.relgroup > .lbl2' }).parentElement as HTMLElement;

describe('relationships by type on the character page', () => {
  it('shows every type with an add button even when empty', async () => {
    const db = migrateNodeDb(); const id = await createCharacter(db, 'Ewan');
    open(db, id);
    await screen.findByText('Relationships');
    for (const t of ['Current Partner', 'Previous Partner', 'Family', 'Friends', 'Other']) expect(within(group(t)).getByRole('button', { name: `Add relationship under ${t}` })).toBeTruthy();
    expect(screen.queryByLabelText('Relationship type')).toBeNull();
  });
  it('adds an existing character under one header, and a new unlinked one under another, then the label can change', async () => {
    const db = migrateNodeDb(); const id = await createCharacter(db, 'Ewan'); await createCharacter(db, 'Shiloh');
    open(db, id);
    await screen.findByText('Relationships');
    fireEvent.click(within(group('Current Partner')).getByRole('button', { name: /Add relationship under/ }));
    fireEvent.change(screen.getByLabelText('Add to Current Partner'), { target: { value: 'Shil' } });
    fireEvent.mouseDown(await screen.findByText('Shiloh'));
    await waitFor(() => expect(within(group('Current Partner')).getByText('Shiloh')).toBeTruthy());
    fireEvent.click(within(group('Family')).getByRole('button', { name: /Add relationship under/ }));
    fireEvent.change(screen.getByLabelText('Add to Family'), { target: { value: 'Aileen' } });
    fireEvent.mouseDown(await screen.findByText('+ Add "Aileen" as a new character (no page yet)'));
    await waitFor(() => expect(within(group('Family')).getByText('Aileen')).toBeTruthy());
    const d = (await getCharacter(db, id))!;
    expect(d.relationships.map((r) => [r.other_name, r.rel_type, r.is_current])).toEqual([['Shiloh', 'partner', 1]]);
    expect(d.people.map((p) => [p.name, p.rel_type])).toEqual([['Aileen', 'family']]);
    // The label and status are changed on the row afterwards.
    fireEvent.click(within(group('Family')).getByRole('button', { name: 'Add label' }));
    const box = screen.getByLabelText('Label');
    fireEvent.change(box, { target: { value: 'mother' } }); fireEvent.blur(box);
    await waitFor(async () => expect((await getCharacter(db, id))!.people[0].label).toBe('mother'));
    expect(within(group('Family')).getByRole('button', { name: '+ status' })).toBeTruthy();
  });
});

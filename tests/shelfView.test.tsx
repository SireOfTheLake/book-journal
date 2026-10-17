// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DbContext } from '../src/db/DbContext';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { addToShelf } from '../src/repo/shelf';
import ShelfPage from '../src/pages/ShelfPage';

afterEach(cleanup);
let db: Db;
beforeEach(async () => {
  db = migrateNodeDb();
  for (const [t, shelf] of [['Alpha', 'up_next'], ['Bravo', 'up_next'], ['Charlie', 'tbr'], ['Delta', 'tbr']] as const) await addToShelf(db, { title: t, authors: ['Writer One'], shelf });
});
const show = () => render(<DbContext.Provider value={db}><MemoryRouter><ShelfPage /></MemoryRouter></DbContext.Provider>);
const order = () => screen.getAllByRole('listitem').map((li) => li.querySelector('a.l')?.textContent);

describe('the TBR & Up Next page', () => {
  it('shows both shelves in order and lets you reorder, move and add', async () => {
    show();
    await screen.findByText('Alpha');
    expect(order()).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);
    expect(screen.getByText('Up Next (2)')).toBeTruthy();
    expect(screen.getByText('TBR (2)')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Move Delta up'));
    await waitFor(() => expect(order()).toEqual(['Alpha', 'Bravo', 'Delta', 'Charlie']));
    fireEvent.click(screen.getByLabelText('Move Charlie to Up Next'));
    await waitFor(() => expect(order()).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']));
    expect(screen.getByText('Up Next (3)')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('New book title'), { target: { value: 'Echo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await screen.findByText('Echo');
    expect(screen.getByText('TBR (2)')).toBeTruthy();
  });
  it('asks before removing a book from the shelf', async () => {
    show();
    await screen.findByText('Alpha');
    fireEvent.click(screen.getByLabelText('Remove Alpha from the shelf'));
    expect(screen.getByText('Alpha')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Confirm removing Alpha from the shelf'));
    await waitFor(() => expect(screen.queryByText('Alpha')).toBeNull());
  });
  it('hides the arrows while searching or sorting, and filters by title', async () => {
    show();
    await screen.findByText('Alpha');
    fireEvent.change(screen.getByLabelText('Search the shelves'), { target: { value: 'delt' } });
    expect(order()).toEqual(['Delta']);
    expect(screen.queryByLabelText('Move Delta up')).toBeNull();
  });
});

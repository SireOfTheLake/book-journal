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

describe('Quick reads on the TBR & Up Next page', () => {
  it('keeps only books under 200 pages and puts standalones, series starters and next-in-series first', async () => {
    const d = migrateNodeDb();
    const add = async (title: string, pages: number | null, series?: string, pos?: number) => {
      await addToShelf(d, { title, authors: ['W'], shelf: 'tbr' });
      if (series) {
        let sid = (await d.select<{ id: string }>('SELECT id FROM series WHERE title = ?', [series]))[0]?.id;
        if (!sid) { sid = `s-${series}`; await d.execute('INSERT INTO series (id, title) VALUES (?, ?)', [sid, series]); }
        await d.execute('UPDATE book SET series_id = ?, series_position = ? WHERE title = ?', [sid, pos ?? null, title]);
      }
      await d.execute('UPDATE book SET page_count = ? WHERE title = ?', [pages, title]);
    };
    await add('Long', 300); await add('NoPages', null); await add('D2', 150, 'Dee', 2); await add('Solo', 150); await add('A1', 180, 'Ay', 1);
    await add('C2', 100, 'Cee', 2); await add('B2', 120, 'Bee', 2); await add('D1', 150, 'Dee', 1);
    // Bee 1 has been read, so B2 is the next book of a series that has been started.
    await d.execute("INSERT INTO series (id, title) VALUES ('s-x', 'unused')");
    await d.execute("INSERT INTO book (id, title, series_id, series_position) VALUES ('b1', 'B1', 's-Bee', 1)");
    await d.execute("INSERT INTO read (id, book_id, status, finish_date) VALUES ('r1', 'b1', 'finished', '2026-01-01')");
    render(<DbContext.Provider value={d}><MemoryRouter><ShelfPage /></MemoryRouter></DbContext.Provider>);
    await screen.findByText('Solo');
    expect(order()).toHaveLength(8);
    fireEvent.click(screen.getByRole('button', { name: 'Quick reads' }));
    await waitFor(() => expect(order()).toEqual(['Solo', 'A1', 'C2', 'D1', 'B2', 'D2']));
    expect(screen.getAllByText('Standalone').length).toBe(1);
    expect(screen.getAllByText('Next in a series you started').length).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Quick reads' }));
    await waitFor(() => expect(order()).toHaveLength(8));
  });
  it('uses the shorter filter labels', async () => {
    show();
    await screen.findByText('Alpha');
    expect(screen.getByRole('button', { name: 'No Copy' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Any' })).toBeTruthy();
    expect(screen.queryByText('Want, no copy')).toBeNull();
  });
});

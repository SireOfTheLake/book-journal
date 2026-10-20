// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { DbContext } from '../src/db/DbContext';
import { migrateNodeDb } from '../src/db/nodeDb';
import { quickAdd } from '../src/repo/bookLog';
import { addCustomItem, addLibraryItem, createOrder, getOrder } from '../src/repo/readingOrders';
import ReadingOrderPage from '../src/pages/readingOrders/ReadingOrderPage';
import ReadingOrdersPage from '../src/pages/readingOrders/ReadingOrdersPage';

let db: Db;
beforeEach(() => { db = migrateNodeDb(); });
afterEach(cleanup);
const ui = (path: string) => render(<DbContext.Provider value={db}><MemoryRouter initialEntries={[path]}><Routes>
  <Route path="/reading-orders" element={<ReadingOrdersPage />} /><Route path="/reading-orders/:orderId" element={<ReadingOrderPage />} /></Routes></MemoryRouter></DbContext.Provider>);

describe('reading order pages', () => {
  it('lists orders with authors, series and read counts', async () => {
    const b = (await quickAdd(db, { title: 'One', authors: ['Ann'], status: 'tbr' })).bookId;
    const o = await createOrder(db, 'My plan');
    await addLibraryItem(db, o, b);
    ui('/reading-orders');
    const row = (await screen.findByText('My plan')).closest('tr')!;
    expect(within(row).getByText('Ann')).toBeTruthy();
    expect(within(row).getByText('0 of 1')).toBeTruthy();
  });
  it('moves lines with the arrows and offers Add to library for outside books', async () => {
    const b = (await quickAdd(db, { title: 'One', authors: ['Ann'], status: 'tbr' })).bookId;
    const o = await createOrder(db, 'P');
    await addLibraryItem(db, o, b);
    await addCustomItem(db, o, { title: 'Outside' });
    ui(`/reading-orders/${o}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Move Outside up' }));
    await waitFor(async () => expect((await getOrder(db, o))!.items.map((i) => i.title)).toEqual(['Outside', 'One']));
    fireEvent.click(await screen.findByRole('button', { name: 'Add to library' }));
    expect(await screen.findByRole('dialog', { name: 'Add to library' })).toBeTruthy();
    expect(screen.getByText('Cover')).toBeTruthy();
    await quickAdd(db, { title: 'Outside', authors: ['Q'], status: 'tbr' });
    fireEvent.click(screen.getByRole('tab', { name: 'Link to a book I have' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Link' }));
    await waitFor(async () => expect((await getOrder(db, o))!.items.every((i) => i.book_id)).toBe(true));
  });
  it('edits an outside title in place', async () => {
    const o = await createOrder(db, 'P');
    await addCustomItem(db, o, { title: 'Draft' });
    ui(`/reading-orders/${o}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Draft' }));
    fireEvent.change(screen.getByLabelText('Edit title'), { target: { value: 'Final' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(async () => expect((await getOrder(db, o))!.items[0].title).toBe('Final'));
  });
});

describe('add to library dialog', () => {
  it('says whether the author and series already exist', async () => {
    await quickAdd(db, { title: 'Known', authors: ['Ann'], status: 'tbr' });
    const { createSeries } = await import('../src/repo/series');
    await createSeries(db, 'Saga');
    const o = await createOrder(db, 'P');
    await addCustomItem(db, o, { title: 'Out', author: 'Ann, Newbie', series: 'Saga' });
    ui(`/reading-orders/${o}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Add to library' }));
    const dlg = await screen.findByRole('dialog', { name: 'Add to library' });
    await waitFor(() => expect(within(dlg).getByLabelText('Author status').textContent).toBe('Ann (existing author); Newbie (new author)'));
    expect(within(dlg).getByLabelText('Series status').textContent).toBe('Existing series');
    fireEvent.change(within(dlg).getByRole('combobox', { name: 'Series' }), { target: { value: 'Brand New' } });
    expect(within(dlg).getByLabelText('Series status').textContent).toContain('New series');
    const box = await within(dlg).findByRole('listbox', { name: 'Series suggestions' });
    expect(box.textContent).toBe('Add Brand New as a new series');
    expect(within(dlg).getByRole('button', { name: 'Cover from a link' })).toBeTruthy();
  });
});

describe('name matching', () => {
  it('treats AJ Sherwood as A.J. Sherwood', async () => {
    await quickAdd(db, { title: 'Known', authors: ['A.J. Sherwood'], status: 'tbr' });
    const o = await createOrder(db, 'P');
    await addCustomItem(db, o, { title: 'Out', author: 'AJ Sherwood' });
    ui(`/reading-orders/${o}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Add to library' }));
    const dlg = await screen.findByRole('dialog', { name: 'Add to library' });
    await waitFor(() => expect(within(dlg).getByLabelText('Author status').textContent).toBe('AJ Sherwood (existing author: A.J. Sherwood)'));
  });
});

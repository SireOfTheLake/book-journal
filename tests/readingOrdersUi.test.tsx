// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { DbContext } from '../src/db/DbContext';
import { migrateNodeDb } from '../src/db/nodeDb';
import { quickAdd } from '../src/repo/bookLog';
import { addCustomItem, addLibraryItem, addOrderToUniverse, createOrder, getOrder, listOrders } from '../src/repo/readingOrders';
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
  it('shows the line in its new place while dragging, and colors lines by reading state', async () => {
    const mk = async (t: string, status: 'finished' | 'reading' | 'dnf' | 'tbr') => (await quickAdd(db, { title: t, authors: ['A'], status })).bookId;
    const o = await createOrder(db, 'Q');
    for (const [t, st] of [['A1', 'finished'], ['B2', 'reading'], ['C3', 'dnf'], ['D4', 'tbr']] as const) await addLibraryItem(db, o, await mk(t, st));
    expect((await getOrder(db, o))!.items.map((i) => i.state)).toEqual(['read', 'reading', 'dnf', null]);
    ui(`/reading-orders/${o}`);
    const rows = () => within(screen.getByRole('list', { name: 'Reading order' })).getAllByRole('listitem').filter((li) => li.classList.contains('orderrow'));
    await screen.findByText('A1');
    expect(rows().map((r) => [...r.classList].filter((c) => c.startsWith('st-')).join())).toEqual(['st-read', 'st-reading', 'st-dnf', '']);
    const first = rows()[0];
    fireEvent.dragStart(first, { dataTransfer: { setData() {}, effectAllowed: '' } });
    const last = rows()[3];
    last.getBoundingClientRect = () => ({ top: 100, height: 40, bottom: 140, left: 0, right: 0, width: 0, x: 0, y: 100, toJSON() { return {}; } });
    fireEvent.dragOver(last, { clientY: 130 }); // lower half of the last line: goes after it
    expect(rows().map((r) => r.textContent!.includes('A1'))).toEqual([false, false, false, true]);
    expect(rows()[3].classList.contains('dragging')).toBe(true);
    fireEvent.drop(rows()[3]);
    await waitFor(async () => expect((await getOrder(db, o))!.items.map((i) => i.title)).toEqual(['B2', 'C3', 'D4', 'A1']));
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

describe('universes in reading orders', () => {
  it('adds whole series when every book is in the order, single books otherwise, and shows tags', async () => {
    const { createSeries, setBookSeries } = await import('../src/repo/series');
    const { createUniverseNamed } = await import('../src/repo/universes');
    const a = (await quickAdd(db, { title: 'Alpha', authors: ['A'], status: 'tbr' })).bookId;
    const b = (await quickAdd(db, { title: 'Beta', authors: ['A'], status: 'tbr' })).bookId;
    const c = (await quickAdd(db, { title: 'Gamma', authors: ['A'], status: 'tbr' })).bookId;
    const d = (await quickAdd(db, { title: 'Delta', authors: ['A'], status: 'tbr' })).bookId;
    const full = await createSeries(db, 'Full'); const part = await createSeries(db, 'Part');
    await setBookSeries(db, a, full, 1); await setBookSeries(db, b, full, 2);
    await setBookSeries(db, c, part, 1); await setBookSeries(db, d, part, 2);
    const o = await createOrder(db, 'U');
    for (const x of [a, b, c]) await addLibraryItem(db, o, x);
    await addCustomItem(db, o, { title: 'Outside' });
    const uni = await createUniverseNamed(db, 'Cosmere');
    expect(await addOrderToUniverse(db, o, uni)).toEqual({ books: 3, series: 1, skipped: 1 });
    const det = (await getOrder(db, o))!;
    expect(det.items.map((i) => i.universe?.name ?? null)).toEqual(['Cosmere', 'Cosmere', 'Cosmere', null]);
    expect(det.universes.map((u) => u.name)).toEqual(['Cosmere']);
    const [{ su }] = await db.select<{ su: string | null }>('SELECT universe_id AS su FROM series WHERE id = ?', [part]);
    expect(su).toBeNull(); // Part is missing Delta, so only Gamma was placed
    expect((await listOrders(db))[0].universes.map((u) => u.name)).toEqual(['Cosmere']);
    ui(`/reading-orders/${o}`);
    expect((await screen.findAllByTitle('Universe: Cosmere')).length).toBe(4) // three books and the heading;
    ui('/reading-orders');
    expect((await screen.findAllByRole('link', { name: 'Cosmere' })).length).toBeGreaterThan(0);
  });
  it('the Add to universe button creates a universe from typed text', async () => {
    const a = (await quickAdd(db, { title: 'Solo', authors: ['A'], status: 'tbr' })).bookId;
    const o = await createOrder(db, 'U');
    await addLibraryItem(db, o, a);
    ui(`/reading-orders/${o}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Add to universe' }));
    const box = screen.getByLabelText('Search universes');
    fireEvent.change(box, { target: { value: 'Newverse' } });
    fireEvent.mouseDown(await screen.findByText('+ Add "Newverse" as a new universe'));
    await waitFor(async () => expect((await getOrder(db, o))!.items[0].universe?.name).toBe('Newverse'));
  });
  it('shows a placeholder cover for a library book without one, and a blank for outside books', async () => {
    const a = (await quickAdd(db, { title: 'Plain', authors: ['A'], status: 'tbr' })).bookId;
    const o = await createOrder(db, 'U');
    await addLibraryItem(db, o, a);
    await addCustomItem(db, o, { title: 'Later' });
    const { container } = ui(`/reading-orders/${o}`);
    await screen.findByText('Later');
    expect(container.querySelectorAll('.ordercover.ph').length).toBe(1);
    expect(container.querySelectorAll('.ordercover.blank').length).toBe(1);
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

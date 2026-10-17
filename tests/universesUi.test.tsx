// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DbContext } from '../src/db/DbContext';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { applyNotionPlan } from '../src/import/apply';
import { planNotionBooks } from '../src/import/notion';
import { createBook } from '../src/repo/books';
import { createSeries } from '../src/repo/series';
import { createUniverseNamed } from '../src/repo/universes';
import BookLogPage from '../src/pages/BookLogPage';
import { UniversePageContainer, UniversesPage } from '../src/pages/universes/UniversePages';

afterEach(cleanup);
let db: Db;
beforeEach(async () => {
  db = migrateNodeDb();
  await applyNotionPlan(db, planNotionBooks(readFileSync(resolve(process.cwd(), 'tests/fixtures/book-tracker.csv'), 'utf8')), { tagDestinations: { sadenverse: 'universe' } });
});
const mount = (path: string) => render(
  <DbContext.Provider value={db}><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/book/:bookId" element={<BookLogPage />} /><Route path="/universes" element={<UniversesPage />} /><Route path="/universes/:universeId" element={<UniversePageContainer />} />
  </Routes></MemoryRouter></DbContext.Provider>);

describe('the universe line on the book page', () => {
  it('is a single quiet "+ universe" button on a standalone, and sets one by search or by creating it', async () => {
    const id = await createBook(db, { title: 'Lone Wolf', authors: ['Some Author'], shelf: 'tbr' });
    await createUniverseNamed(db, 'Wolfverse');
    mount(`/book/${id}`);
    const add = await screen.findByRole('button', { name: '+ universe' });
    fireEvent.click(add);
    const box = screen.getByLabelText('Search universes');
    fireEvent.change(box, { target: { value: 'Wolf' } });
    fireEvent.mouseDown(await screen.findByText('Wolfverse'));
    const link = await screen.findByRole('link', { name: 'Wolfverse' });
    expect(link.getAttribute('href')).toMatch(/^\/universes\//);
    const row = (await db.select<{ n: string }>('SELECT u.name AS n FROM book b JOIN universe u ON u.id = b.universe_id WHERE b.id = ?', [id]))[0];
    expect(row.n).toBe('Wolfverse');
    fireEvent.click(screen.getByRole('button', { name: /Take this book out of Wolfverse/ }));
    await screen.findByRole('button', { name: '+ universe' });
    expect((await db.select<{ u: string | null }>('SELECT universe_id AS u FROM book WHERE id = ?', [id]))[0].u).toBeNull();
  });
  it('can create a brand new universe from the search box', async () => {
    const id = await createBook(db, { title: 'Another One', authors: ['A'], shelf: 'tbr' });
    mount(`/book/${id}`);
    fireEvent.click(await screen.findByRole('button', { name: '+ universe' }));
    fireEvent.change(screen.getByLabelText('Search universes'), { target: { value: 'Brand New' } });
    fireEvent.mouseDown(await screen.findByText('+ Add "Brand New" as a new universe'));
    await screen.findByRole('link', { name: 'Brand New' });
  });
  it("shows the series' universe as plain text with no way to change it from the book", async () => {
    const bid = (await db.select<{ id: string }>("SELECT b.id FROM book b JOIN series s ON s.id = b.series_id WHERE s.universe_id IS NOT NULL LIMIT 1"))[0].id;
    mount(`/book/${bid}`);
    const link = await screen.findByRole('link', { name: 'Sadenverse' });
    expect(link.closest('.uniline')!.textContent).toContain('through the series');
    expect(screen.queryByRole('button', { name: '+ universe' })).toBeNull();
  });
  it('stays out of the way: one small line inside the Series card', async () => {
    const id = await createBook(db, { title: 'Quiet', authors: ['A'], shelf: 'tbr' });
    mount(`/book/${id}`);
    await screen.findByRole('button', { name: '+ universe' });
    expect(document.querySelectorAll('.uniline')).toHaveLength(1);
    expect(document.querySelector('.uniline')!.closest('.card, .bcard')!.textContent).toContain('Series');
  });
});

describe('the Universes pages', () => {
  it('lists universes with counts and creates a new one', async () => {
    mount('/universes');
    const link = await screen.findByRole('link', { name: 'Sadenverse' });
    expect(link).toBeTruthy();
    fireEvent.change(screen.getByLabelText('New universe'), { target: { value: 'Fresh World' } });
    fireEvent.keyDown(screen.getByLabelText('New universe'), { key: 'Enter' });
    await waitFor(async () => expect((await db.select('SELECT 1 FROM universe WHERE name = ?', ['Fresh World'])).length).toBe(1));
  });
  it('shows a universe with its series and its single books, and moves things in and out', async () => {
    const u = (await db.select<{ id: string }>("SELECT id FROM universe WHERE name = 'Sadenverse'"))[0].id;
    const sid = await createSeries(db, 'Shared Anthology');
    const bid = await createBook(db, { title: 'Guest Book', authors: ['Guest'], seriesId: sid, seriesPosition: 2, shelf: 'tbr' });
    await db.execute('UPDATE book SET universe_id = ? WHERE id = ?', [u, bid]);
    mount(`/universes/${u}`);
    await screen.findByText('Books on their own');
    expect(screen.getByRole('link', { name: 'Puckboys' })).toBeTruthy();
    const guest = screen.getByRole('link', { name: 'Guest Book' });
    expect(guest.closest('.bookcard')!.textContent).toContain('Shared Anthology #2');
    fireEvent.click(within(guest.closest('.bookcard') as HTMLElement).getByRole('button', { name: /out of this universe/ }));
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Guest Book' })).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: '+ Add a single book' }));
    fireEvent.change(screen.getByLabelText('+ Add a single book'), { target: { value: 'Guest' } });
    fireEvent.mouseDown(await screen.findByText('Guest Book'));
    await screen.findByRole('link', { name: 'Guest Book' });
  });
  it('deletes only the grouping after a confirmation', async () => {
    const u = (await db.select<{ id: string }>("SELECT id FROM universe WHERE name = 'Sadenverse'"))[0].id;
    mount(`/universes/${u}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete this universe' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete universe' }));
    await waitFor(async () => expect((await db.select('SELECT 1 FROM universe WHERE id = ? AND deleted_at IS NULL', [u])).length).toBe(0));
    expect((await db.select<{ n: number }>('SELECT count(*) AS n FROM series WHERE title = ?', ['Puckboys']))[0].n).toBe(1);
  });
});

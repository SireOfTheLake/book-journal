// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DbContext } from '../src/db/DbContext';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { createBook } from '../src/repo/books';
import { createSeries, setFormatRelease } from '../src/repo/series';
import { addToShelf } from '../src/repo/shelf';
import ReleasesPage from '../src/pages/ReleasesPage';

afterEach(cleanup);
let db: Db;
beforeEach(() => { db = migrateNodeDb(); });
const ymd = (offsetDays: number) => { const d = new Date(); d.setDate(d.getDate() + offsetDays); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const show = () => render(<DbContext.Provider value={db}><MemoryRouter><ReleasesPage /></MemoryRouter></DbContext.Provider>);

async function seed() {
  const s = await createSeries(db, 'The Saga');
  const a = await createBook(db, { title: 'Saga Three', authors: ['Ann'] }); await db.execute('UPDATE book SET series_id = ?, series_position = 3 WHERE id = ?', [s, a]);
  await setFormatRelease(db, a, 'ebook', ymd(10)); await setFormatRelease(db, a, 'audio', 'tba');
  const t = await addToShelf(db, { title: 'Shelf Book', authors: ['Bo'], shelf: 'tbr' }); await setFormatRelease(db, t, 'physical', ymd(70));
  const u = await createBook(db, { title: 'Mystery Date', authors: ['Cy'] }); await setFormatRelease(db, u, 'ebook', 'tba');
  const r = await createBook(db, { title: 'Just Out', authors: ['Di'] }); await setFormatRelease(db, r, 'ebook', ymd(-3));
}

describe('the Upcoming releases screen', () => {
  it('groups books by month, shows each format separately, and a Just released section', async () => {
    await seed();
    show();
    await screen.findByText('Saga Three');
    const saga = screen.getByText('Saga Three').closest('li')!;
    expect(within(saga).getByText('in 10 days')).toBeTruthy();
    expect(within(saga).getByText('TBA')).toBeTruthy();
    expect(within(saga).getByText('The Saga')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Date to be announced' })).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Date to be announced' })).getByText('Mystery Date')).toBeTruthy();
    const just = screen.getByRole('region', { name: 'Just released' });
    expect(within(just).getByText('Just Out')).toBeTruthy();
    expect(within(just).getByText('Out')).toBeTruthy();
    expect(within(screen.getByText('Shelf Book').closest('li')!).getByText('TBR')).toBeTruthy();
  });
  it('filters to books in a series, or on the TBR / Up Next', async () => {
    await seed();
    show();
    await screen.findByText('Saga Three');
    fireEvent.click(screen.getByRole('button', { name: 'In a series' }));
    expect(screen.queryByText('Shelf Book')).toBeNull(); expect(screen.getByText('Saga Three')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'On TBR / Up Next' }));
    expect(screen.queryByText('Saga Three')).toBeNull(); expect(screen.getByText('Shelf Book')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Everything' }));
    expect(screen.getByText('Mystery Date')).toBeTruthy();
  });
  it('edits dates in place: mark TBA, set a date, clear one', async () => {
    await seed();
    show();
    await screen.findByText('Saga Three');
    fireEvent.click(screen.getByRole('button', { name: 'Edit dates' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark Physical TBA for Saga Three' }));
    await waitFor(async () => expect((await db.select<{ status: string }>("SELECT status FROM format_release f JOIN book b ON b.id = f.book_id WHERE b.title = 'Saga Three' AND f.format = 'physical' AND f.deleted_at IS NULL"))[0]?.status).toBe('tba'));
    fireEvent.click(screen.getByRole('button', { name: 'Edit ebook release date for saga three' }));
    const box = await screen.findByLabelText('Ebook release date for Saga Three');
    fireEvent.change(box, { target: { value: ymd(40) } }); fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(async () => expect((await db.select<{ release_date: string }>("SELECT release_date FROM format_release f JOIN book b ON b.id = f.book_id WHERE b.title = 'Saga Three' AND f.format = 'ebook' AND f.deleted_at IS NULL"))[0].release_date).toBe(ymd(40)));
  });
  it('adds a book you are waiting for, and refuses one with no date', async () => {
    show();
    fireEvent.click(await screen.findByRole('button', { name: '+ Add a book' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Brand New' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add book' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/release date/);
    fireEvent.change(screen.getByLabelText('Authors'), { target: { value: 'Ann, Bo' } });
    fireEvent.change(screen.getByLabelText('Ebook release'), { target: { value: ymd(30) } });
    fireEvent.change(screen.getByLabelText('Audio release'), { target: { value: 'tba' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add book' }));
    await screen.findByText('Brand New');
    const row = screen.getByText('Brand New').closest('li')!;
    expect(within(row).getByText('Ann, Bo')).toBeTruthy();
    expect(within(row).getByText('TBR')).toBeTruthy();
  });
  it('says so when there is nothing to wait for', async () => {
    show();
    expect(await screen.findByText(/No upcoming releases yet/)).toBeTruthy();
  });
});

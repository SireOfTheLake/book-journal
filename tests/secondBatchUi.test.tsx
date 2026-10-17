// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DbContext } from '../src/db/DbContext';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { applyNotionPlan } from '../src/import/apply';
import { planNotionBooks } from '../src/import/notion';
import { createBook } from '../src/repo/books';
import { getBookLog, getNeighbors, listItems, listTagOptions, setStatus } from '../src/repo/bookLog';
import { listCharacterOptions } from '../src/repo/characters';
import { getSeriesPage, listSeriesOptions } from '../src/repo/series';
import BookLogView, { type Actions } from '../src/pages/bookLog/BookLogView';
import { LinkImageForm } from '../src/pages/bookLog/parts';
import { cleanImageUrl, urlToDataUrl } from '../src/ui/imageFile';
import QuickLog from '../src/ui/QuickLog';
import QuickSeries from '../src/ui/QuickSeries';

afterEach(cleanup);
const once = (fn: unknown, ...args: unknown[]) => { expect(fn).toHaveBeenCalledTimes(1); expect(fn).toHaveBeenCalledWith(...args); };
const fixture = (f: string) => readFileSync(resolve(process.cwd(), 'tests/fixtures', f), 'utf8');

let db: Db;
beforeEach(async () => {
  db = migrateNodeDb();
  await applyNotionPlan(db, planNotionBooks(fixture('book-tracker.csv')), { tagDestinations: {} });
});

describe('the Book Log: authors, narrators, and covers', () => {
  async function show(title: string, cover = false) {
    const id = (await db.select<{ id: string }>('SELECT id FROM book WHERE title = ?', [title]))[0].id;
    const log = (await getBookLog(db, id))!;
    if (cover) log.cover = 'data:image/png;base64,AAA';
    const lists = { sources: await listItems(db, 'source'), timePeriods: await listItems(db, 'time_period'), accents: await listItems(db, 'accent'), places: await listItems(db, 'place'),
      genres: await listTagOptions(db, 'genre'), themes: await listTagOptions(db, 'theme'), tropes: await listTagOptions(db, 'trope'), series: await listSeriesOptions(db), characters: await listCharacterOptions(db),
      authors: [{ id: 'a-existing', name: 'Existing Writer' }], narrators: [{ id: 'n-existing', name: 'Existing Voice' }] };
    const calls: Record<string, ReturnType<typeof vi.fn>> = {};
    const act = new Proxy({}, { get: (_t, k) => (calls[String(k)] ??= vi.fn(async () => undefined)) }) as Actions;
    render(<MemoryRouter><BookLogView log={log} lists={lists} act={act} neighbors={await getNeighbors(db, log.read?.id ?? null)} /></MemoryRouter>);
    return { calls, log };
  }

  it('adds an existing author, or creates a new one, and removes one', async () => {
    const { calls, log } = await show('Egotistical Puckboy');
    fireEvent.click(screen.getByText('Add author'));
    const box = screen.getByLabelText('Search authors');
    fireEvent.change(box, { target: { value: 'Existing' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    once(calls.addAuthor, 'a-existing');
    fireEvent.click(screen.getByText('Add author'));
    fireEvent.change(screen.getByLabelText('Search authors'), { target: { value: 'Someone Brand New' } });
    expect(screen.getByText('+ Add "Someone Brand New" as a new author')).toBeTruthy();
    fireEvent.keyDown(screen.getByLabelText('Search authors'), { key: 'Enter' });
    once(calls.createAuthor, 'Someone Brand New');
    fireEvent.click(screen.getByLabelText(`Remove ${log.authors[0].name}`));
    once(calls.removeAuthor, log.authors[0].id);
  });
  it('adds a narrator from a search, creates a new one, and removes one from the read', async () => {
    const { calls, log } = await show('Egotistical Puckboy');
    fireEvent.click(screen.getByText('+ Add narrator'));
    const box = screen.getByLabelText('Search narrators');
    fireEvent.change(box, { target: { value: 'Existing' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    once(calls.addNarrator, 'n-existing');
    fireEvent.click(screen.getByText('+ Add narrator'));
    fireEvent.change(screen.getByLabelText('Search narrators'), { target: { value: 'New Voice' } });
    expect(screen.getByText('+ Add "New Voice" as a new narrator')).toBeTruthy();
    fireEvent.keyDown(screen.getByLabelText('Search narrators'), { key: 'Enter' });
    once(calls.createNarrator, 'New Voice');
    fireEvent.click(screen.getByLabelText(`Remove ${log.narrators[0].name} from this read`));
    once(calls.removeNarrator, log.narrators[0].id);
  });
  it('offers to add a cover, and to replace or remove one that is there', async () => {
    await show('Egotistical Puckboy');
    expect(screen.getByText('Add cover')).toBeTruthy();
    expect(screen.getByText('Cover from a link')).toBeTruthy();
    expect(screen.queryByText('Replace cover')).toBeNull();
    cleanup();
    const { calls } = await show('Egotistical Puckboy', true);
    expect(screen.getByText('Replace cover')).toBeTruthy();
    expect(screen.getByAltText('Cover of Egotistical Puckboy')).toBeTruthy();
    fireEvent.click(screen.getByText('Remove', { selector: '.pictools button' }));
    expect(calls.removeCover).toHaveBeenCalledTimes(1);
  });
});

describe('adding a picture from a link', () => {
  it('shows the problem when the link does not work, and keeps the box open', async () => {
    const onUrl = vi.fn(async () => { throw new Error('That link is a web page, not a picture.'); });
    render(<LinkImageForm onUrl={onUrl} />);
    fireEvent.click(screen.getByText('Add from a link'));
    fireEvent.change(screen.getByLabelText('Picture address'), { target: { value: 'https://example.com/page' } });
    fireEvent.click(screen.getByText('Add'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/web page, not a picture/));
    expect(screen.getByLabelText('Picture address')).toBeTruthy();
    expect(onUrl).toHaveBeenCalledWith('https://example.com/page');
  });
  it('closes after the picture is added', async () => {
    const onUrl = vi.fn(async () => undefined);
    render(<LinkImageForm onUrl={onUrl} />);
    fireEvent.click(screen.getByText('Add from a link'));
    fireEvent.change(screen.getByLabelText('Picture address'), { target: { value: 'https://example.com/a.jpg' } });
    fireEvent.keyDown(screen.getByLabelText('Picture address'), { key: 'Enter' });
    await waitFor(() => expect(screen.queryByLabelText('Picture address')).toBeNull());
    expect(screen.getByText('Add from a link')).toBeTruthy();
  });
  it('checks the address before downloading anything', async () => {
    expect(cleanImageUrl('example.com/cover.jpg')).toBe('https://example.com/cover.jpg');
    expect(cleanImageUrl('  https://example.com/a b.png ')).toBe('https://example.com/a%20b.png');
    expect(() => cleanImageUrl('')).toThrow(/Paste the address/);
    expect(() => cleanImageUrl('ftp://example.com/a.png')).toThrow(/http or https/);
    expect(() => cleanImageUrl('file:///etc/passwd')).toThrow(/http or https/);
    await expect(urlToDataUrl('javascript:alert(1)')).rejects.toThrow();
  });
});

describe('Quick add: New series', () => {
  const mount = () => render(
    <DbContext.Provider value={db}><MemoryRouter initialEntries={['/']}><Routes>
      <Route path="/" element={<QuickSeries onClose={vi.fn()} />} /><Route path="/series/:id" element={<div>SERIES PAGE OPENED</div>} />
    </Routes></MemoryRouter></DbContext.Provider>);

  it('creates a series with an author and a number of books, then opens it', async () => {
    mount();
    fireEvent.change(screen.getByLabelText('Series name'), { target: { value: 'The Accidental Love' } });
    fireEvent.change(screen.getByLabelText('Author (separate with commas)'), { target: { value: 'Jane Writer, Co Author' } });
    fireEvent.change(screen.getByLabelText('Number of books'), { target: { value: '5' } });
    fireEvent.click(screen.getByText('Add series'));
    await waitFor(() => expect(screen.getByText('SERIES PAGE OPENED')).toBeTruthy());
    const id = (await db.select<{ id: string }>("SELECT id FROM series WHERE title = 'The Accidental Love'"))[0].id;
    const page = (await getSeriesPage(db, id))!;
    expect(page.authors.map((a) => a.name)).toEqual(['Jane Writer', 'Co Author']);
    expect(page.series.total_books).toBe(5);
  });
  it('needs only a name', async () => {
    mount();
    fireEvent.change(screen.getByLabelText('Series name'), { target: { value: 'Name Only' } });
    fireEvent.keyDown(screen.getByLabelText('Series name'), { key: 'Enter' });
    await waitFor(() => expect(screen.getByText('SERIES PAGE OPENED')).toBeTruthy());
  });
  it('asks for a name, and rejects a number of books that is not a whole number', async () => {
    mount();
    fireEvent.click(screen.getByText('Add series'));
    expect(screen.getByRole('alert').textContent).toMatch(/Type the series name/);
    fireEvent.change(screen.getByLabelText('Series name'), { target: { value: 'X' } });
    fireEvent.change(screen.getByLabelText('Number of books'), { target: { value: '2.5' } });
    fireEvent.click(screen.getByText('Add series'));
    expect(screen.getByRole('alert').textContent).toMatch(/whole number/);
  });
  it('points to a series you already have instead of making a second one', async () => {
    mount();
    fireEvent.change(screen.getByLabelText('Series name'), { target: { value: 'puckboys' } });
    fireEvent.click(screen.getByText('Add series'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/already have a series/));
    expect(screen.getByText('Open it')).toBeTruthy();
    expect(await db.select("SELECT id FROM series WHERE lower(title) = 'puckboys'")).toHaveLength(1);
  });
});

describe('Quick add: Daily log', () => {
  it('says so when no book is in progress', async () => {
    render(<DbContext.Provider value={db}><MemoryRouter><QuickLog onClose={vi.fn()} onSaved={vi.fn()} /></MemoryRouter></DbContext.Provider>);
    await waitFor(() => expect(screen.getByText(/No books are in progress/)).toBeTruthy());
    expect(screen.queryByText('Save entry')).toBeNull();
  });
  it('lets you choose among the books in progress and saves the entry on that one', async () => {
    const a = await createBook(db, { title: 'First Reading', authors: ['A Writer'] });
    const b = await createBook(db, { title: 'Second Reading', authors: ['B Writer'] });
    await setStatus(db, a, null, 'reading'); await setStatus(db, b, null, 'reading');
    const onSaved = vi.fn(); const onClose = vi.fn();
    render(<DbContext.Provider value={db}><MemoryRouter><QuickLog onClose={onClose} onSaved={onSaved} /></MemoryRouter></DbContext.Provider>);
    await waitFor(() => expect(screen.getByLabelText('Book')).toBeTruthy());
    expect(screen.getByText('First Reading (A Writer)')).toBeTruthy();
    expect(screen.getByText('Second Reading (B Writer)')).toBeTruthy();
    fireEvent.click(screen.getByText('Save entry'));
    expect(screen.getByRole('alert').textContent).toMatch(/Choose which book/);
    fireEvent.change(screen.getByLabelText('Book'), { target: { value: (await db.select<{ id: string }>("SELECT r.id AS id FROM read r JOIN book b ON b.id = r.book_id WHERE b.title = 'Second Reading'"))[0].id } });
    fireEvent.change(screen.getByLabelText('Percent reached'), { target: { value: '35' } });
    fireEvent.change(screen.getByLabelText('Entry note'), { target: { value: 'Slow start' } });
    fireEvent.click(screen.getByText('Save entry'));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalled();
    expect((await getBookLog(db, b))!.entries.map((e) => [e.position_percent, e.text])).toEqual([[35, 'Slow start']]);
    expect((await getBookLog(db, a))!.entries).toEqual([]);
  });
  it('picks the book for you when only one is in progress, and checks the time you type', async () => {
    const a = await createBook(db, { title: 'Only One', authors: ['Solo'] });
    await setStatus(db, a, null, 'reading');
    render(<DbContext.Provider value={db}><MemoryRouter><QuickLog onClose={vi.fn()} onSaved={vi.fn()} /></MemoryRouter></DbContext.Provider>);
    await waitFor(() => expect((screen.getByLabelText('Book') as HTMLSelectElement).value).not.toBe(''));
    fireEvent.change(screen.getByLabelText('Time reached'), { target: { value: 'soon' } });
    fireEvent.click(screen.getByText('Save entry'));
    expect(screen.getByRole('alert').textContent).toMatch(/1:23 or 1h 23m/);
    expect((await getBookLog(db, a))!.entries).toEqual([]);
  });
});

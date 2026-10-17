// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DbContext } from '../src/db/DbContext';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { applyNotionPlan } from '../src/import/apply';
import { planNotionBooks } from '../src/import/notion';
import { saveDayEntry, setStatus, updateBook, updateRead } from '../src/repo/bookLog';
import { getHome } from '../src/repo/home';
import { setFormatRelease } from '../src/repo/series';
import HomePage from '../src/pages/HomePage';
import HomeView, { type HomeActions } from '../src/pages/HomeView';

afterEach(cleanup);
let db: Db;
const TODAY = '2026-10-13';
beforeEach(async () => {
  db = migrateNodeDb();
  await applyNotionPlan(db, planNotionBooks(readFileSync(resolve(process.cwd(), 'tests/fixtures/book-tracker.csv'), 'utf8')), { tagDestinations: {} });
});
const bookId = async (t: string) => (await db.select<{ id: string }>('SELECT id FROM book WHERE title = ?', [t]))[0].id;

async function startReading(title: string, opts: { pages?: number; page?: number; paused?: boolean } = {}) {
  const id = await bookId(title);
  if (opts.pages) await updateBook(db, id, { page_count: opts.pages });
  const rid = (await setStatus(db, id, null, 'reading'))!;
  await updateRead(db, rid, { start_date: '2026-10-10', format: 'physical' });
  if (opts.page) await saveDayEntry(db, rid, { date: '2026-10-12', page: opts.page });
  if (opts.paused) await setStatus(db, id, rid, 'on_hold');
  return { id, rid };
}
const mockAct = (): HomeActions & Record<string, ReturnType<typeof vi.fn>> => ({ start: vi.fn(), resume: vi.fn(), finish: vi.fn(), log: vi.fn() }) as never;

describe('the Home screen', () => {
  it('shows what you are reading with progress, the day you are on, and your last log', async () => {
    await startReading('Hooks In', { pages: 300, page: 150 });
    const act = mockAct();
    render(<MemoryRouter><HomeView data={await getHome(db, TODAY)} act={act} /></MemoryRouter>);
    expect(screen.getByText('Currently reading (1)')).toBeTruthy();
    expect(screen.getByText('50%')).toBeTruthy();
    expect((screen.getByLabelText('Hooks In progress') as HTMLProgressElement).value).toBe(0.5);
    expect(screen.getByText('Last logged Oct 12: page 150')).toBeTruthy();
    expect(screen.getByText(/Started Oct 10, day 4/)).toBeTruthy();
    fireEvent.click(screen.getByText('Log progress')); expect(act.log).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Finished')); expect(act.finish).toHaveBeenCalledTimes(1);
  });
  it('says when nothing has been logged, and when nothing is in progress', async () => {
    render(<MemoryRouter><HomeView data={await getHome(db, TODAY)} act={mockAct()} /></MemoryRouter>);
    expect(screen.getByText(/Nothing in progress/)).toBeTruthy();
    cleanup();
    await startReading('Hooks In');
    render(<MemoryRouter><HomeView data={await getHome(db, TODAY)} act={mockAct()} /></MemoryRouter>);
    expect(screen.getByText('No progress logged yet.')).toBeTruthy();
  });
  it('lists paused books with a Resume button instead of Finished', async () => {
    await startReading('Hooks In', { paused: true });
    const act = mockAct();
    render(<MemoryRouter><HomeView data={await getHome(db, TODAY)} act={act} /></MemoryRouter>);
    expect(screen.getByText('Paused')).toBeTruthy();
    expect(screen.queryByText('Finished')).toBeNull();
    fireEvent.click(screen.getByText('Resume'));
    expect(act.resume).toHaveBeenCalledTimes(1);
  });
  it('shows Up Next with Start buttons, recent finishes, and the year so far', async () => {
    const act = mockAct();
    render(<MemoryRouter><HomeView data={await getHome(db, TODAY)} act={act} /></MemoryRouter>);
    expect(screen.getByText('Up next (3)')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Start 68 Whiskey'));
    expect(act.start).toHaveBeenCalledWith(await bookId('68 Whiskey'));
    expect(screen.getByText('Recently finished')).toBeTruthy();
    expect(screen.getByText('2026 so far')).toBeTruthy();
    expect(screen.getByText('books finished')).toBeTruthy();
    expect(screen.getByText('This month')).toBeTruthy();
    expect(screen.getByText('15 books have no cover').getAttribute('href')).toBe('/import?tab=covers');
    expect(screen.getByText(/Caught up on/)).toBeTruthy();
    expect(within(screen.getByText(/Caught up on/).closest('li')!).getAllByRole('link')[0].getAttribute('href')).toMatch(/^\/series\//);
  });
  it('shows announced releases, and says so when there are none', async () => {
    render(<MemoryRouter><HomeView data={await getHome(db, TODAY)} act={mockAct()} /></MemoryRouter>);
    expect(screen.getByText(/No announced books/)).toBeTruthy();
    cleanup();
    await setFormatRelease(db, await bookId('Hooks In'), 'audio', '2026-12-01');
    render(<MemoryRouter><HomeView data={await getHome(db, TODAY)} act={mockAct()} /></MemoryRouter>);
    expect(screen.getByText('Audio · 2026-12-01')).toBeTruthy();
  });
});

describe('the Home page', () => {
  const mount = () => render(<DbContext.Provider value={db}><MemoryRouter initialEntries={['/']}><Routes><Route path="/" element={<HomePage />} /></Routes></MemoryRouter></DbContext.Provider>);

  it('starts a book from Up Next and shows it under Currently reading', async () => {
    mount();
    await waitFor(() => expect(screen.getByText('Up next (3)')).toBeTruthy());
    fireEvent.click(screen.getByLabelText('Start Hooks In'));
    await waitFor(() => expect(screen.getByText('Currently reading (1)')).toBeTruthy());
    expect(screen.getByText('Up next (2)')).toBeTruthy();
  });
  it('logs progress for the chosen book, and the bar moves', async () => {
    await startReading('Hooks In', { pages: 200 });
    mount();
    await waitFor(() => expect(screen.getByText('Log progress')).toBeTruthy());
    fireEvent.click(screen.getByText('Log progress'));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect((within(dialog).getByLabelText('Book') as HTMLSelectElement).value).not.toBe('')); // chosen for you
    fireEvent.change(within(dialog).getByLabelText('Page reached'), { target: { value: '100' } });
    fireEvent.click(within(dialog).getByText('Save entry'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect((screen.getByLabelText('Hooks In progress') as HTMLProgressElement).value).toBe(0.5));
  });
  it('marks a book finished, and it moves to Recently finished', async () => {
    await startReading('Hooks In');
    mount();
    await waitFor(() => expect(screen.getByText('Finished')).toBeTruthy());
    fireEvent.click(screen.getByText('Finished'));
    await waitFor(() => expect(screen.getByText(/Nothing in progress/)).toBeTruthy());
    expect(within(screen.getByText('Recently finished').closest('section')!).getByText('Hooks In')).toBeTruthy();
  });
  it('resumes a paused book', async () => {
    await startReading('Hooks In', { paused: true });
    mount();
    await waitFor(() => expect(screen.getByText('Resume')).toBeTruthy());
    fireEvent.click(screen.getByText('Resume'));
    await waitFor(() => expect(screen.getByText('Currently reading (1)')).toBeTruthy());
    expect(screen.queryByText('Paused')).toBeNull();
  });
});

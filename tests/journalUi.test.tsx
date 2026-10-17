// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DbContext } from '../src/db/DbContext';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { newId } from '../src/domain/ids';
import { addTag } from '../src/repo/bookLog';
import { createBook } from '../src/repo/books';
import { getSavedYear, listGoals, saveGoal } from '../src/repo/goals';
import OverviewPage from '../src/pages/journal/OverviewPage';
import Shell from '../src/ui/Shell';

afterEach(cleanup);
let db: Db;
const YEAR = new Date().getFullYear();
beforeEach(() => { db = migrateNodeDb(); });

async function finished(title: string, date: string, o: { format?: string; genre?: string; start?: string } = {}) {
  const bid = await createBook(db, { title });
  if (o.genre) await addTag(db, bid, 'genre', o.genre);
  await db.execute('INSERT INTO read (id, book_id, status, start_date, finish_date, format) VALUES (?, ?, ?, ?, ?, ?)', [newId(), bid, 'finished', o.start ?? null, date, o.format ?? 'physical']);
  return bid;
}
const mount = () => render(
  <DbContext.Provider value={db}><MemoryRouter initialEntries={['/journal/overview']}><Routes>
    <Route element={<Shell />}><Route path="journal/overview" element={<OverviewPage />} /></Route>
  </Routes></MemoryRouter></DbContext.Provider>);
const section = (name: RegExp) => screen.getByRole('heading', { name }).closest('section') as HTMLElement;

describe('goals on the overview page', () => {
  it('adds a yearly goal limited to a genre and shows progress and a pace hint', async () => {
    await finished('R1', `${YEAR}-01-05`, { genre: 'Romance' }); await finished('R2', `${YEAR}-01-06`, { genre: 'Romance' }); await finished('M1', `${YEAR}-01-07`, { genre: 'Mystery' });
    mount();
    const yearly = await screen.findByRole('heading', { name: `${YEAR} goals` });
    const sec = yearly.closest('section') as HTMLElement;
    fireEvent.click(within(sec).getByRole('button', { name: '+ Add a yearly goal' }));
    fireEvent.change(screen.getByLabelText('Goal target'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: '+ Limit by genre, trope, or format' }));
    fireEvent.change(screen.getByLabelText('Filter value'), { target: { value: (await db.select<{ id: string }>("SELECT id FROM genre WHERE name = 'Romance'"))[0].id } });
    fireEvent.click(screen.getByRole('button', { name: 'Add goal' }));
    const card = await screen.findByLabelText('Read 10 books');
    expect(card.textContent).toContain('Counting books Romance');
    expect(card.textContent).toContain('2 of 10 books · 20%');
    expect(card.querySelector('[role=progressbar]')!.getAttribute('aria-valuenow')).toBe('20');
    expect(card.querySelector('.pace')!.textContent).toMatch(/Ahead|Behind|On pace/);
  });
  it('leaves a genre out and counts the rest', async () => {
    await finished('R1', `${YEAR}-01-05`, { genre: 'Romance' }); await finished('M1', `${YEAR}-01-07`, { genre: 'Mystery' }); await finished('M2', `${YEAR}-01-08`, { genre: 'Mystery' });
    const gid = (await db.select<{ id: string }>("SELECT id FROM genre WHERE name = 'Romance'"))[0].id;
    await saveGoal(db, YEAR, { label: 'Not romance', metric: 'books', target: 5, filters: [{ kind: 'genre', mode: 'exclude', ref: gid }] });
    mount();
    const card = await screen.findByLabelText('Not romance');
    expect(card.textContent).toContain('Counting books not Romance');
    expect(card.textContent).toContain('2 of 5 books');
  });
  it('keeps goals for part of the year in their own section with dates', async () => {
    await finished('Summer read', `${YEAR}-07-04`);
    mount();
    const sec = (await screen.findByRole('heading', { name: 'Goals for part of the year' })).closest('section') as HTMLElement;
    fireEvent.click(within(sec).getByRole('button', { name: '+ Add a goal for part of the year' }));
    fireEvent.change(screen.getByLabelText('Goal name'), { target: { value: 'Summer' } });
    fireEvent.change(screen.getByLabelText('Goal target'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Goal start date'), { target: { value: `${YEAR}-06-01` } });
    fireEvent.change(screen.getByLabelText('Goal end date'), { target: { value: `${YEAR}-08-31` } });
    fireEvent.click(screen.getByRole('button', { name: 'Add goal' }));
    const card = await within(sec).findByLabelText('Summer');
    expect(card.textContent).toContain('1 of 3 books');
    expect(card.textContent).toMatch(/Jun 1, \d{4} to Aug 31, \d{4}/);
    expect(within(screen.getByRole('heading', { name: `${YEAR} goals` }).closest('section') as HTMLElement).queryByLabelText('Summer')).toBeNull();
  });
  it('shows a message and keeps the form open when a goal is not valid', async () => {
    mount();
    const sec = (await screen.findByRole('heading', { name: `${YEAR} goals` })).closest('section') as HTMLElement;
    fireEvent.click(within(sec).getByRole('button', { name: '+ Add a yearly goal' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add goal' }));
    expect((await screen.findByRole('alert')).textContent).toContain('above zero');
    expect(screen.getByLabelText('Goal target')).toBeTruthy();
  });
  it('edits, reorders, and deletes a goal', async () => {
    await saveGoal(db, YEAR, { label: 'First', metric: 'books', target: 10 });
    await saveGoal(db, YEAR, { label: 'Second', metric: 'pages', target: 5000 });
    mount();
    await screen.findByLabelText('First');
    fireEvent.click(screen.getByRole('button', { name: 'Move Second up' }));
    await waitFor(async () => expect((await listGoals(db, YEAR)).map((g) => g.label)).toEqual(['Second', 'First']));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit First' }));
    fireEvent.change(screen.getByLabelText('Goal target'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save goal' }));
    await waitFor(async () => expect((await listGoals(db, YEAR)).find((g) => g.label === 'First')!.target).toBe(12));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Second' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete goal' }));
    await waitFor(async () => expect((await listGoals(db, YEAR)).map((g) => g.label)).toEqual(['First']));
  });
  it('offers to copy last year\'s yearly goals when this year has none', async () => {
    await saveGoal(db, YEAR - 1, { label: 'Old goal', metric: 'books', target: 40 });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: `Copy ${YEAR - 1}'s yearly goals` }));
    await screen.findByLabelText('Old goal');
    expect(screen.queryByRole('button', { name: /Copy/ })).toBeNull();
  });
});

describe('series lists and streaks', () => {
  it('lists series started, finished, and continued, with counts', async () => {
    const sid = newId();
    await db.execute("INSERT INTO series (id, title, total_books, publication_status) VALUES (?, 'Quick Series', 1, 'complete')", [sid]);
    const b = await createBook(db, { title: 'Only One', seriesId: sid, seriesPosition: 1 });
    await db.execute('INSERT INTO read (id, book_id, status, start_date, finish_date) VALUES (?, ?, ?, ?, ?)', [newId(), b, 'finished', `${YEAR}-02-01`, `${YEAR}-02-04`]);
    mount();
    const started = await screen.findAllByText('Quick Series');
    expect(started).toHaveLength(2); // in the started and finished lists
    const stat = (label: string) => screen.getAllByText(label, { selector: '.stat .lbl2' })[0].parentElement!.querySelector('.big')!.textContent;
    expect(stat('Series started')).toBe('1');
    expect(stat('Series finished')).toBe('1');
    expect(stat('Series continued')).toBe('0');
  });
  it('switches the streaks between this year and all time', async () => {
    await finished('Long ago', `${YEAR - 1}-03-10`, { start: `${YEAR - 1}-03-01` });
    await finished('This year', `${YEAR}-03-03`, { start: `${YEAR}-03-01` });
    mount();
    const card = (await screen.findByText('Streaks')).closest('.card, .bcard') as HTMLElement;
    const longest = () => within(card).getByText('Longest streak: Reading anything').parentElement!.textContent!;
    expect(longest()).toContain('3 days');
    fireEvent.click(within(card).getByRole('button', { name: 'All time' }));
    expect(longest()).toContain('10 days');
    expect(card.textContent).toContain('Longest streak: Not reading');
    expect(card.textContent).toContain('Longest streak: Audiobooks');
  });
  it('saves year notes', async () => {
    mount();
    fireEvent.click(await screen.findByText('Add notes for this year'));
    fireEvent.change(screen.getByLabelText('Year notes'), { target: { value: 'Great year' } });
    fireEvent.blur(screen.getByLabelText('Year notes'));
    await waitFor(async () => expect((await db.select<{ notes: string }>('SELECT notes FROM journal_year WHERE year = ?', [YEAR]))[0]?.notes).toBe('Great year'));
  });
});

describe('the journal year dropdown', () => {
  it('lists the years that have books, remembers the one you pick, and adds a new year', async () => {
    await finished('Old', '2022-05-05'); await finished('Mid', '2024-05-05');
    mount();
    const sel = await screen.findByLabelText('Journal year') as HTMLSelectElement;
    await waitFor(() => expect([...sel.options].map((o) => o.value)).toEqual([String(YEAR), '2024', '2022', 'add']));
    fireEvent.change(sel, { target: { value: '2024' } });
    await waitFor(async () => expect(await getSavedYear(db)).toBe(2024));
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toContain('JOURNAL 2024');
    fireEvent.change(sel, { target: { value: 'add' } });
    const box = screen.getByLabelText('New journal year');
    fireEvent.change(box, { target: { value: '2030' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(async () => expect(await getSavedYear(db)).toBe(2030));
    expect((await screen.findByLabelText('Journal year') as HTMLSelectElement).value).toBe('2030');
  });
  it('comes back on the year you left it', async () => {
    await finished('Old', '2022-05-05');
    const { saveYear } = await import('../src/repo/goals');
    await saveYear(db, 2022);
    mount();
    await waitFor(async () => expect(((await screen.findByLabelText('Journal year')) as HTMLSelectElement).value).toBe('2022'));
  });
});
void section;

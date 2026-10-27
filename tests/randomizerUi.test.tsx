// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DbContext } from '../src/db/DbContext';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { createBook } from '../src/repo/books';
import { createGrid, getChallenge } from '../src/repo/challenges';
import { getReason } from '../src/repo/reason';
import { addPrompt, listDrafts, loadRandomizer } from '../src/repo/randomizer';
import { addToShelf, listShelf } from '../src/repo/shelf';
import { createRead } from '../src/repo/bookLog';
import { setReason } from '../src/repo/reason';
import BookLogPage from '../src/pages/BookLogPage';
import RandomizerPage from '../src/pages/RandomizerPage';
import RandomizerView from '../src/pages/RandomizerView';

afterEach(() => { cleanup(); try { localStorage.clear(); } catch { /* none */ } });
let db: Db;
beforeEach(() => { db = migrateNodeDb(); });
const Y = new Date().getFullYear();
const app = () => render(
  <DbContext.Provider value={db}><MemoryRouter initialEntries={['/journal/randomizer']}><Routes>
    <Route path="journal/randomizer" element={<RandomizerPage />} />
    <Route path="book/:bookId/:readId" element={<BookLogPage />} />
  </Routes></MemoryRouter></DbContext.Provider>);
async function board(prompts: string[]) {
  const id = await createGrid(db, { year: Y, name: 'Reading Board', prompts });
  await db.execute('UPDATE challenge SET published = 1 WHERE id = ?', [id]);
  return id;
}

describe('the Prompt Randomizer page', () => {
  it('starts with Trick, Treat and the challenges ticked, on incomplete prompts only', async () => {
    await board(['Red cover']);
    await addPrompt(db, 'trick', 'Pick a long one');
    app();
    await screen.findByText('PROMPT RANDOMIZER');
    for (const name of ['Trick', 'Treat', 'Reading Board']) expect((screen.getByRole('checkbox', { name: new RegExp(`^${name}`) }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole('button', { name: 'Incomplete only' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Spin' })).toBeTruthy();
  });
  it('lets you add and remove Trick and Treat prompts, including ones you used before', async () => {
    const r = await createRead(db, await createBook(db, { title: 'Old', authors: ['A'] }), 'finished');
    await setReason(db, r, { kind: 'treat', prompt: 'Cozy mystery' });
    app();
    fireEvent.change(await screen.findByLabelText('New Trick prompt'), { target: { value: 'Read a 700 page book' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[0]);
    await screen.findByText('Read a 700 page book');
    fireEvent.click(screen.getByRole('button', { name: 'Add Cozy mystery to Treat' }));
    await waitFor(async () => expect((await loadRandomizer(db, Y)).treat.map((p) => p.text)).toEqual(['Cozy mystery']));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Read a 700 page book from Trick' }));
    await waitFor(() => expect(screen.queryByText('Read a 700 page book')).toBeNull());
  });
  it('is not spinnable until a ticked category has a prompt, and unticking takes a category off the wheel', async () => {
    await addPrompt(db, 'treat', 'Spicy');
    app();
    await screen.findByText('PROMPT RANDOMIZER');
    expect(screen.getByRole('img', { name: 'Wheel with 1 categories' })).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: /^Treat/ }));
    expect((screen.getByRole('button', { name: 'Spin' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Tick at least one category that has prompts.')).toBeTruthy();
  });
  it('switches challenges between incomplete and all prompts', async () => {
    const id = await board(['Red cover']);
    const c = await getChallenge(db, id);
    const { fillSlot } = await import('../src/repo/challenges');
    await fillSlot(db, c!.loose[0].id, await createRead(db, await createBook(db, { title: 'Done', authors: ['A'] }), 'finished'));
    app();
    const row = async () => (await screen.findByRole('checkbox', { name: /^Reading Board/ })).closest('label')!.textContent;
    expect(await row()).toContain('all done');
    fireEvent.click(screen.getByRole('button', { name: 'All prompts' }));
    expect(await row()).toContain('1 prompt');
  });
  it('spins to a prompt, then makes a blank page with the reason filled in, and a TBR book can be chosen for it', async () => {
    await addPrompt(db, 'trick', 'Read a 700 page book');
    await addToShelf(db, { title: 'Shelf Book', authors: ['Wren'], shelf: 'tbr' });
    app();
    await screen.findByText('PROMPT RANDOMIZER');
    fireEvent.click(screen.getByLabelText(/Random book/)); // the TBR book would put the random book wedge on the wheel
    fireEvent.click(screen.getByRole('button', { name: 'Spin' }));
    const start = await screen.findByRole('button', { name: 'Add a new book' }, { timeout: 8000 });
    expect(document.querySelector('.rzprompt')!.textContent).toBe('Read a 700 page book');
    fireEvent.click(start);
    await screen.findByText('NEXT BOOK');
    const card = (await screen.findByText("Why I'm reading this")).closest('.bcard') as HTMLElement;
    expect(card.textContent).toContain('Trick');
    expect(card.textContent).toContain('Read a 700 page book');
    const [draft] = await listDrafts(db);
    fireEvent.click(await screen.findByRole('button', { name: 'Read Shelf Book' }));
    await waitFor(async () => expect((await listShelf(db)).length).toBe(0));
    await screen.findByText('BOOK LOG');
    expect(await getReason(db, draft.read_id)).toMatchObject({ kind: 'trick', prompt: 'Read a 700 page book' });
  }, 20000);
  it('lets you type a new book on the blank page instead', async () => {
    const { startDraft } = await import('../src/repo/randomizer');
    const { bookId, readId } = await startDraft(db, { kind: 'treat', categoryLabel: 'Treat', prompt: 'Spicy' });
    render(<DbContext.Provider value={db}><MemoryRouter initialEntries={[`/book/${bookId}/${readId}`]}><Routes><Route path="book/:bookId/:readId" element={<BookLogPage />} /></Routes></MemoryRouter></DbContext.Provider>);
    await screen.findByText('NEXT BOOK');
    fireEvent.click(screen.getByRole('button', { name: 'A new book' }));
    const go = screen.getByRole('button', { name: 'Start this book' }) as HTMLButtonElement;
    expect(go.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Fresh Start' } });
    fireEvent.change(screen.getByLabelText('Authors'), { target: { value: 'Ann, Bo' } });
    fireEvent.click(go);
    await screen.findByText('BOOK LOG');
    expect(screen.getAllByText('Fresh Start').length).toBeGreaterThan(0);
    expect(await listDrafts(db)).toEqual([]);
  });
  it('lists pages waiting for a book, and discards one', async () => {
    const { startDraft } = await import('../src/repo/randomizer');
    await startDraft(db, { kind: 'trick', categoryLabel: 'Trick', prompt: 'Left waiting' });
    app();
    const card = (await screen.findByText('Waiting for a book')).closest('.bcard') as HTMLElement;
    expect(card.textContent).toContain('Left waiting');
    fireEvent.click(within(card).getByRole('button', { name: /Discard/ }));
    await waitFor(() => expect(screen.queryByText('Waiting for a book')).toBeNull());
    expect(await listDrafts(db)).toEqual([]);
  });
});

describe('the wheel view with a fixed random source', () => {
  it('lands on the chosen prompt without waiting for the animation when spinMs is 0', async () => {
    const data = { trick: [{ id: '1', text: 'Only one' }], treat: [], challenges: [], usedBefore: { trick: [], treat: [] }, random: { book: [], series_book: [], series: [] }, covers: {} };
    render(<MemoryRouter><RandomizerView data={data} drafts={[]} year={Y} spinMs={0} rng={() => 0} act={{ addPrompt: async () => undefined, removePrompt: () => undefined, start: async () => undefined, discard: () => undefined, upNext: async () => undefined }} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Spin' }));
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(document.querySelector('.rzprompt')!.textContent).toBe('Only one');
  });
});

describe('the random book wedge', () => {
  const book = { id: 'b1', title: 'Next Up', authors: 'Ann', series_id: 's', series: 'Saga', position: 2, shelf: 'tbr' as const, read: false, unreleased: false };
  const series = { id: 's', title: 'Saga', books: [book, { ...book, id: 'b2', title: 'After That', position: 3 }] };
  const data = { trick: [], treat: [], challenges: [], usedBefore: { trick: [], treat: [] }, random: { book: [book], series_book: [book], series: [series] }, covers: { b1: 'data:image/png;base64,AAAA' } };
  const run = async (rng: () => number, upNext = async (_ids: string[]) => undefined) => {
    render(<MemoryRouter><RandomizerView data={data} drafts={[]} year={Y} spinMs={0} rng={rng} act={{ addPrompt: async () => undefined, removePrompt: () => undefined, start: async () => undefined, discard: () => undefined, upNext }} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Spin' }));
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
  };
  it('lands on a book and adds it to Up Next', async () => {
    const added: string[][] = [];
    await run(() => 0, async (ids) => { added.push(ids); });
    expect(screen.getByText('Next Up')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add to Up Next' }));
    await waitFor(() => expect(added).toEqual([['b1']]));
    expect(await screen.findByText('Added to Up Next')).toBeTruthy();
  });
  it('a random series lists its unread books and can add them all', async () => {
    const added: string[][] = [];
    await run(() => 0.99, async (ids) => { added.push(ids); });
    expect(screen.getByText('Saga')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add all to Up Next' }));
    await waitFor(() => expect(added).toEqual([['b1', 'b2']]));
  });
  it('can be turned off and stays off', async () => {
    cleanup();
    render(<MemoryRouter><RandomizerView data={data} drafts={[]} year={Y} spinMs={0} act={{ addPrompt: async () => undefined, removePrompt: () => undefined, start: async () => undefined, discard: () => undefined, upNext: async () => undefined }} /></MemoryRouter>);
    fireEvent.click(screen.getByLabelText(/Random book/));
    expect((screen.getByRole('button', { name: 'Spin' }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    render(<MemoryRouter><RandomizerView data={data} drafts={[]} year={Y} spinMs={0} act={{ addPrompt: async () => undefined, removePrompt: () => undefined, start: async () => undefined, discard: () => undefined, upNext: async () => undefined }} /></MemoryRouter>);
    expect((screen.getByLabelText(/Random book/) as HTMLInputElement).checked).toBe(false);
    localStorage.clear();
  });
});

describe('select all and covers', () => {
  const book = { id: 'b1', title: 'Next Up', authors: 'Ann', series_id: null, series: null, position: null, shelf: 'tbr' as const, read: false, unreleased: false };
  const base = { trick: [{ id: '1', text: 'A trick' }], treat: [], challenges: [], usedBefore: { trick: [], treat: [] }, random: { book: [book], series_book: [], series: [] }, covers: { b1: 'data:image/png;base64,AAAA' } };
  const act2 = { addPrompt: async () => undefined, removePrompt: () => undefined, start: async () => undefined, discard: () => undefined, upNext: async () => undefined };
  it('is ticked when everything is on, a dash when some are, empty when none are', () => {
    render(<MemoryRouter><RandomizerView data={base} drafts={[]} year={Y} spinMs={0} act={act2} /></MemoryRouter>);
    const all = screen.getByLabelText('Select all') as HTMLInputElement;
    expect(all.checked).toBe(true); expect(all.indeterminate).toBe(false);
    fireEvent.click(screen.getByLabelText(/^Trick/));
    expect(all.checked).toBe(false); expect(all.indeterminate).toBe(true);
    fireEvent.click(all);                                  // a dash turns everything on
    expect(all.checked).toBe(true);
    fireEvent.click(all);                                  // ticked turns everything off
    expect(all.checked).toBe(false); expect(all.indeterminate).toBe(false);
    expect((screen.getByLabelText(/^Trick/) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText(/Random book/) as HTMLInputElement).checked).toBe(false);
  });
  it('shows the cover of the random book, and the kind of random book it is', async () => {
    render(<MemoryRouter><RandomizerView data={{ ...base, trick: [] }} drafts={[]} year={Y} spinMs={0} rng={() => 0} act={act2} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Spin' }));
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect((screen.getByAltText('Cover of Next Up') as HTMLImageElement).src).toContain('data:image/png');
    expect(document.querySelector('.rzkind')!.textContent).toBe('Random Book');
  });
});

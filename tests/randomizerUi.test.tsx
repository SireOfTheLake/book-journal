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

afterEach(cleanup);
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
    const data = { trick: [{ id: '1', text: 'Only one' }], treat: [], challenges: [], usedBefore: { trick: [], treat: [] } };
    render(<MemoryRouter><RandomizerView data={data} drafts={[]} year={Y} spinMs={0} rng={() => 0} act={{ addPrompt: async () => undefined, removePrompt: () => undefined, start: async () => undefined, discard: () => undefined }} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Spin' }));
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(document.querySelector('.rzprompt')!.textContent).toBe('Only one');
  });
});

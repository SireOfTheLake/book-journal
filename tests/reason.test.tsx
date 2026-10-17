// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DbContext } from '../src/db/DbContext';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { createBook } from '../src/repo/books';
import { createRead } from '../src/repo/bookLog';
import * as ch from '../src/repo/challenges';
import { getReason, setReason, setReasonPrompt } from '../src/repo/reason';
import BookLogPage from '../src/pages/BookLogPage';

afterEach(cleanup);
let db: Db; let bookId = ''; let readId = '';
beforeEach(async () => {
  db = migrateNodeDb();
  bookId = await createBook(db, { title: 'Why Book', authors: ['Au'] });
  readId = await createRead(db, bookId, 'reading');
});
const show = () => render(<DbContext.Provider value={db}><MemoryRouter initialEntries={[`/book/${bookId}/${readId}`]}><Routes><Route path="book/:bookId/:readId" element={<BookLogPage />} /></Routes></MemoryRouter></DbContext.Provider>);
const card = async () => (await screen.findByText("Why I'm reading this")).closest('.bcard') as HTMLElement;

describe('reason repo', () => {
  it('starts empty, sets Trick/Treat with a prompt, and Free Read with where it came from', async () => {
    expect(await getReason(db, readId)).toEqual({ kind: null, sub: null, prompt: null });
    await setReason(db, readId, { kind: 'trick', prompt: ' Read a 700 page book ' });
    expect(await getReason(db, readId)).toMatchObject({ kind: 'trick', sub: null, prompt: 'Read a 700 page book' });
    await setReasonPrompt(db, readId, 'Something shorter');
    expect((await getReason(db, readId)).prompt).toBe('Something shorter');
    await setReason(db, readId, { kind: 'treat', prompt: 'Spicy' });
    expect(await getReason(db, readId)).toMatchObject({ kind: 'treat', prompt: 'Spicy' });
    await setReason(db, readId, { kind: 'free', sub: 'tbr', prompt: 'ignored' });
    expect(await getReason(db, readId)).toEqual({ kind: 'free', sub: 'tbr', prompt: null });
    await setReason(db, readId, { kind: 'free', sub: 'next' });
    expect((await getReason(db, readId)).sub).toBe('next');
    await setReason(db, readId, { kind: 'free', sub: null });
    expect(await getReason(db, readId)).toEqual({ kind: 'free', sub: null, prompt: null });
    await setReason(db, readId, { kind: null });
    expect(await getReason(db, readId)).toEqual({ kind: null, sub: null, prompt: null });
  });
  it('reads the categories the PDF import stored', async () => {
    await db.execute("UPDATE read SET category_id = (SELECT id FROM category WHERE name = 'Next in Series') WHERE id = ?", [readId]);
    expect(await getReason(db, readId)).toEqual({ kind: 'free', sub: 'next', prompt: null });
  });
});

describe('the Why I am reading this card', () => {
  const pick = (c: HTMLElement, label: string, value: string) => {
    fireEvent.click(within(c).getByRole('button', { name: label }));
    fireEvent.change(within(c).getByRole('combobox'), { target: { value } });
  };
  it('has a Category and a Prompt field, and asks for the category first', async () => {
    show();
    const c = await card();
    expect(within(c).getByText('Category')).toBeTruthy();
    expect(within(c).getByText('Prompt')).toBeTruthy();
    expect(within(c).getByText('Choose a category first.')).toBeTruthy();
    fireEvent.click(within(c).getByRole('button', { name: 'Add category' }));
    expect([...within(c).getByRole('combobox').querySelectorAll('option')].map((o) => o.textContent)).toEqual(['Not set', 'Challenge', 'Trick', 'Treat', 'Free Read']);
  });
  it('Trick: the prompt is a text box', async () => {
    show();
    const c = await card();
    pick(c, 'Add category', 'trick');
    await waitFor(() => expect(within(c).getByRole('button', { name: 'Add prompt' })).toBeTruthy());
    fireEvent.click(within(c).getByRole('button', { name: 'Add prompt' }));
    const box = within(c).getByLabelText('Prompt');
    fireEvent.change(box, { target: { value: 'A big book' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(async () => expect(await getReason(db, readId)).toMatchObject({ kind: 'trick', prompt: 'A big book' }));
    await within(c).findByText('A big book');
  });
  it('Free Read: the prompt is TBR or Next in Series', async () => {
    show();
    const c = await card();
    pick(c, 'Add category', 'free');
    await waitFor(() => expect(within(c).getByRole('button', { name: 'Add prompt' })).toBeTruthy());
    fireEvent.click(within(c).getByRole('button', { name: 'Add prompt' }));
    expect([...within(c).getByRole('combobox').querySelectorAll('option')].map((o) => o.textContent)).toEqual(['Not set', 'TBR', 'Next in Series']);
    fireEvent.change(within(c).getByRole('combobox'), { target: { value: 'next' } });
    await waitFor(async () => expect(await getReason(db, readId)).toMatchObject({ kind: 'free', sub: 'next' }));
    await within(c).findByText('Next in Series');
  });
  it('Challenge: the prompt lists challenge prompts nobody has filled yet, and fills the one chosen', async () => {
    const y = new Date().getFullYear();
    const id = await ch.createGrid(db, { year: y, name: 'Cozy', groups: [{ name: 'Main', prompts: ['A baker', 'A spy'] }] });
    const other = await createRead(db, await createBook(db, { title: 'Other', authors: ['X'] }), 'reading');
    const slots = (await ch.getChallenge(db, id))!.groups[0].slots;
    await ch.fillSlot(db, slots[0].id, other);
    show();
    const c = await card();
    fireEvent.click(within(c).getByRole('button', { name: 'Add category' }));
    fireEvent.change(within(c).getByRole('combobox'), { target: { value: 'challenge' } });
    await waitFor(() => expect(within(c).getByRole('button', { name: 'Add prompt' })).toBeTruthy());
    fireEvent.click(within(c).getByRole('button', { name: 'Add prompt' }));
    expect([...within(c).getByRole('combobox').querySelectorAll('option')].map((o) => o.textContent)).toEqual(['Not set', 'Cozy: Main · A spy']);
    fireEvent.change(within(c).getByRole('combobox'), { target: { value: slots[1].id } });
    await waitFor(async () => expect((await ch.listReadChallenges(db, readId)).map((i) => i.label)).toEqual(['A spy']));
    await within(c).findByText('Cozy: Main · A spy');
  });
  it('a chosen prompt is planned until read, and stays in the card when taken off the challenge', async () => {
    const y = new Date().getFullYear();
    const id = await ch.createGrid(db, { year: y, name: 'Cozy', groups: [{ name: 'Main', prompts: ['A baker', 'A spy'] }] });
    const slots = (await ch.getChallenge(db, id))!.groups[0].slots;
    show();
    const c = await card();
    fireEvent.click(within(c).getByRole('button', { name: 'Add category' }));
    fireEvent.change(within(c).getByRole('combobox'), { target: { value: 'challenge' } });
    await waitFor(() => expect(within(c).getByRole('button', { name: 'Add prompt' })).toBeTruthy());
    fireEvent.click(within(c).getByRole('button', { name: 'Add prompt' }));
    fireEvent.change(within(c).getByRole('combobox'), { target: { value: slots[0].id } });
    await within(c).findByText(/counts once you have read the book/);
    expect((await ch.getChallenge(db, id))!.done).toBe(0);
    expect(screen.getByText('planned')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Take this book off Cozy' }));
    await within(c).findByText(/is kept here, but is not on the challenge/);
    expect((await getReason(db, readId)).prompt).toBe('Cozy: Main · A baker');
    expect(await ch.listReadChallenges(db, readId)).toEqual([]);
  });
  it('keeps the Challenges card on the page as well', async () => {
    show();
    await card();
    expect(screen.getByText('Challenges')).toBeTruthy();
    expect(screen.getByText('+ Add to a challenge')).toBeTruthy();
  });
});

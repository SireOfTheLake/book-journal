// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DbContext } from '../src/db/DbContext';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { createBook } from '../src/repo/books';
import { createRead, updateRead } from '../src/repo/bookLog';
import * as ch from '../src/repo/challenges';
import BookLogPage from '../src/pages/BookLogPage';

afterEach(cleanup);
let db: Db;
let bookId = ''; let readId = ''; let cozy = ''; let spicy = '';
beforeEach(async () => {
  db = migrateNodeDb();
  bookId = await createBook(db, { title: 'Hooks In', authors: ['Au'] });
  readId = await createRead(db, bookId, 'finished');
  await updateRead(db, readId, { finish_date: '2026-03-05' });
  cozy = await ch.createGrid(db, { year: 2026, name: 'Cozy', groups: [{ name: 'Main Character', prompts: ['A baker', 'A spy'] }], prompts: ['Free pick'] });
  spicy = await ch.createGrid(db, { year: 2026, name: 'Spicy', prompts: ['Enemies', 'Forced proximity'] });
});
const slot = async (cid: string, label: string) => (await ch.getChallenge(db, cid))!.groups.flatMap((g) => g.slots).concat((await ch.getChallenge(db, cid))!.loose).find((s) => s.label === label)!.id;
const show = () => render(<DbContext.Provider value={db}><MemoryRouter initialEntries={[`/book/${bookId}/${readId}`]}><Routes><Route path="book/:bookId/:readId" element={<BookLogPage />} /></Routes></MemoryRouter></DbContext.Provider>);

describe('challenge repo for a read', () => {
  it('lists the prompt a read fills in each challenge, one per challenge, several challenges allowed', async () => {
    await ch.fillSlot(db, await slot(cozy, 'A baker'), readId);
    await ch.fillSlot(db, await slot(spicy, 'Enemies'), readId);
    await ch.fillSlot(db, await slot(cozy, 'A spy'), readId); // moves within Cozy
    const items = await ch.listReadChallenges(db, readId);
    expect(items.map((i) => [i.name, i.group, i.label])).toEqual([['Cozy', 'Main Character', 'A spy'], ['Spicy', null, 'Enemies']]);
    expect(items[0]).toMatchObject({ done: 1, total: 3 });
  });
  it('offers every published challenge with its prompts, marking the current one and prompts holding another book', async () => {
    const other = await createRead(db, await createBook(db, { title: 'Other', authors: ['X'] }), 'reading');
    await ch.fillSlot(db, await slot(cozy, 'A baker'), other);
    await ch.fillSlot(db, await slot(cozy, 'A spy'), readId);
    const choices = await ch.listChallengeChoices(db, readId, [2026]);
    expect(choices.map((c) => c.name)).toEqual(['Cozy', 'Spicy']);
    const c = choices[0];
    expect(c.current_slot_id).toBe(await slot(cozy, 'A spy'));
    expect(c.slots.map((s) => [s.group, s.label, s.taken])).toEqual([[null, 'Free pick', null], ['Main Character', 'A baker', 'Other'], ['Main Character', 'A spy', null]]);
    expect(await ch.listChallengeChoices(db, readId, [2020])).toEqual([]);
  });
});

describe('the Challenges card on the Book Log', () => {
  it('adds the read to two challenges, one prompt each, and shows both', async () => {
    show();
    const card = (await screen.findByText('Challenges')).closest('.bcard') as HTMLElement;
    expect(within(card).getByText('This read is not counting toward a challenge.')).toBeTruthy();
    fireEvent.click(within(card).getByText('+ Add to a challenge'));
    fireEvent.change(within(card).getByLabelText('Challenge'), { target: { value: cozy } });
    fireEvent.change(within(card).getByLabelText('Prompt in Cozy'), { target: { value: await slot(cozy, 'A baker') } });
    fireEvent.click(within(card).getByText('Add to challenge'));
    await waitFor(() => expect(within(card).getByText('A baker')).toBeTruthy());
    fireEvent.click(within(card).getByText('+ Add to a challenge'));
    expect(within(card).queryByRole('option', { name: /Cozy/ })).toBeNull(); // already used
    fireEvent.change(within(card).getByLabelText('Challenge'), { target: { value: spicy } });
    fireEvent.change(within(card).getByLabelText('Prompt in Spicy'), { target: { value: await slot(spicy, 'Enemies') } });
    fireEvent.click(within(card).getByText('Add to challenge'));
    await waitFor(() => expect(within(card).getByText('Enemies')).toBeTruthy());
    expect(within(card).getByText('A baker')).toBeTruthy();
    expect((await ch.listReadChallenges(db, readId)).map((i) => i.label)).toEqual(['A baker', 'Enemies']);
  });
  it('changes the prompt within a challenge, warns when the prompt is taken, and takes the book off', async () => {
    const other = await createRead(db, await createBook(db, { title: 'Other', authors: ['X'] }), 'reading');
    await ch.fillSlot(db, await slot(cozy, 'A spy'), other);
    await ch.fillSlot(db, await slot(cozy, 'A baker'), readId);
    show();
    const card = (await screen.findByText('Challenges')).closest('.bcard') as HTMLElement;
    await within(card).findByText('A baker');
    fireEvent.click(within(card).getByLabelText('Change the prompt in Cozy'));
    expect(within(card).getByText('Move here').hasAttribute('disabled')).toBe(true);
    fireEvent.change(within(card).getByLabelText('Prompt in Cozy'), { target: { value: await slot(cozy, 'Free pick') } });
    fireEvent.click(within(card).getByText('Move here'));
    await waitFor(() => expect(within(card).getByText('Free pick')).toBeTruthy());
    fireEvent.click(within(card).getByLabelText('Take this book off Cozy'));
    await waitFor(() => expect(within(card).getByText('This read is not counting toward a challenge.')).toBeTruthy());
    expect(await ch.listReadChallenges(db, readId)).toEqual([]);
  });
  it('says so when a chosen prompt already holds another book', async () => {
    const other = await createRead(db, await createBook(db, { title: 'Other', authors: ['X'] }), 'reading');
    await ch.fillSlot(db, await slot(spicy, 'Enemies'), other);
    show();
    const card = (await screen.findByText('Challenges')).closest('.bcard') as HTMLElement;
    fireEvent.click(within(card).getByText('+ Add to a challenge'));
    fireEvent.change(within(card).getByLabelText('Challenge'), { target: { value: spicy } });
    fireEvent.change(within(card).getByLabelText('Prompt in Spicy'), { target: { value: await slot(spicy, 'Enemies') } });
    expect(within(card).getByRole('note').textContent).toContain('already has Other');
  });
});

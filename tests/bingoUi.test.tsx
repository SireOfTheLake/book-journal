// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DbContext } from '../src/db/DbContext';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { createBook } from '../src/repo/books';
import { createRead } from '../src/repo/bookLog';
import * as bg from '../src/repo/bingo';
import * as ch from '../src/repo/challenges';
import BankPage from '../src/pages/BankPage';
import ChallengePage from '../src/pages/ChallengePage';
import ChallengesPage from '../src/pages/ChallengesPage';

vi.mock('../src/ui/imageFile', () => ({
  fileToDataUrl: async (f: File) => ({ dataUrl: `data:image/png;base64,${f.name}`, width: 5, height: 5, mime: 'image/png' }),
  fileToSquare: async (f: File) => ({ dataUrl: `data:image/png;base64,sq-${f.name}`, width: 5, height: 5, mime: 'image/png' }),
}));

afterEach(cleanup);
let db: Db;
beforeEach(() => { db = migrateNodeDb(); });
const YEAR = new Date().getFullYear();
const ui = (path: string) => render(
  <DbContext.Provider value={db}><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="journal/challenges" element={<ChallengesPage />} /><Route path="journal/challenges/banks/:id" element={<BankPage />} /><Route path="journal/challenges/:id" element={<ChallengePage />} /><Route path="*" element={<Outlet />} />
  </Routes></MemoryRouter></DbContext.Provider>);
const prompts = (n: number) => Array.from({ length: n }, (_, i) => `Prompt ${i + 1}`);
const board = async (published = false, n = 30) => {
  const bankId = await bg.createBank(db, 'Fall', prompts(n));
  const id = await bg.createBingo(db, { year: YEAR, name: 'Fall Bingo', bankId });
  if (published) await bg.publishBingo(db, id);
  return { id, bankId };
};
const file = (n: string) => new File(['x'], n, { type: 'image/png' });

describe('making a bingo challenge', () => {
  it('creates a new bank and a draft board from the form', async () => {
    ui('/journal/challenges');
    fireEvent.click(await screen.findByRole('button', { name: '+ New challenge' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bingo' }));
    fireEvent.change(screen.getByPlaceholderText('100 Prompts'), { target: { value: 'Fall Bingo' } });
    fireEvent.change(screen.getByLabelText('Bank prompts'), { target: { value: prompts(10).join('\n') } });
    fireEvent.click(screen.getByRole('button', { name: 'Create challenge' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/24 prompts/);
    fireEvent.change(screen.getByLabelText('Bank prompts'), { target: { value: prompts(30).join('\n') } });
    fireEvent.click(screen.getByRole('button', { name: 'Create challenge' }));
    await screen.findByRole('heading', { name: 'Fall Bingo' }).catch(() => undefined);
    await screen.findByText(/This board is a draft/);
    expect(screen.getAllByRole('gridcell')).toHaveLength(25);
    expect(screen.getByText('FREE')).toBeTruthy();
    expect((await bg.listBanks(db, YEAR))).toHaveLength(1); // the failed first try left no stray bank
  });
  it('asks whether to prefer prompts not used last year only when the bank has an earlier board', async () => {
    const bankId = await bg.createBank(db, 'Fall', prompts(30));
    ui('/journal/challenges');
    fireEvent.click(await screen.findByRole('button', { name: '+ New challenge' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bingo' }));
    expect(screen.queryByText(/were not on your/)).toBeNull();
    cleanup();
    await bg.createBingo(db, { year: YEAR - 1, name: 'Old', bankId });
    ui('/journal/challenges');
    fireEvent.click(await screen.findByRole('button', { name: '+ New challenge' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bingo' }));
    expect(await screen.findByText(new RegExp(`were not on your ${YEAR - 1} board`))).toBeTruthy();
    expect((screen.getByRole('switch') as HTMLInputElement).checked).toBe(true);
  });
  it('lists banks and makes a new one', async () => {
    ui('/journal/challenges');
    fireEvent.click(await screen.findByRole('button', { name: '+ New bank' }));
    fireEvent.change(screen.getByLabelText('New bank name'), { target: { value: 'Winter' } });
    fireEvent.change(screen.getByLabelText('New bank prompts'), { target: { value: 'Snow\nSled' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create bank' }));
    expect(await screen.findByText('2 prompts')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Winter' })).toBeTruthy();
  });
});

describe('a draft board', () => {
  it('starts with a free space and zero bingos, and cannot take books yet', async () => {
    const { id } = await board();
    ui(`/journal/challenges/${id}`);
    await screen.findByText(/This board is a draft/);
    expect(screen.getByText('FREE')).toBeTruthy();
    expect(screen.getByText('0/25')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Publish board' })).toBeTruthy();
  });
  it('changes a square\'s words, picture and colour, swaps it, and picks from the bank', async () => {
    const { id } = await board();
    ui(`/journal/challenges/${id}`);
    const first = (await ch.getChallenge(db, id))!.loose[0];
    fireEvent.click(await screen.findByRole('button', { name: `Edit square: ${first.label}` }));
    const dlg = await screen.findByRole('dialog', { name: 'Change this square' });
    fireEvent.change(within(dlg).getByLabelText('Square text'), { target: { value: 'Pumpkins on the cover' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Save words' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit square: Pumpkins on the cover' })).toBeTruthy());
    fireEvent.change(within(dlg).getByLabelText('Square picture'), { target: { files: [file('pumpkin.png')] } });
    await waitFor(() => expect(within(dlg).getByRole('button', { name: 'Remove picture' })).toBeTruthy());
    expect((await ch.getChallenge(db, id))!.loose[0].art).toBe('data:image/png;base64,sq-pumpkin.png');
    const color = (await ch.getChallenge(db, id))!.bingo!.palette[1];
    fireEvent.click(within(dlg).getByRole('button', { name: `Square color ${color}` }));
    await waitFor(async () => expect((await ch.getChallenge(db, id))!.loose[0].color).toBe(color));
    fireEvent.click(within(dlg).getByRole('button', { name: 'Swap for another prompt' }));
    await waitFor(async () => expect((await ch.getChallenge(db, id))!.loose[0].label).not.toBe('Pumpkins on the cover'));
    const list = within(dlg).getByRole('list', { name: 'Bank prompts not on the board' });
    const options = within(list).getAllByRole('button');
    expect(options).toHaveLength(30 - 24);
    const wanted = options[0].textContent!.replace('has a picture', '');
    fireEvent.click(options[0]);
    await waitFor(async () => expect((await ch.getChallenge(db, id))!.loose[0].label).toBe(wanted));
    fireEvent.click(within(dlg).getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('gives the free space a prompt, then back to a plain FREE', async () => {
    const { id } = await board();
    ui(`/journal/challenges/${id}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit square: Free space' }));
    const dlg = await screen.findByRole('dialog');
    expect(within(dlg).queryByRole('button', { name: 'Swap for another prompt' })).toBeNull();
    fireEvent.change(within(dlg).getByLabelText('Square text'), { target: { value: 'Read outside' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Save words' }));
    await screen.findByText('0/25');
    fireEvent.change(within(dlg).getByLabelText('Square text'), { target: { value: '' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Save words' }));
    expect(screen.getByText('0/25')).toBeTruthy();
  });
  it('draws a whole new board, trades two squares by dragging, and publishes', async () => {
    const { id } = await board();
    ui(`/journal/challenges/${id}`);
    await screen.findByText(/This board is a draft/);
    const labels = () => screen.getAllByRole('gridcell').map((c) => within(c).getByRole('button').getAttribute('title'));
    const before = labels();
    fireEvent.click(screen.getByRole('button', { name: 'Draw a whole new board' }));
    await waitFor(() => expect(labels()).not.toEqual(before));
    const now = labels();
    const cells = screen.getAllByRole('gridcell');
    fireEvent.dragStart(cells[0]); fireEvent.dragOver(cells[1]); fireEvent.drop(cells[1]);
    await waitFor(() => expect(labels().slice(0, 2)).toEqual([now[1], now[0]]));
    fireEvent.click(screen.getByRole('button', { name: 'Publish board' }));
    await waitFor(() => expect(screen.queryByText(/This board is a draft/)).toBeNull());
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Draw a whole new board' })).toBeNull();
  });
});

describe('a published board', () => {
  it('opens the book search from a square, fills it, shows the tracker, and takes the book off with the x', async () => {
    const { id } = await board(true);
    const b = await createBook(db, { title: 'Pumpkin Patch', authors: ['Au'] }); await createRead(db, b, 'finished');
    ui(`/journal/challenges/${id}`);
    const sq = (await ch.getChallenge(db, id))!.loose[3];
    fireEvent.click(await screen.findByRole('button', { name: `Add a book for ${sq.label}` }));
    const dlg = await screen.findByRole('dialog', { name: 'Choose a book' });
    fireEvent.click(await within(dlg).findByText('Pumpkin Patch'));
    await waitFor(() => expect(screen.getByText('1/25')).toBeTruthy());
    expect(screen.getByText('24 left')).toBeTruthy();
    expect(screen.getByRole('button', { name: `Change the book for ${sq.label}` })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: `Take Pumpkin Patch off ${sq.label}` }));
    await waitFor(() => expect(screen.getByText('0/25')).toBeTruthy());
  });
  it('takes a book on the free space, and counts a completed row as a bingo', async () => {
    const { id } = await board(true);
    ui(`/journal/challenges/${id}`);
    const free = await screen.findByRole('button', { name: 'Add a book for Free space' });
    expect((free as HTMLButtonElement).disabled).toBe(false);
    const c = (await ch.getChallenge(db, id))!;
    for (let i = 0; i < 5; i++) { const b = await createBook(db, { title: `Book ${i}`, authors: ['A'] }); const r = await createRead(db, b, 'finished'); await ch.fillSlot(db, c.loose[10 + i].id, r); } // the middle row has the free space in it
    await bg.setBingoGoal(db, id, 1);
    cleanup(); ui(`/journal/challenges/${id}`);
    await screen.findByText('1/1'); // one row of five makes the one bingo the goal asks for
  });
  it('changes a color from the set or the color wheel, and sets the goal', async () => {
    const { id } = await board(true);
    ui(`/journal/challenges/${id}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    const palette = within(screen.getByRole('group', { name: 'Palette' }));
    expect(screen.getByText('0/25')).toBeTruthy();
    expect(screen.queryByText(/^Goal:/)).toBeNull();
    expect(screen.getByText('Bingos: 0')).toBeTruthy(); // a full blackout still counts the bingos
    fireEvent.click(palette.getByRole('button', { name: 'Change color #c0566b' }));
    fireEvent.click(palette.getByRole('button', { name: 'Use color #6c9a4f' }));
    await waitFor(async () => expect((await ch.getChallenge(db, id))!.bingo!.palette).toContain('#6c9a4f'));
    fireEvent.click(palette.getByRole('button', { name: 'Change color #6c9a4f' }));
    fireEvent.change(palette.getByLabelText('Pick a custom color'), { target: { value: '#112233' } });
    await waitFor(async () => expect((await ch.getChallenge(db, id))!.bingo!.palette).toContain('#112233'));
    fireEvent.change(screen.getByLabelText('Bingo goal'), { target: { value: '2' } });
    await screen.findByText('0/2');
    expect(screen.getByText('bingos')).toBeTruthy();
    expect(screen.getByText('Squares: 0/25')).toBeTruthy();
  });
  it('stays editable: squares open the editor in Edit mode, the palette and size can change', async () => {
    const { id } = await board(true);
    ui(`/journal/challenges/${id}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    const palette = within(screen.getByRole('group', { name: 'Palette' }));
    fireEvent.click(palette.getByRole('button', { name: 'Remove color #c0566b' }));
    await waitFor(async () => expect((await ch.getChallenge(db, id))!.bingo!.palette).not.toContain('#c0566b'));
    expect(palette.queryByText('#c0566b')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Make the squares bigger' }));
    await waitFor(async () => expect((await ch.getChallenge(db, id))!.layout.cols.board).toBe(4));
    expect((screen.getByRole('grid') as HTMLElement).style.getPropertyValue('--sq')).toBe('140px');
    const first = (await ch.getChallenge(db, id))!.loose[0];
    fireEvent.click(screen.getByRole('button', { name: `Edit square: ${first.label}` }));
    await screen.findByRole('dialog', { name: 'Change this square' });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    fireEvent.click(screen.getByRole('button', { name: 'Re-roll the colors' }));
    fireEvent.click(screen.getByRole('button', { name: 'Shuffle the squares' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete challenge' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete the whole challenge' }));
    await screen.findByText(/No challenges for/);
  });
});

describe('the prompt bank page', () => {
  it('adds prompts, adds and removes a picture, edits and deletes a prompt', async () => {
    const bankId = await bg.createBank(db, 'Fall', ['Plaid', 'Pumpkins']);
    ui(`/journal/challenges/banks/${bankId}`);
    await screen.findByDisplayValue('Plaid');
    expect(screen.getByText(/a board needs 24, add 22 more/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Add prompts, one per line'), { target: { value: 'Cozy\nLeaves' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add prompts' }));
    await screen.findByDisplayValue('Leaves');
    fireEvent.change(screen.getByLabelText('Picture for Plaid'), { target: { files: [file('plaid.png')] } });
    await screen.findByAltText('Picture for Plaid');
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove picture' })[0]);
    await waitFor(() => expect(screen.queryByAltText('Picture for Plaid')).toBeNull());
    const box = screen.getByLabelText('Prompt: Plaid');
    fireEvent.change(box, { target: { value: 'Character wears plaid' } }); fireEvent.blur(box);
    await screen.findByDisplayValue('Character wears plaid');
    fireEvent.change(screen.getByLabelText('Search prompts'), { target: { value: 'leaves' } });
    expect(screen.queryByDisplayValue('Cozy')).toBeNull();
    fireEvent.change(screen.getByLabelText('Search prompts'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Delete prompt Cozy' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete it' }));
    await waitFor(() => expect(screen.queryByDisplayValue('Cozy')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Delete this bank' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete the bank' }));
    await waitFor(async () => expect(await bg.listBanks(db, YEAR)).toEqual([]));
  });
});

describe('the BINGO letters', () => {
  it('sit over the five columns, centred with the board, in palette colours that stay the same', async () => {
    const { id } = await board(true);
    ui(`/journal/challenges/${id}`);
    await screen.findByRole('grid');
    const letters = () => [...document.querySelectorAll('.bingostage .bingoletter')].map((e) => [e.textContent, (e as HTMLElement).style.getPropertyValue('--lc')]);
    expect(letters().map((l) => l[0]).join('')).toBe('BINGO');
    expect(letters().every((l) => /^#[0-9a-f]{6}$/i.test(l[1] as string))).toBe(true);
    expect(document.querySelector('.bingostage .bingoboard')).toBeTruthy();
    const first = letters();
    cleanup(); ui(`/journal/challenges/${id}`); await screen.findByRole('grid');
    expect(letters()).toEqual(first);
  });
});

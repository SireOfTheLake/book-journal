// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DbContext } from '../src/db/DbContext';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { createBook } from '../src/repo/books';
import { createRead } from '../src/repo/bookLog';
import * as ch from '../src/repo/challenges';
import ChallengePage from '../src/pages/ChallengePage';
import ChallengesPage from '../src/pages/ChallengesPage';

vi.mock('../src/ui/imageFile', () => ({
  fileToDataUrl: async (f: File) => ({ dataUrl: `data:image/png;base64,${f.name}`, width: 5, height: 5, mime: 'image/png' }),
}));

afterEach(cleanup);
let db: Db;
beforeEach(() => { db = migrateNodeDb(); });
const ui = (path: string) => render(
  <DbContext.Provider value={db}><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="journal/challenges" element={<ChallengesPage />} /><Route path="journal/challenges/:id" element={<ChallengePage />} /><Route path="*" element={<Outlet />} />
  </Routes></MemoryRouter></DbContext.Provider>);
const files = (...names: string[]) => names.map((n) => new File(['x'], n, { type: 'image/png' }));

describe('sticker challenges in the app', () => {
  it('uploads stickers, adds a prompt to each, creates the challenge, and shows blank spaces', async () => {
    ui('/journal/challenges');
    fireEvent.click(await screen.findByRole('button', { name: '+ New challenge' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sticker' }));
    fireEvent.change(screen.getByPlaceholderText('100 Prompts'), { target: { value: 'Book Boyfriend' } });
    fireEvent.change(screen.getByLabelText('Upload stickers'), { target: { files: files('a.png', 'b.png', 'c.png') } });
    await screen.findByAltText('Sticker 3');
    fireEvent.click(screen.getByText('Fill the prompts from a list'));
    fireEvent.change(screen.getByLabelText('Prompt list'), { target: { value: 'The grump\nThe sunshine' } });
    fireEvent.click(screen.getByRole('button', { name: 'Fill in order' }));
    expect((screen.getByLabelText('Prompt for sticker 2') as HTMLInputElement).value).toBe('The sunshine');
    expect((screen.getByLabelText('Prompt for sticker 3') as HTMLInputElement).value).toBe('c'); // starts as the file name
    fireEvent.change(screen.getByLabelText('Prompt for sticker 3'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create challenge' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/prompt/i);
    fireEvent.click(screen.getByRole('button', { name: 'Remove sticker 3' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create challenge' }));
    await screen.findByRole('heading', { name: 'Book Boyfriend' });
    expect(screen.getByText('0/2')).toBeTruthy();
    expect(document.querySelectorAll('.stickersheet .sticker img')).toHaveLength(0); // blank until earned
    expect(screen.getByRole('button', { name: 'Add a book for The grump' })).toBeTruthy();
  });
  it('shows a sticker once its prompt has a book, and lets you add and replace stickers when editing', async () => {
    const id = await ch.createSticker(db, { year: new Date().getFullYear(), name: 'BB', stickers: [{ prompt: 'The grump', image: { dataUrl: 'data:image/png;base64,g' } }, { prompt: 'The sunshine', image: { dataUrl: 'data:image/png;base64,s' } }] });
    const b = await createBook(db, { title: 'Grumpy Book', authors: ['Au'] }); const r = await createRead(db, b, 'finished');
    ui(`/journal/challenges/${id}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Add a book for The grump' }));
    const dlg = await screen.findByRole('dialog', { name: 'Choose a book' });
    fireEvent.click(await within(dlg).findByText('Grumpy Book'));
    await waitFor(() => expect(screen.getByText('1/2')).toBeTruthy());
    expect(document.querySelectorAll('.stickersheet .sticker img')).toHaveLength(1);
    expect(r).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(document.querySelectorAll('.stickersheet .sticker img')).toHaveLength(2); // editing shows them all
    fireEvent.change(screen.getByLabelText('Replace sticker for The sunshine'), { target: { files: files('new.png') } });
    await waitFor(() => expect(screen.getByAltText('Sticker for The sunshine').getAttribute('src')).toBe('data:image/png;base64,new.png'));
    fireEvent.change(screen.getAllByLabelText('Upload stickers')[0], { target: { files: files('x.png') } });
    await screen.findByAltText('Sticker 1');
    fireEvent.change(screen.getByLabelText('Prompt for sticker 1'), { target: { value: 'The cinnamon roll' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add 1 sticker' }));
    await waitFor(() => expect(screen.getByText('1/3')).toBeTruthy());
    expect(screen.getByLabelText('Add a book for The cinnamon roll')).toBeTruthy();
  });

  it('groups stickers into sub-categories when creating, each sticker above its book slot', async () => {
    ui('/journal/challenges');
    fireEvent.click(await screen.findByRole('button', { name: '+ New challenge' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sticker' }));
    fireEvent.change(screen.getByPlaceholderText('100 Prompts'), { target: { value: 'Tropes' } });
    for (const g of ['Main Character', 'Setting']) { fireEvent.change(screen.getByLabelText('New sub-category'), { target: { value: g } }); fireEvent.click(screen.getByRole('button', { name: 'Add sub-category' })); }
    fireEvent.change(screen.getByLabelText('Upload stickers'), { target: { files: files('The grump.png', 'Small town.png', 'Loose.png') } });
    await screen.findByAltText('Sticker 3');
    expect((screen.getByLabelText('Prompt for sticker 1') as HTMLInputElement).value).toBe('The grump');
    fireEvent.change(screen.getByLabelText('Sub-category for sticker 1'), { target: { value: 'Main Character' } });
    fireEvent.change(screen.getByLabelText('Sub-category for sticker 2'), { target: { value: 'Setting' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create challenge' }));
    await screen.findByRole('heading', { name: 'Tropes' });
    const mc = screen.getByRole('region', { name: 'Main Character' });
    expect(within(mc).getByRole('button', { name: 'Add a book for The grump' })).toBeTruthy();
    expect(mc.querySelectorAll('.gslot')).toHaveLength(1);
    expect(within(screen.getByRole('region', { name: 'Setting' })).getByRole('button', { name: 'Add a book for Small town' })).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Main prompts' })).getByRole('button', { name: 'Add a book for Loose' })).toBeTruthy();
    expect(screen.getAllByText('0/1', { selector: '.ghead span' })).toHaveLength(2); // each sub-category counts on its own
  });
  it('removing a sub-category in the form puts its stickers back with the main prompts', async () => {
    ui('/journal/challenges');
    fireEvent.click(await screen.findByRole('button', { name: '+ New challenge' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sticker' }));
    fireEvent.change(screen.getByLabelText('New sub-category'), { target: { value: 'Setting' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add sub-category' }));
    fireEvent.change(screen.getByLabelText('Upload stickers'), { target: { files: files('a.png') } });
    await screen.findByAltText('Sticker 1');
    fireEvent.change(screen.getByLabelText('Sub-category for sticker 1'), { target: { value: 'Setting' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remove sub-category Setting' }));
    expect(screen.queryByLabelText('Sub-category for sticker 1')).toBeNull();
  });
  it('adds stickers into an existing sub-category and lets you add a sub-category in Edit mode', async () => {
    const id = await ch.createSticker(db, { year: new Date().getFullYear(), name: 'T', groups: [{ name: 'Setting' }], stickers: [{ prompt: 'Small town', image: { dataUrl: 'data:a' }, group: 'Setting' }] });
    ui(`/journal/challenges/${id}`);
    await screen.findByText('Small town');
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('New sub-category'), { target: { value: 'Mood' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add sub-category' }));
    await screen.findByRole('region', { name: 'Mood' });
    fireEvent.change(screen.getAllByLabelText('Upload stickers')[0], { target: { files: files('Cozy.png') } });
    await screen.findByAltText('Sticker 1');
    fireEvent.change(screen.getByLabelText('Sub-category for sticker 1'), { target: { value: (await ch.getChallenge(db, id))!.groups[1].id } });
    fireEvent.click(screen.getByRole('button', { name: 'Add 1 sticker' }));
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Mood' })).getByRole('button', { name: 'Add a book for Cozy' })).toBeTruthy());
  });
});

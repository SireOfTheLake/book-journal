// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DbContext } from '../src/db/DbContext';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { createBook } from '../src/repo/books';
import { createRead, updateRead } from '../src/repo/bookLog';
import { getChallenge, listChallenges } from '../src/repo/challenges';
import { createUsMap } from '../src/repo/usmap';
import ChallengePage from '../src/pages/ChallengePage';
import ChallengesPage from '../src/pages/ChallengesPage';
import DashboardPage from '../src/pages/DashboardPage';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
let db: Db;
beforeEach(() => { db = migrateNodeDb(); });
const Y = new Date().getFullYear();
async function read(title: string, finish: string | null = `${Y}-03-10`) {
  const r = await createRead(db, await createBook(db, { title, authors: ['Ann'] }), 'finished');
  if (finish) await updateRead(db, r, { finish_date: finish });
  return r;
}
const wrap = (path: string, el: React.ReactNode, route: string) => render(<DbContext.Provider value={db}><MemoryRouter initialEntries={[path]}><Routes><Route path={route} element={el} /><Route path="*" element={<div>elsewhere</div>} /></Routes></MemoryRouter></DbContext.Provider>);
const openMap = async () => {
  const id = await createUsMap(db, { year: Y, name: 'Across America' });
  wrap(`/journal/challenges/${id}`, <ChallengePage />, '/journal/challenges/:id');
  await screen.findByRole('group', { name: 'States' });
  return id;
};

describe('creating a US map', () => {
  it('is a kind in the new challenge form and opens the map', async () => {
    wrap('/journal/challenges', <ChallengesPage />, '/journal/challenges');
    fireEvent.click(await screen.findByRole('button', { name: '+ New challenge' }));
    fireEvent.click(screen.getByRole('button', { name: 'Map' }));
    expect(screen.getByText(/A card for every state/)).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('100 Prompts'), { target: { value: 'Across America' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create challenge' }));
    await screen.findByText('elsewhere');
    const [c] = await listChallenges(db, Y);
    expect(c).toMatchObject({ name: 'Across America', usMap: true, total: 50 });
  });
});

describe('the map page', () => {
  it('shows the map above 50 state cards, all empty at first', async () => {
    await openMap();
    const map = screen.getByRole('group', { name: 'States' });
    expect(within(map).getAllByRole('button')).toHaveLength(50);
    expect(within(map).getByRole('button', { name: 'Alaska: add a book' })).toBeTruthy();
    expect(within(map).getByRole('button', { name: 'Hawaii: add a book' })).toBeTruthy();
    expect(document.querySelectorAll('.stcard')).toHaveLength(50);
    expect(document.querySelectorAll('.ust.filled')).toHaveLength(0);
    expect(screen.getByText(/0 of 50 states/)).toBeTruthy();
    // the map comes first on the page, the cards after it
    const mapEl = document.querySelector('.usmapcard')!; const cards = document.querySelector('.stcards')!;
    expect(mapEl.compareDocumentPosition(cards) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it('fills a state with a random color when its book is chosen from the map, and shows the book on the card', async () => {
    await read('Giant');
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const id = await openMap();
    fireEvent.click(screen.getByRole('button', { name: 'Texas: add a book' }));
    fireEvent.click(await screen.findByRole('button', { name: /Giant/ }));
    const tx = await screen.findByRole('button', { name: 'Texas: Giant' });
    expect(tx.getAttribute('style')).toMatch(/fill:\s*(#c4683d|rgb\(196, 104, 61\))/i);
    expect(document.querySelectorAll('.ust.filled')).toHaveLength(1);
    const card = screen.getByRole('button', { name: 'Change the book for Texas' }).closest('li')!;
    expect(within(card).getByText('Giant')).toBeTruthy();
    expect(screen.getAllByText(/1 of 50 states/).length).toBeGreaterThan(0);
    expect((await getChallenge(db, id))!.done).toBe(1);
  });
  it('fills from a state card too, and takes the book off again', async () => {
    await read('Giant');
    await openMap();
    fireEvent.click(screen.getByRole('button', { name: 'Add a book for Ohio' }));
    fireEvent.click(await screen.findByRole('button', { name: /Giant/ }));
    await screen.findByRole('button', { name: 'Ohio: Giant' });
    fireEvent.click(screen.getByRole('button', { name: 'Take Giant off Ohio' }));
    await screen.findByRole('button', { name: 'Ohio: add a book' });
    expect(document.querySelectorAll('.ust.filled')).toHaveLength(0);
  });
  it('can show only the states without a book', async () => {
    await read('Giant');
    await openMap();
    fireEvent.click(screen.getByRole('button', { name: 'Add a book for Ohio' }));
    fireEvent.click(await screen.findByRole('button', { name: /Giant/ }));
    await screen.findByRole('button', { name: 'Ohio: Giant' });
    fireEvent.click(screen.getByLabelText('Only states without a book'));
    expect(document.querySelectorAll('.stcard')).toHaveLength(49);
    expect(screen.queryByRole('button', { name: 'Change the book for Ohio' })).toBeNull();
  });
  it('names the hovered state and its book under the map', async () => {
    await read('Giant');
    await openMap();
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Utah: add a book' }));
    expect(screen.getByText(/no book yet, click to add one/)).toBeTruthy();
  });
  it('rolls a new color in Edit mode', async () => {
    await read('Giant');
    const id = await openMap();
    fireEvent.click(screen.getByRole('button', { name: 'Add a book for Ohio' }));
    fireEvent.click(await screen.findByRole('button', { name: /Giant/ }));
    await screen.findByRole('button', { name: 'Ohio: Giant' });
    const before = (await getChallenge(db, id))!.loose.find((s) => s.label === 'Ohio')!.color;
    expect(screen.queryByRole('button', { name: 'New color for Ohio' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'New color for Ohio' }));
    await waitFor(async () => expect((await getChallenge(db, id))!.loose.find((s) => s.label === 'Ohio')!.color).not.toBe(before));
  });
});

describe('the dashboard', () => {
  it('shows a filled state in its color', async () => {
    const id = await createUsMap(db, { year: Y, name: 'Across America' });
    const s = (await getChallenge(db, id))!.loose.find((x) => x.label === 'Idaho')!;
    const { fillSlot } = await import('../src/repo/challenges');
    await fillSlot(db, s.id, await read('Potato'), () => 0);
    wrap('/', <DashboardPage />, '/');
    fireEvent.click(await screen.findByRole('tab', { name: /^Mar/ }));
    const card = (await screen.findByText(/^Stickers from March/)).closest('.bcard') as HTMLElement;
    await waitFor(() => expect(card.querySelectorAll('.dstate svg.stateshape path')).toHaveLength(1));
    expect(card.querySelector('.dstate svg path')!.getAttribute('fill')).toBe('#c4683d');
  });
});

describe('deleting a challenge from the list', () => {
  it('asks first, then removes it and keeps the books', async () => {
    const id = await createUsMap(db, { year: Y, name: 'Across America' });
    const r = await read('Giant');
    const { fillSlot } = await import('../src/repo/challenges');
    await fillSlot(db, (await getChallenge(db, id))!.loose[0].id, r);
    wrap('/journal/challenges', <ChallengesPage />, '/journal/challenges');
    fireEvent.click(await screen.findByRole('button', { name: 'Delete challenge Across America' }));
    expect(await listChallenges(db, Y)).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
    expect(await listChallenges(db, Y)).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Delete challenge Across America' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Across America' }));
    await waitFor(async () => expect(await listChallenges(db, Y)).toHaveLength(0));
    expect((await db.select('SELECT id FROM book WHERE deleted_at IS NULL')).length).toBe(1);
  });
});

describe('a limited map', () => {
  it('shows N boxes, a place picker, and a warning for a book without a place', async () => {
    const { createMap } = await import('../src/repo/usmap');
    const { fillSlot } = await import('../src/repo/challenges');
    const id = await createMap(db, { year: Y, name: 'World', region: 'world', limit: 3 });
    const c = (await getChallenge(db, id))!;
    await fillSlot(db, c.loose[0].id, await read('Nomad'));
    wrap(`/journal/challenges/${id}`, <ChallengePage />, '/journal/challenges/:id');
    await screen.findByRole('group', { name: 'Countries' });
    expect(document.querySelectorAll('.stcard')).toHaveLength(3);
    expect(await screen.findByText(/no country chosen/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('country for Book 1'), { target: { value: 'France' } });
    await waitFor(() => expect(screen.queryByText(/no country chosen/)).toBeNull());
    expect(screen.getAllByText(/1 of 3 boxes/).length).toBeGreaterThan(0);
  });
});

describe('creating other maps from the form', () => {
  it('creates the map that was picked, not always the US', async () => {
    wrap('/journal/challenges', <ChallengesPage />, '/journal/challenges');
    fireEvent.click(await screen.findByRole('button', { name: '+ New challenge' }));
    fireEvent.click(screen.getByRole('button', { name: 'Map' }));
    fireEvent.change(screen.getByLabelText('Map'), { target: { value: 'canada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create challenge' }));
    await screen.findByText('elsewhere');
    const c = await getChallenge(db, (await listChallenges(db, Y))[0].id);
    expect(c).toMatchObject({ mapRegion: 'canada', total: 10 });
  });
});

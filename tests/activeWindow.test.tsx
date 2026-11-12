// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, it } from 'vitest';
import { DbContext } from '../src/db/DbContext';
import { migrateNodeDb } from '../src/db/nodeDb';
import * as bg from '../src/repo/bingo';
import * as ch from '../src/repo/challenges';
import ChallengePage from '../src/pages/ChallengePage';
import ChallengesPage from '../src/pages/ChallengesPage';
afterEach(cleanup);
const page = (db: any, path: string) => render(<DbContext.Provider value={db}><MemoryRouter initialEntries={[path]}><Routes>
  <Route path="journal/challenges" element={<ChallengesPage />} /><Route path="journal/challenges/:id" element={<ChallengePage />} /></Routes></MemoryRouter></DbContext.Provider>);

const makeBingo = async (db: any, name = 'Board', year = 2027) => {
  const bank = await bg.createBank(db, 'B', Array.from({ length: 30 }, (_, i) => `P${i}`));
  return bg.createBingo(db, { year, name, bankId: bank });
};
it('a regular challenge has no Home dates, since it runs all year', async () => {
  const db = migrateNodeDb();
  const id = await ch.createGrid(db, { year: 2027, name: 'Plain', prompts: ['x'] });
  page(db, `/journal/challenges/${id}`);
  await screen.findByRole('heading', { name: 'Plain' });
  expect(screen.queryByText('Active on Home')).toBeNull();
});
it('a Bingo board shows its dates as text under the tracker and sets them in the edit panel with the book-log date rules', async () => {
  const db = migrateNodeDb();
  const id = await makeBingo(db);
  await ch.setActiveWindow(db, id, '2027-10-01', null);
  page(db, `/journal/challenges/${id}`);
  expect((await screen.findByText(/Active on Home: From Oct 1, 2027/))).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Edit active from' }).textContent).toBe('Oct 1, 2027'); // a draft is in edit mode
  fireEvent.click(screen.getByRole('button', { name: 'Add end date' }));
  const box = screen.getByLabelText('Active until');
  fireEvent.change(box, { target: { value: '2027-09-01' } });
  fireEvent.blur(box);
  expect((await screen.findByRole('alert')).textContent).toMatch(/on or after 2027-10-01/);
  fireEvent.change(box, { target: { value: '2027-12-31' } });
  fireEvent.blur(box);
  expect((await screen.findByRole('button', { name: 'Edit active until' })).textContent).toBe('Dec 31, 2027');
  expect((await ch.getChallenge(db, id))?.activeUntil).toBe('2027-12-31');
  expect(await screen.findByText(/Active on Home: Oct 1, 2027 to Dec 31, 2027/)).toBeTruthy();
});
it('the challenge list shows the dates on Bingo cards only', async () => {
  const db = migrateNodeDb(); const Y = new Date().getFullYear();
  const b = await makeBingo(db, 'Dated Bingo', Y);
  await ch.setActiveWindow(db, b, `${Y}-10-01`, `${Y}-12-31`);
  const g = await ch.createGrid(db, { year: Y, name: 'Plain', prompts: ['x'] });
  await ch.setActiveWindow(db, g, `${Y}-01-01`, `${Y}-02-01`);
  page(db, '/journal/challenges');
  expect(await screen.findByText(`Active Oct 1, ${Y} to Dec 31, ${Y}`)).toBeTruthy();
  expect(screen.queryByText(/Jan 1, /)).toBeNull();
});
it('puts Delete on the same row as the move arrows', async () => {
  const db = migrateNodeDb();
  await ch.createGrid(db, { year: new Date().getFullYear(), name: 'Row', prompts: ['x'] });
  page(db, '/journal/challenges');
  const del = await screen.findByRole('button', { name: 'Delete challenge Row' });
  const later = screen.getByRole('button', { name: 'Move Row later' });
  expect(del.closest('.chalbar')).toBe(later.closest('.chalbar'));
  expect(del.closest('.chalbar')).not.toBeNull();
});

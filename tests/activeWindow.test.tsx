// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, it } from 'vitest';
import { DbContext } from '../src/db/DbContext';
import { migrateNodeDb } from '../src/db/nodeDb';
import * as ch from '../src/repo/challenges';
import ChallengePage from '../src/pages/ChallengePage';
import ChallengesPage from '../src/pages/ChallengesPage';
afterEach(cleanup);
const page = (db: any, path: string) => render(<DbContext.Provider value={db}><MemoryRouter initialEntries={[path]}><Routes>
  <Route path="journal/challenges" element={<ChallengesPage />} /><Route path="journal/challenges/:id" element={<ChallengePage />} /></Routes></MemoryRouter></DbContext.Provider>);

it('a regular challenge page shows and sets the Home dates with the book-log date rules', async () => {
  const db = migrateNodeDb();
  const id = await ch.createGrid(db, { year: 2027, name: 'Plain', prompts: ['x'] });
  await ch.setActiveWindow(db, id, '2027-10-01', null);
  page(db, `/journal/challenges/${id}`);
  expect((await screen.findByRole('button', { name: 'Edit active from' })).textContent).toBe('Oct 1, 2027');
  fireEvent.click(screen.getByRole('button', { name: 'Add end date' }));
  const box = screen.getByLabelText('Active until');
  fireEvent.change(box, { target: { value: '2027-09-01' } });
  fireEvent.blur(box);
  expect((await screen.findByRole('alert')).textContent).toMatch(/on or after 2027-10-01/);
  fireEvent.change(box, { target: { value: '2027-12-31' } });
  fireEvent.blur(box);
  expect((await screen.findByRole('button', { name: 'Edit active until' })).textContent).toBe('Dec 31, 2027');
  expect((await ch.getChallenge(db, id))?.activeUntil).toBe('2027-12-31');
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

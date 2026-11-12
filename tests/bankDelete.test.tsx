// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, it } from 'vitest';
import { DbContext } from '../src/db/DbContext';
import { migrateNodeDb } from '../src/db/nodeDb';
import * as bingo from '../src/repo/bingo';
import ChallengesPage from '../src/pages/ChallengesPage';
afterEach(cleanup);
it('deletes a bank from the Challenges page, after a confirm', async () => {
  const db = migrateNodeDb();
  const keep = await bingo.createBank(db, 'Keep me', ['a', 'b']);
  await bingo.createBank(db, 'Remove me', ['c']);
  render(<DbContext.Provider value={db}><MemoryRouter initialEntries={['/journal/challenges']}><Routes><Route path="journal/challenges" element={<ChallengesPage />} /></Routes></MemoryRouter></DbContext.Provider>);
  fireEvent.click(await screen.findByRole('button', { name: 'Delete bank Remove me' }));
  expect(screen.getByText('Keep me')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Delete Remove me' }));
  await screen.findByText('Keep me');
  await new Promise((r) => setTimeout(r, 50));
  expect(screen.queryByText('Remove me')).toBeNull();
  const left = await bingo.listBanks(db, new Date().getFullYear());
  expect(left.map((b) => b.id)).toEqual([keep]);
});

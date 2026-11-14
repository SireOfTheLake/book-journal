// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it } from 'vitest';
import { DbContext } from '../src/db/DbContext';
import { migrateNodeDb } from '../src/db/nodeDb';
import * as bg from '../src/repo/bingo';
import * as ch from '../src/repo/challenges';
import HomePage from '../src/pages/HomePage';
afterEach(cleanup);
const iso = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

it('Home warns about a Bingo that starts within a week, and keeps the in-season trackers in one shared grid', async () => {
  const db = migrateNodeDb();
  const Y = new Date().getFullYear();
  const bank = await bg.createBank(db, 'B', Array.from({ length: 30 }, (_, i) => `P${i}`));
  const soon = await bg.createBingo(db, { year: Y, name: 'Spooky Bingo', bankId: bank });
  await ch.setActiveWindow(db, soon, iso(3), iso(30));
  const now = await bg.createBingo(db, { year: Y, name: 'Running Bingo', bankId: bank });
  await bg.publishBingo(db, now);
  await ch.setActiveWindow(db, now, iso(-2), iso(10));
  render(<DbContext.Provider value={db}><MemoryRouter><HomePage /></MemoryRouter></DbContext.Provider>);
  const card = await screen.findByRole('status', { name: 'Bingo starting soon' });
  await waitFor(() => expect(card.textContent).toMatch(/Spooky Bingo.*starts in 3 days.*still a draft/));
  expect(card.textContent).not.toMatch(/Running Bingo/);
  expect(document.querySelector('.inseason .seasonlist li progress')).toBeTruthy();
});

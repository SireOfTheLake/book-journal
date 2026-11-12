// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, it } from 'vitest';
import { DbContext } from '../src/db/DbContext';
import { migrateNodeDb } from '../src/db/nodeDb';
import * as bg from '../src/repo/bingo';
import ChallengePage from '../src/pages/ChallengePage';
afterEach(cleanup);
it('the custom color box opens in HEX and follows the palette color being changed', async () => {
  const db = migrateNodeDb();
  const bank = await bg.createBank(db, 'B', Array.from({ length: 30 }, (_, i) => `P${i}`));
  const id = await bg.createBingo(db, { year: 2027, name: 'Board', bankId: bank, palette: ['#112233', '#445566'] });
  render(<DbContext.Provider value={db}><MemoryRouter initialEntries={[`/journal/challenges/${id}`]}><Routes><Route path="journal/challenges/:id" element={<ChallengePage />} /></Routes></MemoryRouter></DbContext.Provider>);
  fireEvent.click(await screen.findByRole('button', { name: 'Change color #112233' }));
  const box = screen.getByRole('button', { name: 'Custom color' });
  expect(box.textContent).toBe('#112233'); // the box shows the color being changed
  fireEvent.click(box); // and opens the picker
  expect((screen.getByLabelText('Color code') as HTMLSelectElement).value).toBe('HEX');
  expect((screen.getByLabelText('HEX code') as HTMLInputElement).value.toLowerCase()).toBe('#112233');
  fireEvent.click(screen.getByRole('button', { name: 'Change color #445566' }));
  expect(screen.getByRole('button', { name: 'Custom color' }).textContent).toBe('#445566');
});

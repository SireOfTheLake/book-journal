// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { DbContext } from '../src/db/DbContext';
import { migrateNodeDb } from '../src/db/nodeDb';
import * as ch from '../src/repo/challenges';
import ChallengePage from '../src/pages/ChallengePage';
import ChallengesPage from '../src/pages/ChallengesPage';
afterEach(cleanup);
let db: any; beforeEach(() => { db = migrateNodeDb(); });
for (const kind of ['Grid', 'Pyramid', 'Sticker', 'Word builder', 'Map']) it('keeps description on create: ' + kind, async () => {
  render(<DbContext.Provider value={db}><MemoryRouter initialEntries={['/journal/challenges']}><Routes>
    <Route path="journal/challenges" element={<ChallengesPage />} /><Route path="journal/challenges/:id" element={<ChallengePage />} /><Route path="*" element={<Outlet />} /></Routes></MemoryRouter></DbContext.Provider>);
  fireEvent.click(await screen.findByRole('button', { name: '+ New challenge' }));
  fireEvent.click(screen.getByRole('button', { name: kind }));
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'About me' } });
  const name = screen.getAllByRole('textbox')[0];
  fireEvent.change(name, { target: { value: 'Test ' + kind } });
  const box = screen.queryAllByRole('textbox').find((t) => (t as HTMLTextAreaElement).tagName === 'TEXTAREA' && t.getAttribute('aria-label') !== 'Description');
  if (box && kind !== 'Word builder' && kind !== 'Map') fireEvent.change(box, { target: { value: 'One\nTwo' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create challenge' }));
  await screen.findByRole('heading', { name: 'Test ' + kind });
  const list = await ch.listChallenges(db, new Date().getFullYear());
  const c = await ch.getChallenge(db, list[0].id);
  expect(c?.description).toBe('About me');
});

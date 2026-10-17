// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { migrateNodeDb } from '../src/db/nodeDb';
import { applyNotionPlan } from '../src/import/apply';
import { planNotionBooks } from '../src/import/notion';
import { getHome, type HomeData } from '../src/repo/home';
import HomeView from '../src/pages/HomeView';

afterEach(cleanup);
const act = { start: vi.fn(), resume: vi.fn(), finish: vi.fn(), log: vi.fn() };
async function homeData(): Promise<HomeData> {
  const db = migrateNodeDb();
  await applyNotionPlan(db, planNotionBooks(readFileSync(resolve(process.cwd(), 'tests/fixtures/book-tracker.csv'), 'utf8')), { tagDestinations: {} });
  return getHome(db, '2026-10-13');
}

describe('Home: caught up list', () => {
  it('keeps each comma straight after its link on the same line', async () => {
    const data = await homeData();
    data.tidy.caughtUp = [{ id: 'a', title: 'Alpha' }, { id: 'b', title: 'Beta' }, { id: 'c', title: 'Gamma' }];
    render(<MemoryRouter><HomeView data={data} act={act} /></MemoryRouter>);
    const item = screen.getByText(/Caught up on/).closest('li')!;
    expect(item.textContent).toContain('Caught up on Alpha, Beta, Gamma');
    const links = [...item.querySelectorAll('a')];
    expect(links.map((a) => a.textContent)).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(links.every((a) => a.classList.contains('inlinelink'))).toBe(true); // not a block of their own
    expect(item.textContent).not.toMatch(/^[\s,]|,\s*$|,\s*\(/); // no comma at the start of a line or after the last link
  });
  it('says how many more when there are more than three', async () => {
    const data = await homeData();
    data.tidy.caughtUp = ['A', 'B', 'C', 'D', 'E'].map((t) => ({ id: t, title: t }));
    render(<MemoryRouter><HomeView data={data} act={act} /></MemoryRouter>);
    expect(screen.getByText(/Caught up on/).closest('li')!.textContent).toContain('A, B, C and 2 more');
  });
});

describe('Home: covers', () => {
  it('gives placeholder covers and real covers the same wrapper, so they are the same size', async () => {
    const data = await homeData();
    data.upNext[0].cover = 'data:image/png;base64,AAA';
    data.recent[0].cover = null;
    data.recent[1].title = 'A Very Long Title That Would Make A Placeholder Cover Wider Than The Others In Its Row';
    render(<MemoryRouter><HomeView data={data} act={act} /></MemoryRouter>);
    const wrappers = [...document.querySelectorAll('.shelfitem > a')].filter((a) => a.querySelector('.homecover'));
    expect(wrappers.length).toBeGreaterThanOrEqual(data.upNext.length + data.recent.length);
    expect(wrappers.every((a) => a.classList.contains('shelfcover'))).toBe(true); // the class the stylesheet gives full width
    expect(document.querySelectorAll('.shelfitem .homecover img.libimg').length).toBe(1);
    expect(document.querySelectorAll('.shelfitem .homecover .libgen').length).toBe(wrappers.length - 1);
  });
});

describe('Home: backup reminder', () => {
  it('reminds you when you have never backed up, or it has been two weeks', async () => {
    const data = await homeData();
    render(<MemoryRouter><HomeView data={data} act={act} /></MemoryRouter>);
    expect(screen.getByText('You have not made a backup yet').getAttribute('href')).toBe('/settings');
    cleanup();
    data.tidy.backup = { lastAt: '2026-09-20T10:00:00Z', days: 23 };
    render(<MemoryRouter><HomeView data={data} act={act} /></MemoryRouter>);
    expect(screen.getByText('Your last backup was 23 days ago')).toBeTruthy();
    cleanup();
    data.tidy.backup = { lastAt: '2026-10-12T10:00:00Z', days: 1 };
    render(<MemoryRouter><HomeView data={data} act={act} /></MemoryRouter>);
    expect(screen.queryByText(/backup/)).toBeNull();
  });
});

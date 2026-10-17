// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DbContext } from '../src/db/DbContext';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { createRead, updateRead } from '../src/repo/bookLog';
import { createBook } from '../src/repo/books';
import { saveGoal } from '../src/repo/goals';
import DashboardPage from '../src/pages/DashboardPage';

afterEach(cleanup);
let db: Db;
beforeEach(() => { db = migrateNodeDb(); });
const Y = new Date().getFullYear();
async function done(title: string, finish: string) {
  const b = await createBook(db, { title, authors: ['Ann'] });
  const r = await createRead(db, b, 'finished');
  await updateRead(db, r, { finish_date: finish });
}
const show = () => render(<DbContext.Provider value={db}><MemoryRouter><DashboardPage /></MemoryRouter></DbContext.Provider>);

describe('the Dashboard page', () => {
  it('has Monthly and Yearly tabs and a tab for each month', async () => {
    show();
    expect(screen.getByRole('tab', { name: 'Monthly' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Yearly' })).toBeTruthy();
    const months = within(screen.getByRole('tablist', { name: 'Month' })).getAllByRole('tab');
    expect(months).toHaveLength(12);
    expect(months[0].textContent).toContain('Jan');
    fireEvent.click(screen.getByRole('tab', { name: 'Yearly' }));
    expect(await screen.findByText(String(Y), { selector: 'h2' })).toBeTruthy();
    expect(screen.queryByRole('tablist', { name: 'Month' })).toBeNull();
  });
  it('shows a month: its books, and a goal bar split into earlier progress and this month', async () => {
    await done('Jan Book', `${Y}-01-10`); await done('Feb Book', `${Y}-02-10`); await done('March One', `${Y}-03-04`); await done('March Two', `${Y}-03-20`);
    await saveGoal(db, Y, { metric: 'books', target: 10, label: 'Ten books' });
    show();
    fireEvent.click(await screen.findByRole('tab', { name: /^Mar/ }));
    await screen.findByText(`MARCH ${Y}`);
    await waitFor(() => expect(screen.getAllByText('March One').length).toBeGreaterThan(0));
    const goal = screen.getByLabelText('Ten books');
    const bar = within(goal).getByRole('progressbar', { name: 'Ten books progress' });
    expect((bar.querySelector('.sb-before') as HTMLElement).style.width).toBe('20%');
    expect((bar.querySelector('.sb-month') as HTMLElement).style.width).toBe('20%');
    expect(goal.textContent).toContain('4 of 10 books');
    expect(goal.textContent).toContain('2 before');
    expect(goal.textContent).toContain('2 in March');
    fireEvent.click(screen.getByRole('tab', { name: /^Jan/ }));
    await screen.findByText(`JANUARY ${Y}`);
    await waitFor(() => expect(screen.getByLabelText('Ten books').textContent).toContain('1 in January'));
  });
});

describe('dashboard charts', () => {
  it('draws the page and star dot plots, every relationship type, and the two-lane sources chart with a legend', async () => {
    const b = await createBook(db, { title: 'Dotty', authors: ['Ann'] });
    const { updateBook } = await import('../src/repo/bookLog');
    await updateBook(db, b, { page_count: 114 });
    const r = await createRead(db, b, 'finished');
    await updateRead(db, r, { finish_date: `${Y}-03-04`, rating: 19, format: 'audio' });
    show();
    fireEvent.click(await screen.findByRole('tab', { name: /^Mar/ }));
    await screen.findByText(`MARCH ${Y}`);
    const pages = await screen.findByRole('img', { name: 'Books by page count' });
    await waitFor(() => expect(pages.querySelectorAll('circle')).toHaveLength(1));
    expect(pages.querySelector('title')?.textContent).toBe('110 to 119 pages: 1 book');
    const stars = screen.getByRole('img', { name: 'Books by star rating' });
    expect(stars.querySelector('title')?.textContent).toBe('4.75 stars: 1 book');
    for (const t of ['MM', 'FF', 'XX', 'MF', 'MX', 'FX', 'Other', 'Unknown']) expect(screen.getByLabelText(new RegExp(`^${t}: `))).toBeTruthy();
    expect(screen.getByLabelText('MM: 0')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Books by format' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Books by format and source' })).toBeTruthy();
    // the sources chart: a scale from 0 to 100 in tens, percentages on the bars and in the legend
    expect([...document.querySelectorAll('.scale .stick')].map((e) => e.textContent)).toEqual(['0', '10', '20', '30', '40', '50', '60', '70', '80', '90', '100']);
    expect(screen.getByRole('img', { name: 'Books by format' }).textContent).toBe('100%');
    const legend = screen.getAllByLabelText('Legend').find((l) => l.textContent?.includes('Audiobook'))!;
    expect(legend.textContent).toContain('Audiobook100%');
    expect(legend.textContent).toContain('No source100%');
    // page and star plots label the small steps as well as the big ones
    expect(pages.querySelectorAll('.tick-major').length).toBe(7);
    expect(pages.querySelectorAll('.tick-minor').length).toBeGreaterThan(50);
    expect([...stars.querySelectorAll('.tick-major')].map((e) => e.textContent)).toEqual(['0', '1', '2', '3', '4', '5']);
    expect([...stars.querySelectorAll('.tick-minor')].slice(0, 3).map((e) => e.textContent)).toEqual(['.25', '.5', '.75']);
    expect(Number(pages.querySelector('.tick-minor')!.getAttribute('font-size'))).toBeLessThan(Number(pages.querySelector('.tick-major')!.getAttribute('font-size')));
  });
});

describe('dashboard favorites', () => {
  it('says why a book is a favorite: the heart, the five stars, or both', async () => {
    const { updateBook } = await import('../src/repo/bookLog');
    const mk = async (title: string, rating: number | null, fav: boolean) => {
      const b = await createBook(db, { title, authors: ['Ann'] });
      if (fav) await updateBook(db, b, { is_favorite: 1 });
      const r = await createRead(db, b, 'finished');
      await updateRead(db, r, { finish_date: `${Y}-03-04`, rating });
    };
    await mk('Hearted', 12, true); await mk('Five Star', 20, false); await mk('Both', 20, true); await mk('Neither', 12, false);
    show();
    fireEvent.click(await screen.findByRole('tab', { name: /^Mar/ }));
    const card = (await screen.findByText('Favorites')).closest('.bcard') as HTMLElement;
    await within(card).findByText('Hearted');
    const row = (t: string) => within(card).getByText(t).closest('.favline') as HTMLElement;
    expect(row('Hearted').textContent).toContain('Favorite');
    expect(row('Hearted').textContent).not.toContain('5 stars');
    expect(row('Five Star').textContent).toContain('5 stars');
    expect(row('Five Star').textContent).not.toContain('Favorite');
    expect(row('Both').textContent).toContain('Favorite');
    expect(row('Both').textContent).toContain('5 stars');
    expect(within(card).queryByText('Neither')).toBeNull();
  });
});

describe('the yearly tab', () => {
  it('shows the year: month bars, goals split by month, and the shared cards', async () => {
    await done('Jan Book', `${Y}-01-10`); await done('March One', `${Y}-03-04`); await done('March Two', `${Y}-03-20`);
    await saveGoal(db, Y, { metric: 'books', target: 10, label: 'Ten books' });
    show();
    fireEvent.click(screen.getByRole('tab', { name: 'Yearly' }));
    await screen.findByText('Month by month');
    const bars = await screen.findByRole('img', { name: 'Books finished each month' });
    await waitFor(() => expect(bars.querySelectorAll('.mbn')[2].textContent).toBe('2'));
    expect(screen.getByText(/March \(2\)/)).toBeTruthy();
    const goal = await screen.findByLabelText('Ten books');
    const segs = [...goal.querySelectorAll('.sb-m')] as HTMLElement[];
    expect(segs.map((x) => x.style.width)).toEqual(['10%', '20%']);
    expect(goal.textContent).toContain('3 of 10 books');
    expect(screen.getByText('Streaks')).toBeTruthy();
    expect(screen.getByText('Page distribution')).toBeTruthy();
    expect(screen.getByText('Relationship makeup')).toBeTruthy();
  });
});

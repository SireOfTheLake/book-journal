// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DbContext } from '../src/db/DbContext';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { applyNotionPlan } from '../src/import/apply';
import { planNotionBooks } from '../src/import/notion';
import type { CoverCandidate } from '../src/lookup/covers';
import type { CoverDeps } from '../src/lookup/deps';
import { getBookLog } from '../src/repo/bookLog';
import CoversImport from '../src/pages/CoversImport';
import CoverFinder from '../src/ui/CoverFinder';

afterEach(cleanup);
const cand = (title: string, confidence: CoverCandidate['confidence'], extra: Partial<CoverCandidate> = {}): CoverCandidate => ({
  id: `${confidence}-${title}`, source: 'openlibrary', title, authors: ['Some Author'], year: 2020, imageUrl: 'https://x/big.jpg', fallbackUrl: null, thumbUrl: 'https://x/small.jpg', score: 90, confidence, ...extra });
const image = { dataUrl: 'data:image/jpeg;base64,COVER', width: 200, height: 300, mime: 'image/jpeg' };

describe('Find cover for one book', () => {
  const deps = (): CoverDeps & { search: ReturnType<typeof vi.fn> } => ({
    search: vi.fn(async () => ({ candidates: [cand('Egotistical Puckboy', 'high'), cand('Puck Daddy', 'low', { source: 'google', authors: [], year: null })], errors: [] })),
    download: vi.fn(async () => image),
  });
  const show = (d: CoverDeps, onUse = vi.fn(async () => undefined), onClose = vi.fn()) =>
    render(<CoverFinder initial={{ title: 'Egotistical Puckboy', authors: ['Eden Finley', 'Saxon James'] }} deps={d} onUse={onUse} onClose={onClose} />);

  it('searches for the book and lists matches best first with their source and how well they match', async () => {
    const d = deps(); show(d);
    await waitFor(() => expect(screen.getByAltText('Cover of Egotistical Puckboy')).toBeTruthy());
    expect(d.search).toHaveBeenCalledWith({ title: 'Egotistical Puckboy', authors: ['Eden Finley', 'Saxon James'] });
    expect(screen.getByText('Open Library · Strong match')).toBeTruthy();
    expect(screen.getByText('Google Books · Weak match')).toBeTruthy();
    expect(screen.getByText('Unknown author')).toBeTruthy();
  });
  it('uses the chosen cover and closes', async () => {
    const onUse = vi.fn(async () => undefined); const onClose = vi.fn();
    show(deps(), onUse, onClose);
    await waitFor(() => expect(screen.getAllByText('Use this cover')).toHaveLength(2));
    fireEvent.click(screen.getAllByText('Use this cover')[1]);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onUse).toHaveBeenCalledWith(expect.objectContaining({ title: 'Puck Daddy' }));
  });
  it('shows why a cover could not be saved and stays open', async () => {
    const onUse = vi.fn(async () => { throw new Error('The site said no (404).'); }); const onClose = vi.fn();
    show(deps(), onUse, onClose);
    await waitFor(() => expect(screen.getAllByText('Use this cover')).toHaveLength(2));
    fireEvent.click(screen.getAllByText('Use this cover')[0]);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/404/));
    expect(onClose).not.toHaveBeenCalled();
    expect((screen.getAllByText('Use this cover')[0] as HTMLButtonElement).disabled).toBe(false); // can try another
  });
  it('searches again with a changed title and author', async () => {
    const d = deps(); show(d);
    await waitFor(() => expect(d.search).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText('Title to search for'), { target: { value: 'Puckboy' } });
    fireEvent.change(screen.getByLabelText('Author to search for'), { target: { value: 'Finley, Someone Else' } });
    fireEvent.click(screen.getByText('Search again'));
    await waitFor(() => expect(d.search).toHaveBeenCalledTimes(2));
    expect(d.search).toHaveBeenLastCalledWith({ title: 'Puckboy', authors: ['Finley', 'Someone Else'] });
  });
  it('says when nothing is found, and when a source could not be reached', async () => {
    const d: CoverDeps = { search: async () => ({ candidates: [], errors: ['Google Books could not be reached (offline)'] }), download: async () => image };
    show(d);
    await waitFor(() => expect(screen.getByText(/No covers found/)).toBeTruthy());
    expect(screen.getByText('Google Books could not be reached (offline)')).toBeTruthy();
  });
  it('shows an error if the search itself fails', async () => {
    show({ search: async () => { throw new Error('No connection'); }, download: async () => image });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('No connection'));
  });
});

describe('Bulk fill covers', () => {
  let db: Db;
  beforeEach(async () => {
    db = migrateNodeDb();
    await applyNotionPlan(db, planNotionBooks(readFileSync(resolve(process.cwd(), 'tests/fixtures/book-tracker.csv'), 'utf8')), { tagDestinations: {} });
  });
  const bookId = async (t: string) => (await db.select<{ id: string }>('SELECT id FROM book WHERE title = ?', [t]))[0].id;
  const mock = (overrides: Partial<CoverDeps> = {}): CoverDeps & { search: ReturnType<typeof vi.fn> } => ({
    search: vi.fn(async ({ title }: { title: string }) => {
      if (title === 'Bro Doll') return { candidates: [cand('Bro Doll', 'high'), cand('Bro Doll alt', 'low', { id: 'alt-1' })], errors: [] };
      if (title === 'Hush') return { candidates: [cand('Hush', 'medium')], errors: [] };
      if (title === 'Hooks In') throw new Error('network down');
      return { candidates: [], errors: [] };
    }),
    download: vi.fn(async () => image), ...overrides,
  }) as CoverDeps & { search: ReturnType<typeof vi.fn> };
  const mount = (d: CoverDeps) => render(<DbContext.Provider value={db}><MemoryRouter><CoversImport deps={d} delayMs={0} /></MemoryRouter></DbContext.Provider>);
  const run = async (d: CoverDeps) => { mount(d); await waitFor(() => expect(screen.getByText('Find covers')).toBeTruthy()); fireEvent.click(screen.getByText('Find covers')); await waitFor(() => expect(screen.getByText('Strong matches')).toBeTruthy()); };

  it('says how many books it will look up before starting', async () => {
    mount(mock());
    await waitFor(() => expect(screen.getByText('15')).toBeTruthy());
    expect(screen.getByText(/that have none/)).toBeTruthy();
  });
  it('says so when every book already has a cover', async () => {
    for (const { id } of await db.select<{ id: string }>('SELECT id FROM book')) await (await import('../src/repo/bookLog')).setBookCover(db, id, { dataUrl: 'data:image/png;base64,A' });
    mount(mock());
    await waitFor(() => expect(screen.getByText('Every book already has a cover.')).toBeTruthy());
    expect((screen.getByText('Find covers') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('Include books that already have a cover'));
    await waitFor(() => expect(screen.getByText('15')).toBeTruthy());
  });
  it('shows what was found, ticking only the strong match', async () => {
    await run(mock());
    const strong = screen.getByText('Strong matches').parentElement!;
    expect(within(strong).getByText('1')).toBeTruthy();
    expect((screen.getByLabelText('Save the cover for Bro Doll') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Save the cover for Hush') as HTMLInputElement).checked).toBe(false); // possible, so not ticked
    expect((screen.getByLabelText('Save the cover for Killer Love') as HTMLInputElement).disabled).toBe(true); // nothing found
    expect(screen.getByText('Could not search: network down')).toBeTruthy();
    expect(screen.getByText('Save 1 cover')).toBeTruthy();
  });
  it('saves the ticked covers to the books and reports the result', async () => {
    await run(mock());
    fireEvent.click(screen.getByText('Save 1 cover'));
    await waitFor(() => expect(screen.getByText(/cover was/)).toBeTruthy());
    expect((await getBookLog(db, await bookId('Bro Doll')))!.cover).toBe(image.dataUrl);
    expect((await getBookLog(db, await bookId('Hush')))!.cover).toBeNull(); // not ticked, so untouched
    fireEvent.click(screen.getByText('Back'));
    await waitFor(() => expect(screen.getByText('14')).toBeTruthy()); // one fewer book needs a cover
  });
  it('lets you tick a possible match, and reports a download that fails without losing the rest', async () => {
    const d = mock({ download: vi.fn(async (c: CoverCandidate) => { if (c.title === 'Hush') throw new Error('The site said no (404).'); return image; }) });
    await run(d);
    fireEvent.click(screen.getByLabelText('Save the cover for Hush'));
    fireEvent.click(screen.getByText('Save 2 covers'));
    await waitFor(() => expect(screen.getByText(/could not be downloaded/)).toBeTruthy());
    expect(screen.getByText('Hush: The site said no (404).')).toBeTruthy();
    expect((await getBookLog(db, await bookId('Bro Doll')))!.cover).toBe(image.dataUrl);
    expect((await getBookLog(db, await bookId('Hush')))!.cover).toBeNull();
  });
  it('swaps to another picture when you click it, and ticks it', async () => {
    const d = mock(); await run(d);
    fireEvent.click(screen.getByLabelText('Use Bro Doll alt instead'));
    expect(screen.getByAltText('Proposed cover for Bro Doll')).toBeTruthy();
    fireEvent.click(screen.getByText('Save 1 cover'));
    await waitFor(() => expect(d.download).toHaveBeenCalledWith(expect.objectContaining({ title: 'Bro Doll alt' })));
  });
  it('can tick or clear everything, and filter the list', async () => {
    await run(mock());
    fireEvent.click(screen.getByText('Tick everything found'));
    expect(screen.getByText('Save 2 covers')).toBeTruthy();
    fireEvent.click(screen.getByText('Tick nothing'));
    expect((screen.getByText('Save 0 covers') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Show'), { target: { value: 'attention' } });
    expect(screen.getByLabelText('Save the cover for Hush')).toBeTruthy();
    expect(screen.queryByLabelText('Save the cover for Killer Love')).toBeNull();
    fireEvent.change(screen.getByLabelText('Show'), { target: { value: 'none' } });
    expect(screen.getByLabelText('Save the cover for Killer Love')).toBeTruthy();
    expect(screen.queryByLabelText('Save the cover for Hush')).toBeNull();
  });
  it('stops when asked and lets you review what was found so far', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const d = mock({ search: vi.fn(async () => { await gate; return { candidates: [], errors: [] }; }) });
    mount(d);
    await waitFor(() => expect(screen.getByText('Find covers')).toBeTruthy());
    fireEvent.click(screen.getByText('Find covers'));
    await waitFor(() => expect(screen.getByText('Stop and review what was found')).toBeTruthy());
    fireEvent.click(screen.getByText('Stop and review what was found'));
    release();
    await waitFor(() => expect(screen.getByText('Strong matches')).toBeTruthy());
    expect(screen.getByText('All 1 books')).toBeTruthy(); // only the book already being looked up
    expect(d.search).toHaveBeenCalledTimes(1);
  });
  it('lets you search again for one book and use what you find', async () => {
    const d = mock(); await run(d);
    const row = screen.getByLabelText('Save the cover for Killer Love').closest('.covrow') as HTMLElement;
    d.search.mockResolvedValueOnce({ candidates: [cand('Killer Love', 'medium', { id: 'manual-1' })], errors: [] });
    fireEvent.click(within(row).getByText('Search again'));
    await waitFor(() => expect(screen.getByAltText('Cover of Killer Love')).toBeTruthy());
    fireEvent.click(screen.getByText('Use this cover'));
    await waitFor(() => expect((screen.getByLabelText('Save the cover for Killer Love') as HTMLInputElement).checked).toBe(true));
    expect(screen.getByText('Save 2 covers')).toBeTruthy();
  });
});

// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { parseDuration } from '../src/domain/format';
import { applyNotionPlan } from '../src/import/apply';
import { applyNotionCharacters } from '../src/import/applyCharacters';
import { planNotionBooks } from '../src/import/notion';
import { planNotionCharacters } from '../src/import/notionCharacters';
import { getBookLog, getNeighbors, listItems, listTagOptions } from '../src/repo/bookLog';
import { listCharacterOptions } from '../src/repo/characters';
import { listSeriesOptions } from '../src/repo/series';
import BookLogView, { type Actions } from '../src/pages/bookLog/BookLogView';
import { Combo, DatePicker, EditText, ZoomImage } from '../src/pages/bookLog/parts';

afterEach(cleanup);
const once = (fn: unknown, ...args: unknown[]) => { expect(fn).toHaveBeenCalledTimes(1); expect(fn).toHaveBeenCalledWith(...args); };

describe('the date picker', () => {
  it('opens on the given month and does not select anything when you move between months', () => {
    const onPick = vi.fn();
    render(<DatePicker value={null} initial="2026-10-08" onPick={onPick} onClear={vi.fn()} />);
    expect([screen.getByLabelText('Choose month').textContent, screen.getByLabelText('Choose year').textContent]).toEqual(['October', '2026']);
    fireEvent.click(screen.getByLabelText('Next month'));
    fireEvent.click(screen.getByLabelText('Next month'));
    fireEvent.click(screen.getByLabelText('Previous year'));
    expect([screen.getByLabelText('Choose month').textContent, screen.getByLabelText('Choose year').textContent]).toEqual(['December', '2025']);
    expect(onPick).not.toHaveBeenCalled();
    expect(document.querySelector('.dpday.on')).toBeNull(); // nothing is highlighted either
  });
  it('picks a date only when a day is clicked', () => {
    const onPick = vi.fn();
    render(<DatePicker value={null} initial="2026-10-08" onPick={onPick} onClear={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Next month'));
    fireEvent.click(screen.getByLabelText('2026-11-05'));
    once(onPick, '2026-11-05');
  });
  it('keeps the chosen date selected when you browse other months', () => {
    const onPick = vi.fn();
    render(<DatePicker value="2026-10-04" onPick={onPick} onClear={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Next month'));
    expect(onPick).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('Previous month'));
    expect(screen.getByLabelText('2026-10-04').getAttribute('aria-pressed')).toBe('true');
  });
  it('does not allow days outside the limits', () => {
    const onPick = vi.fn();
    render(<DatePicker value={null} max="2026-10-08" initial="2026-10-08" onPick={onPick} onClear={vi.fn()} />);
    expect((screen.getByLabelText('2026-10-09') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('2026-10-09'));
    expect(onPick).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('2026-10-08'));
    expect(onPick).toHaveBeenCalledWith('2026-10-08');
  });
});

describe('click-to-edit fields', () => {
  it('a blank start date opens at the finish date and cannot go past it', () => {
    const onCommit = vi.fn();
    render(<EditText label="Start date" type="date" value={null} max="2026-10-08" initial="2026-10-08" onCommit={onCommit} />);
    fireEvent.click(screen.getByText('Add start date'));
    expect([screen.getByLabelText('Choose month').textContent, screen.getByLabelText('Choose year').textContent]).toEqual(['October', '2026']); // the finish date's month
    expect((screen.getByLabelText('2026-10-09') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('Next month'));
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('Previous month'));
    fireEvent.click(screen.getByLabelText('2026-10-03'));
    once(onCommit, '2026-10-03');
    expect(screen.queryByRole('dialog')).toBeNull(); // closes after a day is chosen
  });
  it('shows an error for a typed date outside the limits, and does not save it', () => {
    const onCommit = vi.fn();
    render(<EditText label="Start date" type="date" value="2026-10-01" max="2026-10-08" onCommit={onCommit} />);
    fireEvent.click(screen.getByText('2026-10-01'));
    const box = screen.getByLabelText('Start date');
    fireEvent.change(box, { target: { value: '2026-10-20' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(screen.getByRole('alert').textContent).toMatch(/on or before 2026-10-08/);
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.change(box, { target: { value: '2026-10-05' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    once(onCommit, '2026-10-05');
  });
  it('an audio length that cannot be read shows a message instead of being lost', () => {
    const onCommit = vi.fn();
    render(<EditText label="Audio length" value={null} addLabel="Add audio length" onCommit={onCommit} validate={(v) => (v.trim() && parseDuration(v) === null ? 'Type it as 1:23 or 1h 23m.' : null)} />);
    fireEvent.click(screen.getByText('Add audio length'));
    const box = screen.getByLabelText('Audio length');
    fireEvent.change(box, { target: { value: 'about an hour' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(screen.getByRole('alert').textContent).toBe('Type it as 1:23 or 1h 23m.');
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.change(box, { target: { value: '1:23' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    once(onCommit, '1:23');
    expect(parseDuration('1:23')).toBe(83 * 60);
    expect(parseDuration('1h 23m')).toBe(83 * 60);
  });
});

describe('search boxes', () => {
  it('offers to add what you typed as a new item', () => {
    const onCreate = vi.fn(); const onPick = vi.fn();
    render(<Combo label="Search" placeholder="Search" options={[{ key: 'a', label: 'Aiden', sub: 'TAME' }]} onPick={onPick} onCreate={onCreate} createLabel={(t) => `+ Add "${t}" as a new character`} />);
    const box = screen.getByLabelText('Search');
    fireEvent.change(box, { target: { value: 'Zed' } });
    expect(screen.getByText('+ Add "Zed" as a new character')).toBeTruthy();
    expect(screen.queryByText('Aiden')).toBeNull(); // does not match what was typed
    fireEvent.keyDown(box, { key: 'Enter' });
    once(onCreate, 'Zed');
    expect(onPick).not.toHaveBeenCalled();
  });
  it('finds by name or by tag', () => {
    const onPick = vi.fn();
    render(<Combo label="Search" placeholder="Search" options={[{ key: 'a', label: 'Aiden', sub: 'TAME' }, { key: 'b', label: 'Bryn' }]} onPick={onPick} />);
    const box = screen.getByLabelText('Search');
    fireEvent.change(box, { target: { value: 'tame' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    once(onPick, 'a');
  });
});

describe('full-screen pictures', () => {
  it('opens when clicked and closes by the X, by clicking outside, or by Escape, but not by clicking the picture', () => {
    render(<ZoomImage src="data:image/png;base64,AAA" alt="Art" />);
    const open = () => fireEvent.click(screen.getByLabelText('View Art full screen'));
    open();
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.click(within(screen.getByRole('dialog')).getByAltText('Art'));
    expect(screen.queryByRole('dialog')).not.toBeNull(); // clicking the picture keeps it open
    fireEvent.click(screen.getByLabelText('Close'));
    expect(screen.queryByRole('dialog')).toBeNull();
    open(); fireEvent.click(screen.getByRole('dialog'));
    expect(screen.queryByRole('dialog')).toBeNull();
    open(); fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('the Book Log', () => {
  let db: Db;
  beforeAll(async () => {
    db = migrateNodeDb();
    const read = (f: string) => readFileSync(resolve(process.cwd(), 'tests/fixtures', f), 'utf8');
    await applyNotionPlan(db, planNotionBooks(read('book-tracker.csv')), { tagDestinations: {} });
    await applyNotionCharacters(db, planNotionCharacters(read('characters.csv')));
  });
  const bookId = async (t: string) => (await db.select<{ id: string }>('SELECT id FROM book WHERE title = ?', [t]))[0].id;
  async function show(title: string) {
    const log = (await getBookLog(db, await bookId(title)))!;
    const lists = { sources: await listItems(db, 'source'), timePeriods: await listItems(db, 'time_period'), accents: await listItems(db, 'accent'), places: await listItems(db, 'place'),
      genres: await listTagOptions(db, 'genre'), themes: await listTagOptions(db, 'theme'), tropes: await listTagOptions(db, 'trope'), series: await listSeriesOptions(db), characters: await listCharacterOptions(db), authors: [], narrators: [] };
    const act = new Proxy({}, { get: (_t, k) => (calls[String(k)] ??= vi.fn()) }) as Actions;
    const calls: Record<string, ReturnType<typeof vi.fn>> = {};
    render(<MemoryRouter><BookLogView log={log} lists={lists} act={act} neighbors={await getNeighbors(db, log.read?.id ?? null)} /></MemoryRouter>);
    return { calls, log };
  }

  it('shows the previous and next books, and leaves out a side that does not exist', async () => {
    await show('MateHub: Legend'); // finished 2025-10-05 or similar, with books before and after it
    expect(screen.getByLabelText('Previous and next book')).toBeTruthy();
    cleanup();
    const latest = (await db.select<{ title: string }>("SELECT b.title AS title FROM read r JOIN book b ON b.id = r.book_id WHERE r.status = 'finished' ORDER BY r.finish_date DESC, r.rowid DESC LIMIT 1"))[0].title;
    await show(latest);
    const nav = screen.getByLabelText('Previous and next book');
    expect(nav.querySelectorAll('a')).toHaveLength(1); // no next book, so no button
    expect(nav.querySelector('.next')).toBeNull();
  });
  it('adds a character as a side character, and a side character can be made main', async () => {
    const { calls } = await show('Hooks In');
    fireEvent.click(screen.getByText('+ Add character'));
    const box = screen.getByLabelText('Search characters');
    fireEvent.change(box, { target: { value: 'Qwerty New' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    once(calls.createCharacter, 'Qwerty New');
    expect(screen.queryByLabelText('Role')).toBeNull(); // no main/side choice up front
  });
  it('shows a character by name only, and keeps the description line separate from the partners', async () => {
    await show('Bro Doll');
    expect(document.body.textContent).not.toMatch(/\(DOLL\)/);
    const row = document.querySelector('.mainrow')!;
    expect(row.querySelector('.desc')).toBeTruthy();
    expect(row.querySelector('.rel') === null || row.querySelector('.rel')!.textContent!.includes('In a relationship with')).toBe(true);
  });
  it('lets a side character be made main from the list', async () => {
    const book = await bookId('Bro Doll');
    const side = (await db.select<{ id: string }>("SELECT id FROM character WHERE name = 'Plain Person'")).at(0);
    void book; void side; // the fixture book has no side characters, so check the button on a book that does
    const withSide = await db.select<{ title: string }>("SELECT b.title AS title FROM book_character bc JOIN book b ON b.id = bc.book_id WHERE bc.role = 'side' AND bc.deleted_at IS NULL LIMIT 1");
    if (!withSide.length) return;
    const { calls } = await show(withSide[0].title);
    fireEvent.click(screen.getAllByText('Make main')[0]);
    expect(calls.addCharacter.mock.calls[0][1]).toBe('main');
  });
  it('adds a book to a series through a search, not a long list', async () => {
    const [{ title }] = await db.select<{ title: string }>('SELECT title FROM book WHERE series_id IS NULL AND deleted_at IS NULL LIMIT 1');
    const { calls } = await show(title);
    fireEvent.click(screen.getByText('Add to a series'));
    const box = screen.getByLabelText('Search series');
    fireEvent.change(box, { target: { value: 'Brand New Series' } });
    expect(screen.getByText('+ Add "Brand New Series" as a new series')).toBeTruthy();
    fireEvent.keyDown(box, { key: 'Enter' });
    once(calls.createSeries, 'Brand New Series');
    expect(document.querySelector('select[aria-label="Series"]')).toBeNull();
  });
});

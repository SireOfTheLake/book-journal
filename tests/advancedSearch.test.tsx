// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DbContext } from '../src/db/DbContext';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { emptyAdvanced, newCondition, runAdvanced, type Advanced, type BookFacts, type Condition } from '../src/domain/advancedSearch';
import { createBook } from '../src/repo/books';
import { createCharacter } from '../src/repo/characters';
import { listBookFacts } from '../src/repo/search';
import { listLibrary } from '../src/repo/library';
import { listShelf } from '../src/repo/shelf';
import { createSeries } from '../src/repo/series';
import { newId } from '../src/domain/ids';
import LibraryView from '../src/pages/LibraryView';
import ShelfView from '../src/pages/ShelfView';

afterEach(cleanup);

const facts = (o: Partial<BookFacts> & { id: string; title: string }): BookFacts => ({ authors: [], characters: [], narrators: [], series: null, position: null, genres: [], tropes: [], themes: [], pages: null, rating: null, ...o });
const cond = (field: Condition['field'], op: Condition['op'], value: string, id = 1): Condition => ({ ...newCondition(id, field), op, value });
const adv = (conds: Condition[], extra: Partial<Advanced> = {}): Advanced => ({ ...emptyAdvanced(), conds, ...extra });

const LIB: BookFacts[] = [
  facts({ id: 'a', title: 'Bad Boy Rules', authors: ['Greta Lane'], characters: ['Hazard Quinn'], series: 'Hard Hits', pages: 310 }),
  facts({ id: 'b', title: 'Boy Meets Trouble', authors: ['Gregory Moon', 'Ann Lee'], characters: ['Nick Hazardous'], series: 'Criminal Intentions', pages: 280 }),
  facts({ id: 'c', title: 'Lost Boy', authors: ['Greer Hale'], characters: ['Hazard Finch'], pages: 150 }),
  facts({ id: 'd', title: 'Boyfriend Material', authors: ['Alexis Hall'], characters: ['Hazard Wren'], pages: 90 }),
  facts({ id: 'e', title: 'Quiet Girl', authors: ['Greta Quill'], characters: ['Hazard Sloane'], pages: 200 }),
];

describe('advanced search rules', () => {
  it('finds the example: Boy in the title, author starting Gre, a character with Hazard, not in Criminal Intentions, by pages ascending', () => {
    const a = adv([cond('title', 'contains', 'boy', 1), cond('author', 'starts', 'Gre', 2), cond('character', 'contains', 'hazard', 3), cond('series', 'is_not', 'Criminal Intentions', 4)], { sort: 'pages' });
    expect(runAdvanced(LIB, a)).toEqual(['c', 'a']); // 150 pages then 310; b is in the series, d is not by a Gre author, e has no Boy
  });
  it('matches any author of a book, and "does not contain" needs none of them to', () => {
    expect(runAdvanced(LIB, adv([cond('author', 'starts', 'ann')]))).toEqual(['b']);
    expect(runAdvanced(LIB, adv([cond('author', 'not_contains', 'greg')])).includes('b')).toBe(false);
  });
  it('lets a book with no series pass "series is not"', () => {
    expect(runAdvanced(LIB, adv([cond('series', 'is_not', 'Hard Hits')]))).toEqual(['b', 'c', 'd', 'e']);
  });
  it('joins with any, ignores empty rows, and sorts descending with empty values last', () => {
    expect(runAdvanced(LIB, adv([cond('title', 'contains', 'lost'), cond('title', 'contains', 'quiet', 2), cond('author', 'contains', '', 3)], { match: 'any' }))).toEqual(['c', 'e']);
    const withGap = [...LIB, facts({ id: 'f', title: 'No Pages' })];
    expect(runAdvanced(withGap, adv([], { sort: 'pages', desc: true }))).toEqual(['a', 'b', 'e', 'c', 'd', 'f']);
    expect(runAdvanced(withGap, adv([], { sort: 'pages' }))).toEqual(['d', 'c', 'e', 'b', 'a', 'f']);
  });
  it('compares numbers, and ignores accents and case', () => {
    expect(runAdvanced(LIB, adv([cond('pages', 'lte', '150')]))).toEqual(['c', 'd']);
    expect(runAdvanced([facts({ id: 'x', title: 'Café Noir' })], adv([cond('title', 'contains', 'CAFE')]))).toEqual(['x']);
  });
});

let db: Db;
beforeEach(() => { db = migrateNodeDb(); });
async function seed() {
  const crim = await createSeries(db, 'Criminal Intentions');
  const mk = async (title: string, authors: string[], char: string | null, pages: number, extra: { seriesId?: string; shelf?: 'tbr' | 'up_next' } = {}) => {
    const id = await createBook(db, { title, authors, shelf: extra.shelf ?? 'tbr', seriesId: extra.seriesId ?? null, seriesPosition: extra.seriesId ? 1 : null });
    await db.execute('UPDATE book SET page_count = ? WHERE id = ?', [pages, id]);
    if (char) await db.execute('INSERT INTO book_character (id, book_id, character_id, role, sort_order) VALUES (?, ?, ?, ?, 0)', [newId(), id, await createCharacter(db, char), 'main']);
    return id;
  };
  await mk('Bad Boy Rules', ['Greta Lane'], 'Hazard Quinn', 310);
  await mk('Boy Meets Trouble', ['Gregory Moon'], 'Nick Hazardous', 280, { seriesId: crim });
  await mk('Lost Boy', ['Greer Hale'], 'Hazard Finch', 150, { shelf: 'up_next' });
  await mk('Quiet Girl', ['Greta Quill'], 'Hazard Sloane', 200);
}

describe('advanced search in the app', () => {
  it('reads the facts of every book from the database', async () => {
    await seed();
    const f = (await listBookFacts(db)).find((x) => x.title === 'Boy Meets Trouble')!;
    expect(f).toMatchObject({ authors: ['Gregory Moon'], characters: ['Nick Hazardous'], series: 'Criminal Intentions', pages: 280 });
  });

  async function fillExample() {
    fireEvent.click(screen.getByText('Advanced search'));
    await screen.findByLabelText('Advanced search');
    const set = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
    const addRow = () => fireEvent.click(screen.getByText('+ Add a condition'));
    set('Condition 1 value', 'Boy');
    addRow(); set('Condition 2 field', 'author'); set('Condition 2 operator', 'starts'); set('Condition 2 value', 'Gre');
    addRow(); set('Condition 3 field', 'character'); set('Condition 3 value', 'Hazard');
    addRow(); set('Condition 4 field', 'series'); set('Condition 4 operator', 'is_not'); set('Condition 4 value', 'Criminal Intentions');
    set('Advanced sort', 'pages');
  }

  it('filters All Books with several terms and sorts by pages', async () => {
    await seed();
    render(<DbContext.Provider value={db}><MemoryRouter><LibraryView books={await listLibrary(db)} covers={{}} requestCovers={vi.fn()} act={{ addBook: vi.fn() }} /></MemoryRouter></DbContext.Provider>);
    expect(document.querySelectorAll('.libcard')).toHaveLength(4);
    await fillExample();
    await waitFor(() => expect(document.querySelectorAll('.libcard')).toHaveLength(2));
    expect([...document.querySelectorAll('.libtitle')].map((e) => e.textContent)).toEqual(['Lost Boy', 'Bad Boy Rules']);
    fireEvent.click(screen.getByText('High to low'));
    await waitFor(() => expect([...document.querySelectorAll('.libtitle')].map((e) => e.textContent)).toEqual(['Bad Boy Rules', 'Lost Boy']));
    fireEvent.click(screen.getByText('Clear'));
    await waitFor(() => expect(document.querySelectorAll('.libcard')).toHaveLength(4));
  });

  it('filters TBR & Up Next the same way', async () => {
    await seed();
    render(<DbContext.Provider value={db}><MemoryRouter><ShelfView books={await listShelf(db)} covers={{}} requestCovers={vi.fn()} act={{ start: vi.fn(), move: vi.fn(), toShelf: vi.fn(), remove: vi.fn(), add: vi.fn() }} /></MemoryRouter></DbContext.Provider>);
    await fillExample();
    await waitFor(() => expect(document.querySelectorAll('.shelfrow')).toHaveLength(2));
    const up = within(screen.getByLabelText('Up Next')), tbr = within(screen.getByLabelText('TBR'));
    expect(up.getByText('Lost Boy')).toBeTruthy();
    expect(tbr.getByText('Bad Boy Rules')).toBeTruthy();
    expect(screen.queryByText('Boy Meets Trouble')).toBeNull();
  });

  it('opens already filled in when it arrives from the quick search', async () => {
    await seed();
    const start = { ...emptyAdvanced(), conds: [{ ...newCondition(1), value: 'quiet' }] };
    render(<DbContext.Provider value={db}><MemoryRouter><LibraryView books={await listLibrary(db)} covers={{}} requestCovers={vi.fn()} act={{ addBook: vi.fn() }} initialAdvanced={start} /></MemoryRouter></DbContext.Provider>);
    await waitFor(() => expect(document.querySelectorAll('.libcard')).toHaveLength(1));
    expect((screen.getByLabelText('Condition 1 value') as HTMLInputElement).value).toBe('quiet');
  });
});

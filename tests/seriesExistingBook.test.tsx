// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SeriesView, { nextPosition } from '../src/pages/series/SeriesView';
import type { SeriesPage } from '../src/repo/series';

afterEach(cleanup);
const noop = () => undefined;
const book = (id: string, title: string, position: number | null) => ({ id, title, position, shelf: null, state: 'read', authors: null, finish_date: null, format: null, rating: null, tropes: null, read_id: null, releases: [], status: null, cover: null });
const page = { series: { id: 's', title: 'Hooks', total_books: null, publication_status: 'incomplete', interconnected_standalones: 0, notes: null, is_favorite: 0, flagged: 0 }, universe: null, authors: [], genres: [], books: [book('b1', 'One', 1), book('b2', 'Two', 2), book('b25', 'Half', 2.5)], read: 0, total: 2, allBooks: 3, novellas: 1, avgStars: null, ratedBooks: 0, status: 'not_started' } as unknown as SeriesPage;

function show(addExistingBook = vi.fn()) {
  const lists = { universes: [], genres: [], authors: [], books: [{ id: 'x1', name: 'Hooks In', authors: 'Eden' }, { id: 'x2', name: 'Hooks Out', authors: 'Eden' }] } as never;
  const act = { update: noop, createUniverse: noop, addGenre: noop, removeGenre: noop, renameGenre: noop, addBook: noop, setRelease: noop, markReleased: noop, addExistingBook, setBookStatus: noop, setPosition: noop, addAuthor: noop, createAuthor: noop, removeAuthor: noop } as never;
  render(<MemoryRouter><SeriesView page={page} lists={lists} act={act} /></MemoryRouter>);
  return addExistingBook;
}
const pos = () => screen.getAllByLabelText('Position in the series') as HTMLInputElement[];

describe('Add a book you already have', () => {
  it('works out the next whole position', () => {
    expect(nextPosition([])).toBe(1);
    expect(nextPosition([1, 2, 2.5, null])).toBe(3);
    expect(nextPosition([0.5])).toBe(1);
  });
  it('opens a row with the next position filled in, and typing in the position keeps it open', async () => {
    show();
    fireEvent.click(screen.getByText('+ Add a book you already have'));
    expect(pos()).toHaveLength(1);
    expect(pos()[0].value).toBe('3');
    fireEvent.focus(pos()[0]); fireEvent.blur(screen.getByLabelText('Search your books')); // the old bug: leaving the search closed everything
    fireEvent.change(pos()[0], { target: { value: '7' } });
    await new Promise((r) => setTimeout(r, 200));
    expect(pos()[0].value).toBe('7');
    expect(screen.getByLabelText('Search your books')).toBeTruthy();
  });
  it('adds the chosen book at that position, and a second click opens another row', async () => {
    const add = show();
    const open = () => fireEvent.click(screen.getByText('+ Add a book you already have'));
    open(); open();
    expect(pos().map((p) => p.value)).toEqual(['3', '4']);
    const boxes = screen.getAllByLabelText('Search your books');
    fireEvent.change(boxes[0], { target: { value: 'hooks in' } });
    fireEvent.keyDown(boxes[0], { key: 'Enter' });
    expect(add).toHaveBeenCalledWith('x1', 3);
    await waitFor(() => expect(pos()).toHaveLength(1)); // that row is done, the other is still there
    expect(pos()[0].value).toBe('4');
  });
  it('closes a row with the x', () => {
    show();
    fireEvent.click(screen.getByText('+ Add a book you already have'));
    fireEvent.click(screen.getByLabelText('Close this row'));
    expect(screen.queryByLabelText('Position in the series')).toBeNull();
  });
});

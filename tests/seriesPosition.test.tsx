// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import SeriesView from '../src/pages/series/SeriesView';
import { migrateNodeDb } from '../src/db/nodeDb';
import { createSeries, getSeriesPage, addBookToSeries } from '../src/repo/series';

describe('series position circle', () => {
  it('shows ? when unset and saves a typed position', async () => {
    const db = migrateNodeDb();
    const id = await createSeries(db, 'Puckboys');
    await addBookToSeries(db, id, 'First');
    const page = (await getSeriesPage(db, id))!;
    const setPosition = vi.fn();
    const noop = () => undefined;
    const act = new Proxy({ setPosition }, { get: (t: Record<string, unknown>, k: string) => t[k] ?? noop });
    render(<MemoryRouter><SeriesView page={page} lists={{ universes: [], genres: [], books: [], authors: [] }} act={act as never} /></MemoryRouter>);
    const btn = screen.getAllByRole('button', { name: /series position of First|Change series position of First/ })[0];
    fireEvent.click(btn);
    const input = screen.getByLabelText('Series position');
    fireEvent.change(input, { target: { value: '2.5' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(setPosition).toHaveBeenCalledWith(expect.any(String), 2.5);
  });
});

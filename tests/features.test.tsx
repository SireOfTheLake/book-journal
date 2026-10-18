// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { DbContext } from '../src/db/DbContext';
import { migrateNodeDb } from '../src/db/nodeDb';
import { FeaturesProvider } from '../src/features/FeaturesContext';
import { quickAdd, updateBook } from '../src/repo/bookLog';
import { getFeatures, setFeature } from '../src/repo/features';
import { addQuote, deleteQuote, listAllQuotes, listBookQuotes, setQuoteFavorite, updateQuote } from '../src/repo/quotes';
import { filterByOwnership, listShelf } from '../src/repo/shelf';
import FeaturesCard from '../src/pages/settings/FeaturesCard';
import QuotesCard from '../src/pages/bookLog/QuotesCard';
import QuotesPage from '../src/pages/QuotesPage';

let db: Db;
beforeEach(() => { db = migrateNodeDb(); });
afterEach(cleanup);
const book = async (t: string, status: 'tbr' | 'up_next' = 'tbr') => (await quickAdd(db, { title: t, authors: ['A'], status })).bookId;

describe('feature switches', () => {
  it('start on, can be turned off, and keep their data', async () => {
    expect(await getFeatures(db)).toEqual({ quotes: true, owned: true });
    const b = await book('One');
    await addQuote(db, b, { text: 'Hello' });
    await setFeature(db, 'quotes', false);
    expect((await getFeatures(db)).quotes).toBe(false);
    expect(await listBookQuotes(db, b)).toHaveLength(1);
    await setFeature(db, 'quotes', true);
    expect((await getFeatures(db)).quotes).toBe(true);
  });

  it('the Features card saves a switch and the Quotes page then says it is off', async () => {
    render(<MemoryRouter><DbContext.Provider value={db}><FeaturesProvider><FeaturesCard /><QuotesPage /></FeaturesProvider></DbContext.Provider></MemoryRouter>);
    const sw = await screen.findByRole('switch', { name: 'Quotes and favorite passages' });
    expect((sw as HTMLInputElement).checked).toBe(true);
    fireEvent.click(sw);
    await waitFor(() => expect(screen.getByText(/Quotes are switched off/)).toBeTruthy());
    expect((await getFeatures(db)).quotes).toBe(false);
  });
});

describe('quotes', () => {
  it('adds, edits, favorites and deletes', async () => {
    const b = await book('One');
    const id = await addQuote(db, b, { text: ' A line ', page: 12, note: 'nice' });
    await addQuote(db, b, { text: 'Heard', audio_seconds: 3723 });
    await expect(addQuote(db, b, { text: '  ' })).rejects.toThrow();
    await updateQuote(db, id, { text: 'A better line', page: 13 });
    await setQuoteFavorite(db, id, true);
    const all = await listAllQuotes(db);
    expect(all.map((q) => q.text).sort()).toEqual(['A better line', 'Heard']);
    expect((await listBookQuotes(db, b))[0]).toMatchObject({ text: 'A better line', page: 13, is_favorite: 1, note: null });
    await deleteQuote(db, id);
    expect(await listBookQuotes(db, b)).toHaveLength(1);
  });

  it('the card adds a quote with a page', async () => {
    const calls: unknown[] = [];
    render(<MemoryRouter><QuotesCard quotes={[]} act={{ add: async (i) => { calls.push(i); }, update: async () => undefined, favorite: () => undefined, remove: () => undefined }} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: '+ Add a quote' }));
    fireEvent.change(screen.getByLabelText('Passage'), { target: { value: 'To be' } });
    fireEvent.change(screen.getByLabelText('Page'), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText('Audio time'), { target: { value: '1:05' } });
    fireEvent.click(within(document.body).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(calls).toEqual([{ text: 'To be', page: 7, audio_seconds: expect.any(Number), note: '' }]));
  });
});

describe('owned vs wanted', () => {
  it('filters the shelf by what you own, per format', async () => {
    const a = await book('Has paper'), b = await book('Has audio'), c = await book('Nothing', 'up_next');
    await updateBook(db, a, { own_physical: 1 }); await updateBook(db, b, { own_audio: 1, own_ebook: 1 });
    const shelf = await listShelf(db);
    const names = (xs: { title: string }[]) => xs.map((x) => x.title).sort();
    expect(names(filterByOwnership(shelf, 'own', 'any'))).toEqual(['Has audio', 'Has paper']);
    expect(names(filterByOwnership(shelf, 'want', 'any'))).toEqual(['Nothing']);
    expect(names(filterByOwnership(shelf, 'own', 'audio'))).toEqual(['Has audio']);
    expect(names(filterByOwnership(shelf, 'want', 'audio'))).toEqual(['Has paper', 'Nothing']);
    expect(names(filterByOwnership(shelf, 'all', 'audio'))).toHaveLength(3);
    expect(c).toBeTruthy();
  });
});

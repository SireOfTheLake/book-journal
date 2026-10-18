// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DbContext } from '../src/db/DbContext';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { createBook } from '../src/repo/books';
import { addTag, createRead, getBookLog } from '../src/repo/bookLog';
import { listPlaces } from '../src/repo/places';
import BookLogPage from '../src/pages/BookLogPage';
import HomePage from '../src/pages/HomePage';
import LocationsPage from '../src/pages/LocationsPage';

afterEach(cleanup);
let db: Db; let book: string; let rid: string;
beforeEach(async () => { db = migrateNodeDb(); book = await createBook(db, { title: 'Spooky' }); rid = await createRead(db, book, 'finished'); });
const show = (path: string) => render(<DbContext.Provider value={db}><MemoryRouter initialEntries={[path]}><Routes>
  <Route path="book/:bookId/:readId" element={<BookLogPage />} /><Route path="locations" element={<LocationsPage />} /><Route path="/" element={<HomePage />} /></Routes></MemoryRouter></DbContext.Provider>);
const settingCard = async () => (await screen.findByText('Setting')).closest('.bcard') as HTMLElement;

async function openNew() {
  fireEvent.click(await screen.findByRole('button', { name: '+ add' }));
  const box = await screen.findByLabelText('Search locations');
  fireEvent.focus(box);
  fireEvent.mouseDown(await screen.findByRole('option', { name: '+ New location...' }));
}

describe('the Setting card', () => {
  it('shows a warning on a plain-text location and sorts it out in the dialog', async () => {
    await addTag(db, book, 'place', 'Hogwarts');
    show(`/book/${book}/${rid}`);
    const card = await settingCard();
    expect(within(card).getByLabelText('Needs updating')).toBeTruthy();
    expect(within(card).getByRole('note').textContent).toMatch(/Hogwarts still needs updating/);
    fireEvent.click(within(card).getByRole('button', { name: 'Edit Hogwarts' }));
    const dlg = await screen.findByRole('dialog', { name: 'Edit location' });
    fireEvent.click(within(dlg).getByLabelText(/Fictional place/));
    fireEvent.change(within(dlg).getByLabelText('City'), { target: { value: 'Hogwarts' } });
    fireEvent.change(within(dlg).getByLabelText('Area'), { target: { value: 'Scottish Highlands' } });
    fireEvent.change(within(dlg).getByLabelText('Country'), { target: { value: 'United Kingdom' } });
    expect(within(dlg).getByText('Hogwarts, Scottish Highlands, United Kingdom')).toBeTruthy();
    fireEvent.click(within(dlg).getByRole('button', { name: 'Save location' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(async () => expect((await getBookLog(db, book))!.places[0]).toMatchObject({ name: 'Hogwarts, Scottish Highlands, United Kingdom', fictional: true, needsUpdate: false }));
    expect(within(await settingCard()).queryByLabelText('Needs updating')).toBeNull();
  });
  it('searches the countries (United States, Canada, United Kingdom first) and the areas of the chosen country', async () => {
    show(`/book/${book}/${rid}`);
    await openNew();
    const dlg = await screen.findByRole('dialog', { name: 'New location' });
    const country = within(dlg).getByLabelText('Country');
    fireEvent.focus(country);
    const first = within(await screen.findByRole('listbox', { name: 'Country suggestions' })).getAllByRole('option').map((o) => o.textContent);
    expect(first.slice(0, 3)).toEqual(['United States', 'Canada', 'United Kingdom']);
    fireEvent.change(country, { target: { value: 'unit' } });
    fireEvent.mouseDown(within(dlg).getByRole('option', { name: 'United States' }));
    expect((country as HTMLInputElement).value).toBe('United States');
    const area = within(dlg).getByLabelText('Area');
    fireEvent.focus(area);
    const states = within(await screen.findByRole('listbox', { name: 'Area suggestions' })).getAllByRole('option').map((o) => o.textContent);
    expect(states).toContain('Hawaii');
    fireEvent.change(area, { target: { value: 'wash' } });
    fireEvent.mouseDown(within(dlg).getByRole('option', { name: 'Washington' }));
    fireEvent.change(within(dlg).getByLabelText('City'), { target: { value: 'Seattle' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Save location' }));
    await waitFor(async () => expect((await getBookLog(db, book))!.places.map((p) => p.name)).toEqual(['Seattle, Washington, United States']));
  });
  it('lets any field take a new value of its own', async () => {
    show(`/book/${book}/${rid}`);
    await openNew();
    const dlg = await screen.findByRole('dialog', { name: 'New location' });
    fireEvent.change(within(dlg).getByLabelText('Country'), { target: { value: 'Elbonia' } });
    expect(within(dlg).getByRole('option', { name: /Add Elbonia as a new country/ })).toBeTruthy();
    fireEvent.change(within(dlg).getByLabelText('Area'), { target: { value: 'Zedland' } });
    fireEvent.change(within(dlg).getByLabelText('City'), { target: { value: 'Newtown' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Save location' }));
    await waitFor(async () => expect((await getBookLog(db, book))!.places.map((p) => p.name)).toEqual(['Newtown, Zedland, Elbonia']));
    // the new country is now suggested
    await openNew();
    const d2 = await screen.findByRole('dialog', { name: 'New location' });
    fireEvent.change(within(d2).getByLabelText('Country'), { target: { value: 'elb' } });
    await within(d2).findByRole('option', { name: 'Elbonia' });
  });
  it('lets the country be left out, and an area outside the country\'s list be kept as custom', async () => {
    show(`/book/${book}/${rid}`);
    await openNew();
    const dlg = await screen.findByRole('dialog', { name: 'New location' });
    fireEvent.change(within(dlg).getByLabelText('Area'), { target: { value: 'Tatooine' } });
    fireEvent.click(within(dlg).getByLabelText(/Fictional place/));
    fireEvent.click(within(dlg).getByRole('button', { name: 'Save location' }));
    await waitFor(async () => expect((await getBookLog(db, book))!.places[0]).toMatchObject({ name: 'Tatooine', fictional: true, country: null }));
    await openNew();
    const d2 = await screen.findByRole('dialog', { name: 'New location' });
    fireEvent.change(within(d2).getByLabelText('Country'), { target: { value: 'Canada' } });
    fireEvent.change(within(d2).getByLabelText('Area'), { target: { value: 'Dungeon Level 3' } });
    fireEvent.click(within(d2).getByRole('button', { name: 'Save location' }));
    await waitFor(async () => expect((await getBookLog(db, book))!.places.map((p) => p.name).sort()).toEqual(['Dungeon Level 3, Canada', 'Tatooine']));
  });
  it('asks what a typed, unknown name is, and puts it in that field', async () => {
    show(`/book/${book}/${rid}`);
    fireEvent.click(await screen.findByRole('button', { name: '+ add' }));
    const box = await screen.findByLabelText('Search locations');
    fireEvent.focus(box); fireEvent.change(box, { target: { value: 'Narnia' } });
    fireEvent.mouseDown(await screen.findByRole('option', { name: /New location "Narnia"/ }));
    const dlg = await screen.findByRole('dialog', { name: 'New location' });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Country' }));
    expect((within(dlg).getByLabelText('Country') as HTMLInputElement).value).toBe('Narnia');
    expect((within(dlg).getByLabelText('City') as HTMLInputElement).value).toBe('');
    fireEvent.click(within(dlg).getByRole('button', { name: 'Save location' }));
    await waitFor(async () => expect((await getBookLog(db, book))!.places[0]).toMatchObject({ name: 'Narnia', country: 'Narnia', city: null }));
  });
  it('picks an existing location from the search, and opens the dialog for a new typed one', async () => {
    await db.execute("INSERT INTO place (id, name, city, country, located) VALUES ('p1', 'Rome, Italy', 'Rome', 'Italy', 1)");
    show(`/book/${book}/${rid}`);
    fireEvent.click(await screen.findByRole('button', { name: '+ add' }));
    const box = await screen.findByLabelText('Search locations');
    fireEvent.focus(box); fireEvent.change(box, { target: { value: 'rom' } });
    fireEvent.mouseDown(await screen.findByRole('option', { name: /Rome, Italy/ }));
    await waitFor(async () => expect((await getBookLog(db, book))!.places.map((p) => p.name)).toEqual(['Rome, Italy']));
    fireEvent.click(await screen.findByRole('button', { name: '+ add' }));
    const b2 = await screen.findByLabelText('Search locations');
    fireEvent.focus(b2); fireEvent.change(b2, { target: { value: 'Lyon, France' } });
    fireEvent.mouseDown(await screen.findByRole('option', { name: /New location "Lyon, France"/ }));
    const dlg = await screen.findByRole('dialog', { name: 'New location' });
    expect((within(dlg).getByLabelText('City') as HTMLInputElement).value).toBe('Lyon');
    expect((within(dlg).getByLabelText('Country') as HTMLInputElement).value).toBe('France');
  });
});

describe('the Locations page and To Tidy', () => {
  it('lists the locations that need updating first, and the Home page counts them', async () => {
    await addTag(db, book, 'place', 'Hogwarts'); await addTag(db, book, 'place', 'Paris, France');
    show('/');
    const link = await screen.findByRole('link', { name: '1 location needs updating' });
    expect(link.getAttribute('href')).toBe('/locations?needs=1');
    cleanup();
    show('/locations');
    await screen.findByRole('heading', { name: /LOCATIONS/ });
    const rows = (await screen.findAllByRole('button', { name: /^Edit / })).map((b) => b.getAttribute('aria-label'));
    expect(rows).toEqual(['Edit Hogwarts', 'Edit Paris, France']);
  });
  it('edits a location for every book and clears its warning', async () => {
    await addTag(db, book, 'place', 'Hogwarts');
    show('/locations');
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Hogwarts' }));
    const dlg = await screen.findByRole('dialog', { name: 'Edit location' });
    expect(within(dlg).getByText(/everywhere it is used/)).toBeTruthy();
    fireEvent.click(within(dlg).getByLabelText(/Fictional place/));
    fireEvent.click(within(dlg).getByRole('button', { name: 'Save location' }));
    await waitFor(async () => expect((await listPlaces(db))[0].needsUpdate).toBe(false));
  });
});

describe('the Setting card has one plus button', () => {
  it('no longer shows separate Add location / New location buttons, and lists only sorted locations', async () => {
    await db.execute("INSERT INTO place (id, name, city, country, located) VALUES ('p9', 'Oslo, Norway', 'Oslo', 'Norway', 1)");
    await db.execute("INSERT INTO place (id, name, located) VALUES ('p8', 'Loose text', 0)");
    show(`/book/${book}/${rid}`);
    const plus = await screen.findByRole('button', { name: '+ add' });
    expect(screen.queryByRole('button', { name: 'New location...' })).toBeNull();
    expect(screen.queryByText('Add location')).toBeNull();
    fireEvent.click(plus);
    fireEvent.focus(await screen.findByLabelText('Search locations'));
    const names = within(await screen.findByRole('listbox')).getAllByRole('option').map((o) => o.textContent);
    expect(names).toContain('Oslo, Norway');
    expect(names).not.toContain('Loose text');
    expect(names[names.length - 1]).toBe('+ New location...');
  });
});

describe('deleting and purging on the locations page', () => {
  it('deletes a location from its edit window after confirming', async () => {
    await addTag(db, book, 'place', 'Old text place');
    show('/locations');
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Old text place' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete location' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Yes, delete it' }));
    await waitFor(async () => expect(await listPlaces(db)).toHaveLength(0));
  });
  it('purges flagged locations that have no books after asking', async () => {
    await db.execute("INSERT INTO place (id, name, located) VALUES ('p1', 'Vague', 0)");
    show('/locations');
    fireEvent.click(await screen.findByRole('button', { name: 'Purge unused locations' }));
    expect(await screen.findByText(/Delete 1 location that need updating and have no books/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, purge them' }));
    await screen.findByText('Purged 1 location.');
    expect(await listPlaces(db)).toHaveLength(0);
  });
});

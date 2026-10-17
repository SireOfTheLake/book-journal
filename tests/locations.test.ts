import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { AREAS, canonicalArea, canonicalCountry, COUNTRIES, COUNTRIES_ORDERED, customNotes, parseLocationText, validateLocation } from '../src/domain/geo';
import { createBook } from '../src/repo/books';
import { addTag, getBookLog, removeTag } from '../src/repo/bookLog';
import { getHome } from '../src/repo/home';
import { addLocationToBook, countPlacesNeedingUpdate, findOrCreatePlace, listPlaceParts, listPlaces, normalizePlaces, savePlace } from '../src/repo/places';

let db: Db;
beforeEach(() => { db = migrateNodeDb(); });

describe('the lists', () => {
  it('has the area lists for the US, Canada, UK, Australia and Mexico', () => {
    expect(AREAS['United States'].list).toHaveLength(56); // 50 states, DC and 5 territories
    expect(AREAS.Canada.list).toHaveLength(13);
    expect(AREAS['United Kingdom'].list).toHaveLength(4);
    expect(AREAS.Australia.list).toHaveLength(8);
    expect(AREAS.Mexico.list).toHaveLength(32);
    expect(AREAS['United States'].list.map((a) => a.name)).toEqual(expect.arrayContaining(['Alaska', 'Hawaii']));
  });
  it('understands country names, nicknames and area abbreviations', () => {
    expect(canonicalCountry('usa')).toBe('United States');
    expect(canonicalCountry('U.S.A.')).toBe('United States');
    expect(canonicalCountry('UK')).toBe('United Kingdom');
    expect(canonicalCountry('Côte d’Ivoire')).toBe('Ivory Coast');
    expect(canonicalCountry('Narnia')).toBeNull();
    expect(canonicalArea('United States', 'wa')).toBe('Washington');
    expect(canonicalArea('Canada', 'B.C.')).toBe('British Columbia');
    expect(canonicalArea('Mexico', 'yucatán')).toBe('Yucatan');
  });
});

describe('reading old plain-text locations', () => {
  it('sorts the ones that are clear', () => {
    expect(parseLocationText('Paris, France')).toEqual({ city: 'Paris', area: null, country: 'France' });
    expect(parseLocationText('France')).toEqual({ city: null, area: null, country: 'France' });
    expect(parseLocationText('Seattle, WA')).toEqual({ city: 'Seattle', area: 'Washington', country: 'United States' });
    expect(parseLocationText('Vancouver, BC')).toEqual({ city: 'Vancouver', area: 'British Columbia', country: 'Canada' });
    expect(parseLocationText('Austin, Texas, USA')).toEqual({ city: 'Austin', area: 'Texas', country: 'United States' });
    expect(parseLocationText('Sydney, New South Wales, Australia')).toEqual({ city: 'Sydney', area: 'New South Wales', country: 'Australia' });
    expect(parseLocationText('Kyoto, Kansai, Japan')).toEqual({ city: 'Kyoto', area: 'Kansai', country: 'Japan' }); // a country without a list takes any area
    expect(parseLocationText('Perth, Western Australia')).toEqual({ city: 'Perth', area: 'Western Australia', country: 'Australia' });
  });
  it('leaves the unclear ones alone', () => {
    for (const t of ['New York', 'Paris', 'Georgia', 'Atlanta, Georgia', 'Hogwarts', 'Tatooine, Outer Rim', 'Springfield, Narnia', 'A, B, C, D', 'Austin, Atlantis, USA', 'Texas, USA', '']) expect(parseLocationText(t)).toBeNull();
  });
});

describe('checking a location', () => {
  it('only refuses an empty one: every field accepts a custom value', () => {
    expect(validateLocation({})).toMatch(/Fill in/);
    expect(validateLocation({ city: 'Paris', country: 'France' })).toBeNull();
    expect(validateLocation({ country: 'Narnia' })).toBeNull();
    expect(validateLocation({ city: 'Dallas', area: 'Ontario', country: 'United States' })).toBeNull();
    expect(validateLocation({ area: 'Dune' })).toBeNull();
  });
  it('notes the values that are not on the lists', () => {
    expect(customNotes({ country: 'Narnia' }).country).toMatch(/custom country/);
    expect(customNotes({ area: 'Ontario', country: 'USA' }).area).toMatch(/not a state of United States/);
    expect(customNotes({ area: 'Texas', country: 'USA', city: 'x' })).toEqual({});
    expect(customNotes({ area: 'Anywhere', country: 'Japan' })).toEqual({});
  });
  it('puts the United States, Canada and the United Kingdom first in the country list', () => {
    expect(COUNTRIES_ORDERED.slice(0, 3)).toEqual(['United States', 'Canada', 'United Kingdom']);
    expect(COUNTRIES_ORDERED).toHaveLength(COUNTRIES.length);
    expect(new Set(COUNTRIES_ORDERED).size).toBe(COUNTRIES.length);
    expect(COUNTRIES_ORDERED[3]).toBe('Afghanistan');
  });
});

describe('saving locations', () => {
  it('writes the label and the parts the standard way', async () => {
    const id = await savePlace(db, null, { city: 'seattle', area: 'wa', country: 'usa' });
    const [p] = await listPlaces(db);
    expect(p).toMatchObject({ id, name: 'seattle, Washington, United States', city: 'seattle', area: 'Washington', country: 'United States', needsUpdate: false, fictional: false });
  });
  it('accepts a custom country, area or city, with or without a country', async () => {
    await savePlace(db, null, { city: 'Hogwarts', area: 'Scotland', country: 'United Kingdom', fictional: true });
    await savePlace(db, null, { area: 'Tatooine', fictional: true });
    await savePlace(db, null, { city: 'Newtown', area: 'Zed', country: 'Elbonia' });
    const rows = await listPlaces(db);
    expect(rows.map((r) => r.name).sort()).toEqual(['Hogwarts, Scotland, United Kingdom', 'Newtown, Zed, Elbonia', 'Tatooine']);
    expect(rows.find((r) => r.name === 'Tatooine')!.fictional).toBe(true);
    await expect(savePlace(db, null, { city: ' ' })).rejects.toThrow('Fill in');
    expect((await listPlaceParts(db)).countries).toEqual(expect.arrayContaining(['Elbonia', 'United Kingdom']));
  });
  it('reuses a location that already exists, and merges two that become the same', async () => {
    const a = await savePlace(db, null, { city: 'Paris', country: 'France' });
    expect(await savePlace(db, null, { city: 'paris', country: 'France' })).toBe(a);
    const book = await createBook(db, { title: 'B' });
    const plain = await findOrCreatePlace(db, 'Paris (the old one)');
    await db.execute("INSERT INTO book_place (id, book_id, place_id) VALUES ('x', ?, ?)", [book, plain]);
    const kept = await savePlace(db, plain, { city: 'Paris', country: 'France' });
    expect(kept).toBe(a);
    expect((await getBookLog(db, book))!.places.map((p) => p.id)).toEqual([a]);
    expect((await listPlaces(db)).map((r) => r.id)).toEqual([a]);
  });
});

describe('plain text locations and the warning', () => {
  it('a typed tag that is clear is sorted at once; an unclear one is kept as it is with a warning', async () => {
    const book = await createBook(db, { title: 'B' });
    await addTag(db, book, 'place', 'Seattle, WA');
    await addTag(db, book, 'place', 'Hogwarts');
    const places = (await getBookLog(db, book))!.places;
    expect(places.map((p) => [p.name, p.needsUpdate])).toEqual([['Seattle, Washington, United States', false], ['Hogwarts', true]]);
    expect(await countPlacesNeedingUpdate(db)).toBe(1);
  });
  it('shows in To Tidy, and goes away when the tag is removed, fixed, or marked fictional', async () => {
    const book = await createBook(db, { title: 'B' });
    await addTag(db, book, 'place', 'Hogwarts');
    expect((await getHome(db, '2026-10-16')).tidy.locations).toBe(1);
    const [p] = await listPlaces(db);
    await removeTag(db, book, 'place', p.id);
    expect((await getHome(db, '2026-10-16')).tidy.locations).toBe(0);
    await addTag(db, book, 'place', 'Hogwarts');
    await savePlace(db, p.id, { city: 'Hogwarts', fictional: true });
    expect((await getHome(db, '2026-10-16')).tidy.locations).toBe(0);
    expect((await listPlaces(db))[0]).toMatchObject({ fictional: true, needsUpdate: false });
  });
  it('normalizing sorts what it can and flags the rest, and is safe to repeat', async () => {
    for (const n of ['Paris, France', 'Boston, MA', 'Middle Earth']) await db.execute("INSERT INTO place (id, name, located) VALUES (?, ?, 0)", [n, n]);
    expect(await normalizePlaces(db)).toEqual({ converted: 2, flagged: 1 });
    expect(await normalizePlaces(db)).toEqual({ converted: 0, flagged: 1 });
    const rows = await listPlaces(db);
    expect(rows.map((r) => [r.name, r.needsUpdate])).toEqual([['Middle Earth', true], ['Boston, Massachusetts, United States', false], ['Paris, France', false]]);
  });
  it('adds a location to a book once', async () => {
    const book = await createBook(db, { title: 'B' });
    await addLocationToBook(db, book, { city: 'Rome', country: 'Italy' });
    await addLocationToBook(db, book, { city: 'Rome', country: 'Italy' });
    expect((await getBookLog(db, book))!.places).toHaveLength(1);
  });
});

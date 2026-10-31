// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { DbContext } from '../src/db/DbContext';
import { migrateNodeDb } from '../src/db/nodeDb';
import { FeaturesProvider } from '../src/features/FeaturesContext';
import LayoutCard from '../src/pages/settings/LayoutCard';
import { addCard, CARD_DEFS, defaultLayout, missingCards, moveCard, normalizeLayout, removeCard, resizeCard, settle, solveRows, type BookLayout } from '../src/domain/bookLayout';
import { getLayout, resetLayout, saveLayout } from '../src/repo/bookLayout';
import { getFeatures } from '../src/repo/features';

afterEach(cleanup);
let db: Db;
beforeEach(() => { db = migrateNodeDb(); });
const at = (l: BookLayout, id: string) => l.cards.find((x) => x.id === id)!;
const overlap = (l: BookLayout) => l.cards.filter((a) => a.col > 0).some((a, i, all) => all.some((b, j) => j > i && a.col < b.col + b.w && b.col < a.col + a.w && a.row < b.row + b.h && b.row < a.row + a.h));
const ON = { quotes: true, owned: true, moodpace: false, warnings: false, whystopped: false, recommender: false };

describe('layout rules', () => {
  it('starts as the layout the Book Log has always had, with nothing overlapping and the cover column in order', () => {
    const l = normalizeLayout(null, ON);
    expect(overlap(l)).toBe(false);
    expect(l.cards.filter((x) => x.col === 0).sort((a, b) => a.row - b.row).map((x) => x.id)).toEqual(['status', 'rating', 'title', 'authors', 'owned']);
    expect(at(l, 'series')).toMatchObject({ col: 1, row: 0, w: 1, h: 2 });
    expect(at(l, 'setting')).toMatchObject({ col: 3, row: 4, h: 1 });
    expect(at(l, 'timeperiod')).toMatchObject({ col: 3, row: 5, h: 1 });
    expect(at(l, 'narrators')).toMatchObject({ col: 1, w: 3 });
  });
  it('makes room when a card is moved onto others, and never leaves a card half a column wide', () => {
    const l = moveCard(normalizeLayout(null, ON), 'heat', 1, 0);
    expect(at(l, 'heat')).toMatchObject({ col: 1, row: 0 });
    expect(overlap(l)).toBe(false);
    expect(at(l, 'series').row).toBeGreaterThan(0);
    expect(Number.isInteger(at(l, 'heat').w)).toBe(true);
  });
  it('resizes from 1 to 4 columns and half a square up, and stays inside the grid', () => {
    let l = resizeCard(normalizeLayout(null, ON), 'series', 4, 5);
    expect(at(l, 'series')).toMatchObject({ col: 1, w: 4, h: 5 });
    expect(overlap(l)).toBe(false);
    l = resizeCard(l, 'genres', 3, 1); // genres sits in column 4: it can only be one wide
    expect(at(l, 'genres').w).toBe(1);
    expect(at(resizeCard(l, 'pov', 1, 1), 'pov').h).toBe(1);
  });
  it('moves cards into the cover column, where they are one wide, and out again', () => {
    let l = moveCard(normalizeLayout(null, ON), 'narrators', 0, 1.5);
    expect(at(l, 'narrators')).toMatchObject({ col: 0, w: 1 });
    expect(l.cards.filter((x) => x.col === 0).sort((a, b) => a.row - b.row).map((x) => x.id).slice(0, 3)).toEqual(['status', 'rating', 'narrators']);
    l = moveCard(l, 'status', 2, 0);
    expect(at(l, 'status').col).toBe(2);
    expect(overlap(l)).toBe(false);
  });
  it('removes and adds cards, and offers the ones that are not there', () => {
    let l = removeCard(normalizeLayout(null, ON), 'heat');
    expect(l.cards.some((x) => x.id === 'heat')).toBe(false);
    expect(missingCards(l).map((d) => d.id)).toContain('heat');
    expect(missingCards(l).map((d) => d.id)).toContain('mood'); // a feature that is off
    l = addCard(l, 'heat');
    expect(at(l, 'heat').col).toBe(1);
    expect(overlap(l)).toBe(false);
  });
  it('cards of features follow the switches', () => {
    expect(normalizeLayout(null, { ...ON, quotes: false }).cards.some((x) => x.id === 'quotes')).toBe(false);
    const l = normalizeLayout(defaultLayout(), { ...ON, moodpace: true });
    expect(l.cards.some((x) => x.id === 'mood')).toBe(true);
    expect(overlap(l)).toBe(false);
  });
  it('ignores damage in what was stored', () => {
    const l = normalizeLayout({ cards: [{ id: 'nope', col: 1, row: 0, w: 1, h: 2 }, { id: 'series', col: 9, row: -4, w: 9, h: 0 }, { id: 'series', col: 1, row: 0, w: 1, h: 1 }] }, ON);
    expect(at(l, 'series')).toMatchObject({ col: 1, row: 0, w: 4 });
    expect(l.cards.filter((x) => x.id === 'series')).toHaveLength(1);
  });
  it('knows every card', () => { expect(new Set(CARD_DEFS.map((d) => d.id)).size).toBe(CARD_DEFS.length); });
});

describe('row heights', () => {
  it('are as tall as the tallest card in the row, with no set minimum', () => {
    const cards = settle([{ id: 'series', col: 1, row: 0, w: 1, h: 2 }, { id: 'dates', col: 2, row: 0, w: 1, h: 2 }]);
    expect(solveRows(cards, { series: 80, dates: 140 }, 12)).toEqual([0, 140 - 12]);
    expect(solveRows(cards, { series: 30, dates: 20 }, 12)).toEqual([0, 18]);
  });
  it('gives the extra to the bottom card when a tall card needs more room than the cards beside it', () => {
    // a tall card (2 squares) beside two 1-square cards: the lower one grows
    const cards = settle([{ id: 'narrators', col: 1, row: 0, w: 1, h: 4 }, { id: 'series', col: 2, row: 0, w: 1, h: 2 }, { id: 'dates', col: 2, row: 2, w: 1, h: 2 }]);
    const t = solveRows(cards, { narrators: 500, series: 100, dates: 100 }, 12);
    expect(t.reduce((a, b) => a + b, 0) + 12 * 3).toBe(500);
    expect(t[0]).toBe(0);
    expect(t[3]).toBeGreaterThan(t[1]); // the bottom row took the extra
  });
  it('gives the extra to the bottom half card when a full card sits beside two half cards', () => {
    const cards = settle([{ id: 'format', col: 1, row: 0, w: 1, h: 2 }, { id: 'setting', col: 2, row: 0, w: 1, h: 1 }, { id: 'timeperiod', col: 2, row: 1, w: 1, h: 1 }]);
    const t = solveRows(cards, { format: 300, setting: 60, timeperiod: 60 }, 12);
    expect(t[0]).toBe(60);
    expect(t[1]).toBe(300 - 60 - 12);
  });
});

describe('saving the layout', () => {
  it('keeps a layout, and goes back to the default', async () => {
    const moved = moveCard(normalizeLayout(null, ON), 'heat', 1, 0);
    await saveLayout(db, 'default', moved);
    expect(at(await getLayout(db, 'default', ON), 'heat')).toMatchObject({ col: 1, row: 0 });
    await resetLayout(db, 'default');
    expect(at(await getLayout(db, 'default', ON), 'series')).toMatchObject({ col: 1, row: 0 });
  });
});

describe('the layout editor in Settings', () => {
  const show = () => render(<DbContext.Provider value={db}><FeaturesProvider><LayoutCard /></FeaturesProvider></DbContext.Provider>);
  it('removes a card, adds it back from the ghost card, and turns a feature on when its card is added', async () => {
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Remove the Heat level card' }));
    await waitFor(async () => expect((await getLayout(db, 'default', ON)).cards.some((x) => x.id === 'heat')).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: '+ Add card' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Heat level/ }));
    await waitFor(async () => expect((await getLayout(db, 'default', ON)).cards.some((x) => x.id === 'heat')).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: '+ Add card' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Mood/ }));
    await waitFor(async () => expect((await getFeatures(db)).moodpace).toBe(true));
    await waitFor(async () => expect((await getLayout(db, 'default', { ...ON, moodpace: true })).cards.some((x) => x.id === 'mood')).toBe(true));
    // taking a feature's card away switches the feature off
    fireEvent.click(screen.getByRole('button', { name: 'Remove the Quotes card' }));
    await waitFor(async () => expect((await getFeatures(db)).quotes).toBe(false));
  });
  it('resets after a confirm', async () => {
    await saveLayout(db, 'default', removeCard(normalizeLayout(null, ON), 'series'));
    show();
    await screen.findByRole('group', { name: 'Heat level card' });
    expect(screen.queryByRole('group', { name: 'Series card' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reset to the default layout' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, reset the layout' }));
    await screen.findByRole('group', { name: 'Series card' });
  });
});

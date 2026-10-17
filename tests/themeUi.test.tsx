// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DbContext } from '../src/db/DbContext';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { MONTH_COLORS } from '../src/domain/months';
import { loadTheme, saveTheme } from '../src/repo/theme';
import AppearanceCard from '../src/pages/settings/AppearanceCard';
import TagColorsCard from '../src/pages/settings/TagColorsCard';
import { applyCachedTheme, applyTheme, cacheTheme } from '../src/theme/apply';
import { ThemeProvider } from '../src/theme/ThemeContext';
import { DEFAULT_THEME, parseTheme } from '../src/theme/themes';
import Shell from '../src/ui/Shell';

let db: Db;
const root = document.documentElement;
const cssVar = (n: string) => root.style.getPropertyValue(`--${n}`);
beforeEach(() => { db = migrateNodeDb(); root.removeAttribute('data-theme'); root.removeAttribute('style'); try { localStorage.clear(); } catch { /* none */ } });
afterEach(cleanup);

const mountCard = () => render(<DbContext.Provider value={db}><ThemeProvider saveDelay={10}><AppearanceCard /></ThemeProvider></DbContext.Provider>);
const savedTheme = () => loadTheme(db);

describe('the theme on the page', () => {
  it('applies the dark brown theme by default', async () => {
    mountCard();
    await waitFor(() => expect(root.getAttribute('data-theme')).toBe('dark'));
    expect(cssVar('bg')).toBe('#1c1714');
    expect(cssVar('month-1')).toBe(MONTH_COLORS[0]);
  });
  it('comes back as it was saved in the database', async () => {
    await saveTheme(db, { ...DEFAULT_THEME, mode: 'light', presets: { dark: 'dark-brown', light: 'sage' } });
    mountCard();
    await waitFor(() => expect(root.getAttribute('data-theme')).toBe('light'));
    expect(cssVar('bg')).toBe('#eef0e8');
  });
  it('shows the saved colors at once from the cache, before the database answers', () => {
    cacheTheme({ ...DEFAULT_THEME, presets: { dark: 'midnight', light: 'paper' } });
    applyCachedTheme();
    expect(cssVar('bg')).toBe('#121722');
    expect(root.style.colorScheme).toBe('dark');
  });
  it('removes the variables of the old theme when it changes', () => {
    applyTheme(parseTheme(JSON.stringify({ custom: { dark: { accent: '#123456' } } })));
    expect(cssVar('accent')).toBe('#123456');
    applyTheme(DEFAULT_THEME);
    expect(cssVar('accent')).toBe('#c4683d');
  });
});

describe('the Appearance settings', () => {
  it('switches between dark and light and keeps the chosen preset of each', async () => {
    mountCard();
    fireEvent.click(screen.getByRole('button', { name: 'Midnight theme' }));
    await waitFor(() => expect(cssVar('bg')).toBe('#121722'));
    fireEvent.click(screen.getByRole('button', { name: 'Sky theme' }));
    await waitFor(() => expect(root.getAttribute('data-theme')).toBe('light'));
    expect(cssVar('bg')).toBe('#edf1f6');
    fireEvent.click(within(screen.getByRole('group', { name: 'Mode' })).getByRole('button', { name: 'Dark' }));
    await waitFor(() => expect(cssVar('bg')).toBe('#121722')); // the dark preset you chose before
    await waitFor(async () => expect(await savedTheme()).toMatchObject({ mode: 'dark', presets: { dark: 'midnight', light: 'sky' } }));
  });
  it('marks the chosen preset', async () => {
    mountCard();
    fireEvent.click(screen.getByRole('button', { name: 'Forest theme' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Forest theme' }).getAttribute('aria-pressed')).toBe('true'));
    expect(screen.getByRole('button', { name: 'Dark brown theme' }).getAttribute('aria-pressed')).toBe('false');
  });
  it('lets you pick your own accent, and chooses readable text for it', async () => {
    mountCard();
    fireEvent.change(screen.getByLabelText('Accent color'), { target: { value: '#102060' } });
    await waitFor(() => expect(cssVar('accent')).toBe('#102060'));
    expect(cssVar('on-accent')).toBe('#ffffff');
    fireEvent.change(screen.getByLabelText('Accent color'), { target: { value: '#f0e060' } });
    await waitFor(() => expect(cssVar('on-accent')).toBe('#1c1714'));
    await waitFor(async () => expect((await savedTheme()).custom.dark.accent).toBe('#f0e060'));
  });
  it('keeps your own colors apart for dark and light, and can go back to the preset', async () => {
    mountCard();
    fireEvent.change(screen.getByLabelText('Background color'), { target: { value: '#000000' } });
    await waitFor(() => expect(cssVar('bg')).toBe('#000000'));
    fireEvent.click(screen.getByRole('button', { name: 'Paper theme' }));
    await waitFor(() => expect(cssVar('bg')).toBe('#f4efe6')); // light has its own colors
    fireEvent.click(within(screen.getByRole('group', { name: 'Mode' })).getByRole('button', { name: 'Dark' }));
    await waitFor(() => expect(cssVar('bg')).toBe('#000000'));
    fireEvent.click(screen.getByRole('button', { name: "Back to Dark brown's colors" }));
    await waitFor(() => expect(cssVar('bg')).toBe('#1c1714'));
    expect(screen.queryByRole('button', { name: /Back to Dark brown/ })).toBeNull();
  });
  it('changes the month colors, and can restore the originals', async () => {
    mountCard();
    fireEvent.change(screen.getByLabelText('August color'), { target: { value: '#00aa00' } });
    await waitFor(() => expect(cssVar('month-8')).toBe('#00aa00'));
    expect(cssVar('month-2')).toBe(MONTH_COLORS[1]); // February stays as it was
    await waitFor(async () => expect((await savedTheme()).months[7]).toBe('#00aa00'));
    fireEvent.click(screen.getByRole('button', { name: 'Back to the original month colors' }));
    await waitFor(() => expect(cssVar('month-8')).toBe(MONTH_COLORS[7]));
  });
});

describe('the Dark / Light control', () => {
  it('is gone from the sidebar and lives in the Appearance settings', async () => {
    render(<DbContext.Provider value={db}><ThemeProvider saveDelay={10}><MemoryRouter><Routes><Route element={<Shell />}><Route index element={<p>Home</p>} /></Route></Routes></MemoryRouter></ThemeProvider></DbContext.Provider>);
    await screen.findAllByText('Home');
    expect(screen.queryByRole('button', { name: /Switch to (light|dark) mode/ })).toBeNull();
    cleanup();
    mountCard();
    fireEvent.click(within(screen.getByRole('group', { name: 'Mode' })).getByRole('button', { name: 'Light' }));
    await waitFor(() => expect(root.getAttribute('data-theme')).toBe('light'));
    await waitFor(async () => expect((await savedTheme()).mode).toBe('light'));
  });
});

describe('tag colors', () => {
  beforeEach(async () => {
    await db.execute("INSERT INTO genre (id, name, color) VALUES ('g1', 'Romance', '#c98270'), ('g2', 'Mystery', '#6f8aa0')");
    await db.execute("INSERT INTO trope (id, name) VALUES ('t1', 'found family')");
  });
  const mount = () => render(<DbContext.Provider value={db}><TagColorsCard saveDelay={10} /></DbContext.Provider>);
  it('lists the genres with their colors, and saves a change', async () => {
    mount();
    const box = await screen.findByLabelText('Color for Romance');
    expect((box as HTMLInputElement).value).toBe('#c98270');
    fireEvent.change(box, { target: { value: '#112233' } });
    await waitFor(async () => expect((await db.select<{ color: string }>("SELECT color FROM genre WHERE id = 'g1'"))[0].color).toBe('#112233'));
    expect((screen.getByLabelText('Color for Mystery') as HTMLInputElement).value).toBe('#6f8aa0');
  });
  it('switches to tropes, shows a gray for one with no color yet, and filters by name', async () => {
    mount();
    await screen.findByLabelText('Color for Romance');
    fireEvent.click(screen.getByRole('button', { name: 'Tropes' }));
    expect(await screen.findByLabelText('Color for found family')).toBeTruthy();
    expect(screen.queryByLabelText('Color for Romance')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Genres' }));
    await screen.findByLabelText('Color for Romance');
    fireEvent.change(screen.getByLabelText('Find a tag'), { target: { value: 'mys' } });
    expect(screen.queryByLabelText('Color for Romance')).toBeNull();
    expect(screen.getByLabelText('Color for Mystery')).toBeTruthy();
    expect(screen.getByText('1 of 2')).toBeTruthy();
  });
  it('saves only the last color of a quick run of changes', async () => {
    mount();
    const box = await screen.findByLabelText('Color for Mystery');
    await act(async () => { for (const c of ['#010101', '#020202', '#030303']) fireEvent.change(box, { target: { value: c } }); });
    await waitFor(async () => expect((await db.select<{ color: string }>("SELECT color FROM genre WHERE id = 'g2'"))[0].color).toBe('#030303'));
  });
});

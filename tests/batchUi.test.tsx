// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DbContext } from '../src/db/DbContext';
import { migrateNodeDb } from '../src/db/nodeDb';
import { ThemeProvider } from '../src/theme/ThemeContext';
import SettingsPage from '../src/pages/SettingsPage';
import { DatePicker } from '../src/pages/bookLog/parts';
import CharacterMenu from '../src/pages/characters/CharacterMenu';

afterEach(cleanup);

describe('settings tabs', () => {
  it('has Backup and Export, Appearance and Themes, and App updates', async () => {
    const db = migrateNodeDb();
    render(<DbContext.Provider value={db}><ThemeProvider saveDelay={10}><SettingsPage /></ThemeProvider></DbContext.Provider>);
    const tabs = screen.getByRole('tablist');
    expect(within(tabs).getAllByRole('tab').map((t) => t.textContent)).toEqual(['Backup and Export', 'Appearance and Themes', 'Lists', 'Features', 'Sync', 'App updates']);
    expect(screen.getByText('Your backups')).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Mode' })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Appearance and Themes' }));
    expect(screen.getByRole('group', { name: 'Mode' })).toBeTruthy();
    expect(screen.getAllByLabelText(/ color$/).length).toBeGreaterThanOrEqual(12);
    expect(screen.queryByText('Your backups')).toBeNull();
  });
});

describe('date picker month and year choosers', () => {
  it('jumps to a month and a year without selecting a day', () => {
    const onPick = vi.fn();
    render(<DatePicker value="2026-10-05" onPick={onPick} onClear={() => undefined} />);
    fireEvent.click(screen.getByLabelText('Choose month'));
    fireEvent.click(screen.getByLabelText('March 2026'));
    expect(screen.getByLabelText('Choose month').textContent).toBe('March');
    fireEvent.click(screen.getByLabelText('Choose year'));
    fireEvent.click(screen.getByLabelText('Year 2024'));
    expect(screen.getByLabelText('Choose year').textContent).toBe('2024');
    expect(screen.getByLabelText('2024-03-15')).toBeTruthy();
    expect(onPick).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('Next month'));
    expect(screen.getByLabelText('Choose month').textContent).toBe('April');
  });
});

describe('character menu', () => {
  it('merges two characters through the menu', async () => {
    const merge = vi.fn().mockResolvedValue(undefined);
    render(<CharacterMenu self={{ id: 'a', name: 'Rory' }} characters={[{ id: 'a', name: 'Rory' }, { id: 'b', name: 'Aurora' }]} act={{ plan: async () => ({ fields: [], items: [{ key: 'book_character:x', group: 'Books', label: 'One (main)' }] }), merge, remove: vi.fn() }} />);
    fireEvent.click(screen.getByLabelText('Character menu'));
    fireEvent.click(screen.getByRole('menuitem', { name: /Merge characters/ }));
    const dlg = screen.getByRole('dialog', { name: 'Merge characters' });
    const pick = async (label: string, name: string) => { const box = within(dlg).getByLabelText(label); fireEvent.focus(box); fireEvent.change(box, { target: { value: name } }); fireEvent.mouseDown(await within(dlg).findByText(name)); };
    await pick('Search the other character', 'Aurora');
    fireEvent.click(within(dlg).getByRole('button', { name: 'Review...' }));
    fireEvent.click(await within(dlg).findByLabelText('One (main)'));
    fireEvent.click(within(dlg).getByRole('button', { name: 'Merge' }));
    await waitFor(() => expect(merge).toHaveBeenCalledWith('a', 'b', { fields: {}, leave: ['book_character:x'] }));
  });
});

describe('overview series lists', () => {
  it('shows 7 series, then Show all; and the streaks come first', async () => {
    const { default: OverviewView } = await import('../src/pages/journal/OverviewView');
    const run = { days: 3, start: '2026-01-01', end: '2026-01-03' };
    const streaks = { reading: { longest: run, current: null, gap: null }, finishing: { longest: null, current: null, gap: null }, audio: { longest: null, current: null, gap: null }, ebook: { longest: null, current: null, gap: null }, physical: { longest: null, current: null, gap: null } };
    const o = {
      year: 2026, notes: '', canCopyFrom: null, yearly: [], timed: [], continued: [], finishedSeries: [],
      totals: { books: 0, pages: 0, audioHours: 0, avgStars: null, seriesStarted: 9, seriesContinued: 0, seriesFinished: 0 },
      started: Array.from({ length: 9 }, (_, i) => ({ id: `s${i}`, title: `Series ${i + 1}`, date: '2026-02-01' })),
      streaks: { year: streaks, all: streaks },
    };
    const { container } = render(<MemoryRouter><OverviewView o={o as never} lists={{ genres: [], tropes: [] } as never} act={new Proxy({}, { get: () => () => undefined }) as never} /></MemoryRouter>);
    expect(screen.getByText('Series 7')).toBeTruthy();
    expect(screen.queryByText('Series 8')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show all 9' }));
    expect(screen.getByText('Series 9')).toBeTruthy();
    const text = container.textContent ?? '';
    expect(text.indexOf('Longest')).toBeGreaterThan(-1);
    expect(text.indexOf('Longest')).toBeLessThan(text.indexOf('Series 1'));
  });
});

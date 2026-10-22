// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DbContext } from '../src/db/DbContext';
import { migrateNodeDb } from '../src/db/nodeDb';
import { extractClip } from '../src/clip/extract';
import { encodeClip } from '../src/clip/link';
import ClipHost, { CLIP_EVENT } from '../src/clip/ClipHost';
import AddFromWebDialog from '../src/pages/AddFromWebDialog';
import { quickAdd } from '../src/repo/bookLog';

vi.mock('../src/lookup/download', () => ({
  downloadCover: vi.fn(async () => ({ dataUrl: 'data:image/png;base64,AAAA', width: 400, height: 600, mime: 'image/png' })),
}));
afterEach(cleanup);

const URL_ = 'https://www.audible.ca/pd/Finest-Kind-of-Fate-Audiobook/B0H6PKSQ48';
function clip() { return extractClip(new DOMParser().parseFromString(readFileSync('tests/clipPages/audible.html', 'utf8'), 'text/html'), URL_)!; }
const wrap = (db: ReturnType<typeof migrateNodeDb>, ui: React.ReactNode) => (
  <DbContext.Provider value={db}><MemoryRouter>{ui}</MemoryRouter></DbContext.Provider>
);

describe('Add to library window', () => {
  it('shows what was found and adds the book to the TBR', async () => {
    const db = migrateNodeDb(); const c = clip(); let opened = '';
    render(wrap(db, <AddFromWebDialog clip={c} onClose={() => undefined} onOpenBook={(id) => { opened = id; }} />));
    await screen.findByDisplayValue(c.title);
    expect(screen.getByLabelText('Add to')).toHaveProperty('value', 'tbr');
    expect(screen.getByLabelText('First published')).toHaveProperty('value', ''); // an Audible date is not the original publication date
    fireEvent.click(screen.getByRole('button', { name: 'Add to TBR' }));
    await screen.findByText('ADDED');
    const rows = await db.select<{ shelf: string }>('SELECT shelf FROM book WHERE title = ?', [c.title]);
    expect(rows[0]?.shelf).toBe('tbr');
    fireEvent.click(screen.getByRole('button', { name: 'Open the book' }));
    expect(opened).toBeTruthy();
  });

  it('offers to fill in a book that is already in the library', async () => {
    const db = migrateNodeDb(); const c = clip();
    await quickAdd(db, { title: c.title, authors: c.authors, status: 'tbr' });
    render(wrap(db, <AddFromWebDialog clip={c} onClose={() => undefined} onOpenBook={() => undefined} />));
    await screen.findByText(/Already in your library/);
    expect(screen.getByRole('button', { name: 'Fill in missing details' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add as another book' }));
    expect(screen.getByRole('button', { name: 'Add to TBR' })).toBeTruthy();
  });

  it('a tag can be switched to skip before adding', async () => {
    const db = migrateNodeDb(); const c = clip();
    render(wrap(db, <AddFromWebDialog clip={c} onClose={() => undefined} onOpenBook={() => undefined} />));
    await screen.findByDisplayValue(c.title);
    const tag = c.tags[0]; if (!tag) return;
    const chip = screen.getByRole('button', { name: new RegExp(`^${tag.name}:`) });
    for (let i = 0; i < 6 && !/: skip$/.test(chip.getAttribute('aria-label') ?? ''); i++) fireEvent.click(chip);
    expect(chip.getAttribute('aria-label')).toMatch(/: skip$/);
  });
});

describe('choosing what to keep in the window', () => {
  it('shows Keep mine / Use this one for a title and synopsis that differ, and replaces only what is chosen', async () => {
    const db = migrateNodeDb(); const c = clip();
    const { bookId } = await quickAdd(db, { title: 'Finest Kind of Fat', authors: c.authors, status: 'tbr' });
    await db.execute("UPDATE book SET synopsis = 'Mine.', external_ids = ? WHERE id = ?", [JSON.stringify({ asin: c.asin }), bookId]);
    render(wrap(db, <AddFromWebDialog clip={c} onClose={() => undefined} onOpenBook={() => undefined} />));
    await screen.findByText(/Already in your library/);
    const title = screen.getByRole('group', { name: 'Which title to keep' });
    expect(within(title).getByRole('button', { name: 'Keep mine' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('group', { name: 'Which synopsis to keep' })).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Which cover to keep' })).toBeNull(); // Audible gives no cover
    fireEvent.click(within(title).getByRole('button', { name: 'Use this one' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fill in missing details' }));
    await screen.findByText('UPDATED');
    const [row] = await db.select<{ title: string; synopsis: string }>('SELECT title, synopsis FROM book WHERE id = ?', [bookId]);
    expect(row).toEqual({ title: c.title, synopsis: 'Mine.' });
  });
  it('Audible has no cover to offer', async () => {
    const db = migrateNodeDb(); const c = clip();
    expect(c.cover).toBeUndefined();
    render(wrap(db, <AddFromWebDialog clip={c} onClose={() => undefined} onOpenBook={() => undefined} />));
    await screen.findByText(/Audible covers are square/);
  });
});

describe('receiving a link from the extension', () => {
  it('opens the window when a bookjournal link arrives, and ignores junk', async () => {
    const db = migrateNodeDb(); const c = clip();
    render(wrap(db, <ClipHost />));
    window.dispatchEvent(new CustomEvent(CLIP_EVENT, { detail: 'bookjournal://add?d=garbage' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    window.dispatchEvent(new CustomEvent(CLIP_EVENT, { detail: encodeClip(c) }));
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Add to library' })).toBeTruthy());
  });
});

describe('the page behind the window', () => {
  it('reloads after a save, so the book you are on shows the new details at once', async () => {
    const db = migrateNodeDb(); const c = clip();
    const { default: BookLogPage } = await import('../src/pages/BookLogPage');
    const { Route, Routes } = await import('react-router-dom');
    const { useState } = await import('react');
    const { bookId } = await quickAdd(db, { title: c.title, authors: c.authors, status: 'tbr' });
    function Mini() {
      const [n, setN] = useState(0);
      return <><ClipHost onSaved={() => setN(n + 1)} /><Routes key={n}><Route path="book/:bookId" element={<BookLogPage />} /></Routes></>;
    }
    render(<DbContext.Provider value={db}><MemoryRouter initialEntries={[`/book/${bookId}`]}><Mini /></MemoryRouter></DbContext.Provider>);
    expect(await screen.findByRole('button', { name: 'Add synopsis' })).toBeTruthy();
    window.dispatchEvent(new CustomEvent(CLIP_EVENT, { detail: encodeClip(c) }));
    fireEvent.click(await screen.findByRole('button', { name: 'Fill in missing details' }));
    await screen.findByText('UPDATED');
    expect(await screen.findByRole('button', { name: 'Read synopsis' })).toBeTruthy(); // the Book Log behind the window now has the synopsis
  });
});

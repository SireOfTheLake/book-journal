// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DbContext } from '../src/db/DbContext';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { createBook } from '../src/repo/books';
import { addNarratorToRead, createNarrator, createRead, getBookLog, listItems, removeSource, renameListItem, createListItem, setStatus, updateRead } from '../src/repo/bookLog';
import { addCharacterToBook, createCharacter, getCharacter } from '../src/repo/characters';
import { getNarrator } from '../src/repo/people';
import { createGrid, getChallenge, setChallengeDescription } from '../src/repo/challenges';
import { assignVoice, unassignVoice, voicingCandidates, voicingsOf } from '../src/repo/voicing';
import BookLogPage from '../src/pages/BookLogPage';
import { EditNotes } from '../src/pages/bookLog/parts';

afterEach(cleanup);
let db: Db; let bookId = ''; let readId = ''; let charId = ''; let narrId = ''; let rnId = '';
beforeEach(async () => {
  db = migrateNodeDb();
  bookId = await createBook(db, { title: 'Audio Book', authors: ['Au'] });
  readId = await createRead(db, bookId, 'reading');
  await updateRead(db, readId, { format: 'audio' });
  charId = await createCharacter(db, 'Rhys');
  await addCharacterToBook(db, charId, bookId, 'main');
  narrId = await createNarrator(db, 'Nina');
  await addNarratorToRead(db, readId, narrId);
  rnId = (await db.select<{ id: string }>('SELECT id FROM read_narrator WHERE read_id = ?', [readId]))[0].id;
});
const show = () => render(<DbContext.Provider value={db}><MemoryRouter initialEntries={[`/book/${bookId}/${readId}`]}><Routes><Route path="book/:bookId/:readId" element={<BookLogPage />} /><Route path="book/:bookId" element={<BookLogPage />} /></Routes></MemoryRouter></DbContext.Provider>);

describe('narrators voicing characters', () => {
  it('assigns, lists candidates, and unassigns', async () => {
    expect((await voicingCandidates(db, charId)).map((v) => v.narrator)).toEqual(['Nina']);
    await assignVoice(db, rnId, charId);
    await assignVoice(db, rnId, charId); // twice is fine
    expect((await voicingsOf(db, charId)).map((v) => v.narrator)).toEqual(['Nina']);
    expect(await voicingCandidates(db, charId)).toEqual([]);
    expect((await getCharacter(db, charId))!.voicings).toHaveLength(1);
    const n = (await getNarrator(db, narrId))!;
    expect(n.listens[0].chars.map((c) => c.name)).toEqual(['Rhys']);
    await unassignVoice(db, rnId, charId);
    expect((await getNarrator(db, narrId))!.listens[0].options.map((c) => c.name)).toEqual(['Rhys']);
  });
  it('can be done from the book log', async () => {
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Add a character voiced by Nina' }));
    fireEvent.change(screen.getByLabelText('Character voiced by Nina'), { target: { value: charId } });
    await waitFor(async () => expect((await voicingsOf(db, charId)).length).toBe(1));
    fireEvent.click(await screen.findByRole('button', { name: 'Take Rhys off Nina' }));
    await waitFor(async () => expect((await voicingsOf(db, charId)).length).toBe(0));
  });
});

describe('book log buttons', () => {
  it('Finish reading sets the finish date and status', async () => {
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Finish reading' }));
    await waitFor(async () => { const r = (await getBookLog(db, bookId, readId))!.read!; expect(r.status).toBe('finished'); expect(r.finish_date).toBeTruthy(); });
  });
  it('Start reading and Move to Up Next are not offered while reading', async () => {
    show();
    await screen.findByText('Mark as favorite');
    expect(screen.queryByRole('button', { name: 'Start reading' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Move to Up Next' })).toBeNull();
  });
  it('a TBR book can start reading or move to Up Next', async () => {
    const b = await createBook(db, { title: 'Later', authors: ['X'] });
    await setStatus(db, b, null, 'tbr');
    render(<DbContext.Provider value={db}><MemoryRouter initialEntries={[`/book/${b}`]}><Routes><Route path="book/:bookId" element={<BookLogPage />} /><Route path="book/:bookId/:readId" element={<BookLogPage />} /></Routes></MemoryRouter></DbContext.Provider>);
    fireEvent.click(await screen.findByRole('button', { name: 'Move to Up Next' }));
    await waitFor(async () => expect((await getBookLog(db, b, null))!.book.shelf).toBe('up_next'));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Move to Up Next' })).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Start reading' }));
    await waitFor(async () => { const l = (await getBookLog(db, b, null))!; expect(l.book.shelf).toBeNull(); expect(l.read?.status).toBe('reading'); });
  });
});

describe('sources', () => {
  it('can be renamed and removed', async () => {
    const s = await createListItem(db, 'source', 'Library');
    const t = await createListItem(db, 'source', 'Kobo');
    await updateRead(db, readId, { source_id: s });
    await renameListItem(db, 'source', s, 'Public library');
    expect((await listItems(db, 'source')).map((x) => x.name)).toContain('Public library');
    await expect(renameListItem(db, 'source', s, 'kobo')).rejects.toThrow(/already/);
    await removeSource(db, s);
    expect((await listItems(db, 'source')).map((x) => x.id)).toEqual([t]);
    expect((await getBookLog(db, bookId, readId))!.read!.source_id).toBeNull();
  });
});

describe('challenge description', () => {
  it('is saved and loaded', async () => {
    const id = await createGrid(db, { year: 2026, name: 'Cozy', groups: [{ name: 'Main', prompts: ['A'] }] });
    expect((await getChallenge(db, id))!.description).toBeNull();
    await setChallengeDescription(db, id, '  Read cozy things  ');
    expect((await getChallenge(db, id))!.description).toBe('Read cozy things');
    await setChallengeDescription(db, id, '');
    expect((await getChallenge(db, id))!.description).toBeNull();
  });
});

describe('long text boxes', () => {
  it('Escape saves the text; clearing it and leaving saves the empty text', () => {
    const onCommit = vi.fn();
    const { rerender } = render(<EditNotes label="Notes" addLabel="Add notes" value="old" onCommit={onCommit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit notes' }));
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'new text' } });
    fireEvent.keyDown(screen.getByLabelText('Notes'), { key: 'Escape' });
    expect(onCommit).toHaveBeenCalledWith('new text');
    expect(screen.queryByLabelText('Notes')).toBeNull();
    rerender(<EditNotes label="Notes" addLabel="Add notes" value="new text" onCommit={onCommit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit notes' }));
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: '' } });
    fireEvent.blur(screen.getByLabelText('Notes'));
    expect(onCommit).toHaveBeenLastCalledWith('');
    void within;
  });
});

describe('challenge blurb', () => {
  it('shows the text quietly, and edits it only when editing', async () => {
    const { default: Blurb } = await import('../src/pages/challenges/Blurb');
    const save = vi.fn();
    const { rerender } = render(<Blurb text="About cozy reads" editing={false} onSave={save} />);
    expect(screen.getByText('About cozy reads')).toBeTruthy();
    expect(screen.queryByLabelText('Challenge description')).toBeNull();
    rerender(<Blurb text="About cozy reads" editing onSave={save} />);
    const box = screen.getByLabelText('Challenge description');
    fireEvent.change(box, { target: { value: 'New words' } });
    fireEvent.keyDown(box, { key: 'Escape' });
    fireEvent.blur(box);
    expect(save).toHaveBeenCalledWith('New words');
  });
  it('shows nothing when empty and not editing', async () => {
    const { default: Blurb } = await import('../src/pages/challenges/Blurb');
    const { container } = render(<Blurb text={null} editing={false} onSave={() => undefined} />);
    expect(container.innerHTML).toBe('');
  });
});

describe('voice chips', () => {
  it('shows the names that fit and +N more for the rest', async () => {
    const { default: VoiceChips } = await import('../src/pages/VoiceChips');
    const chars = ['A', 'B', 'C', 'D', 'E'].map((n) => ({ id: n, name: n }));
    render(<MemoryRouter><VoiceChips max={3} narrator="Nina" chars={chars} options={[]} onAdd={() => undefined} onRemove={() => undefined} /></MemoryRouter>);
    expect(screen.getAllByRole('link').map((l) => l.textContent)).toEqual(['A', 'B', 'C']);
    fireEvent.click(screen.getByRole('button', { name: 'Show 2 more voiced by Nina' }));
    expect(screen.getAllByRole('link')).toHaveLength(5);
  });
});

describe('moving through a series from the book log', () => {
  it('has previous and next arrows, in series order with novellas, and none past the ends', async () => {
    const { createSeries, addBookToSeries } = await import('../src/repo/series');
    const sid = await createSeries(db, 'Saga');
    const a = await addBookToSeries(db, sid, 'One');
    const n = await addBookToSeries(db, sid, 'Novella');
    const c = await addBookToSeries(db, sid, 'Two');
    await db.execute('UPDATE book SET series_position = 1 WHERE id = ?', [a]);
    await db.execute('UPDATE book SET series_position = 1.5 WHERE id = ?', [n]);
    await db.execute('UPDATE book SET series_position = 2 WHERE id = ?', [c]);
    expect((await getBookLog(db, a))!.seriesNav).toEqual({ prev: null, next: { id: n, title: 'Novella' } });
    expect((await getBookLog(db, n))!.seriesNav).toMatchObject({ prev: { id: a }, next: { id: c } });
    expect((await getBookLog(db, c))!.seriesNav).toEqual({ prev: { id: n, title: 'Novella' }, next: null });
    expect((await getBookLog(db, bookId))!.seriesNav).toEqual({ prev: null, next: null });
    // in the page
    render(<DbContext.Provider value={db}><MemoryRouter initialEntries={[`/book/${n}`]}><Routes><Route path="book/:bookId" element={<BookLogPage />} /></Routes></MemoryRouter></DbContext.Provider>);
    fireEvent.click(await screen.findByRole('link', { name: 'Next book: Two' }));
    await screen.findByRole('link', { name: 'Previous book: Novella' });
    expect(screen.queryByRole('link', { name: /^Next book/ })).toBeNull();
    fireEvent.click(screen.getByRole('link', { name: 'Previous book: Novella' }));
    fireEvent.click(await screen.findByRole('link', { name: 'Previous book: One' }));
    await screen.findByRole('link', { name: 'Next book: Novella' });
    expect(screen.queryByRole('link', { name: /^Previous book/ })).toBeNull();
  });
});

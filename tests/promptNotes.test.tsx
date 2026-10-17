// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { createBook } from '../src/repo/books';
import { createRead, updateRead } from '../src/repo/bookLog';
import * as ch from '../src/repo/challenges';
import { getMonthlyDashboard } from '../src/repo/dashboard';
import GridView, { type GridActions } from '../src/pages/challenges/GridView';

afterEach(cleanup);
let db: Db;
beforeEach(() => { db = migrateNodeDb(); });
const read = async (title: string, finish: string) => { const b = await createBook(db, { title, authors: ['Au'] }); const r = await createRead(db, b, 'finished'); await updateRead(db, r, { finish_date: finish }); return r; };

describe('notes on prompts', () => {
  it('a challenge can ask on every prompt, and one prompt can opt in or out', async () => {
    const id = await ch.createGrid(db, { year: 2026, name: 'Book Boyfriends', prompts: ['Boyfriend 1', 'Boyfriend 2'] });
    await ch.setChallengeNotes(db, id, true, ' Character ');
    let c = (await ch.getChallenge(db, id))!;
    expect(c).toMatchObject({ askNote: true, noteLabel: 'Character' });
    expect(c.loose.map((s) => s.askNote)).toEqual([null, null]);
    await ch.setPromptAsk(db, c.loose[1].id, false);
    c = (await ch.getChallenge(db, id))!;
    expect(c.loose.map((s) => s.askNote)).toEqual([null, false]);
  });
  it('only some prompts can ask (the Love and Locker Room case)', async () => {
    const id = await ch.createGrid(db, { year: 2026, name: 'Locker Room', prompts: ['Hockey', 'Baseball', 'Your choice'] });
    const c = (await ch.getChallenge(db, id))!;
    await ch.setPromptAsk(db, c.loose[2].id, true);
    const after = (await ch.getChallenge(db, id))!;
    expect(after.askNote).toBe(false);
    expect(after.noteLabel).toBe('Note');
    expect(after.loose.map((s) => s.askNote)).toEqual([null, null, true]);
  });
  it('stores the note with the book on the prompt; the same book keeps it, another book clears it', async () => {
    const id = await ch.createGrid(db, { year: 2026, name: 'BB', prompts: ['One'] });
    const slot = (await ch.getChallenge(db, id))!.loose[0].id;
    const a = await read('A', '2026-03-01'); const b = await read('B', '2026-03-02');
    await ch.fillSlot(db, slot, a);
    await ch.setPromptNote(db, slot, '  Gideon ');
    expect((await ch.getChallenge(db, id))!.loose[0].note).toBe('Gideon');
    await ch.fillSlot(db, slot, a);
    expect((await ch.getChallenge(db, id))!.loose[0].note).toBe('Gideon');
    await ch.fillSlot(db, slot, b);
    expect((await ch.getChallenge(db, id))!.loose[0].note).toBeNull();
    await ch.setPromptNote(db, slot, 'Rhys');
    expect((await ch.listReadChallenges(db, b))[0].note).toBe('Rhys');
    await ch.setPromptNote(db, slot, '   ');
    expect((await ch.getChallenge(db, id))!.loose[0].note).toBeNull();
  });
  it('is refused for Bingo and US map challenges', async () => {
    const us = (await db.select<{ id: string }>("SELECT 1 AS id"))[0] && undefined;
    expect(us).toBeUndefined();
    const g = await ch.createGrid(db, { year: 2026, name: 'G', prompts: ['x'] });
    await db.execute("UPDATE challenge SET us_map = 1 WHERE id = ?", [g]);
    await expect(ch.setChallengeNotes(db, g, true, 'x')).rejects.toThrow(/do not take notes/);
  });
  it('the dashboard lists stickers in the order the books were read, not by challenge', async () => {
    const first = await ch.createGrid(db, { year: 2026, name: 'Zed first challenge', prompts: ['P1'] });
    const second = await ch.createGrid(db, { year: 2026, name: 'Alpha second challenge', prompts: ['P2'] });
    const s1 = (await ch.getChallenge(db, first))!.loose[0].id; const s2 = (await ch.getChallenge(db, second))!.loose[0].id;
    const late = await read('Late', '2026-03-20'); const early = await read('Early', '2026-03-02');
    await ch.fillSlot(db, s1, late); await ch.fillSlot(db, s2, early);
    await ch.setPromptNote(db, s1, 'Note on late');
    const d = await getMonthlyDashboard(db, 2026, 3);
    expect(d.stickers.map((s) => s.title)).toEqual(['Early', 'Late']);
    expect(d.stickers[1].note).toBe('Note on late');
  });
});

const slot = (over: Partial<ch.Slot>): ch.Slot => ({ id: 's', label: 'Prompt', position: 1, group_id: null, art: null, color: null, is_free: false, bank_prompt_id: null, askNote: null, note: null, fill: { read_id: 'r', book_id: 'b', title: 'Some Book', authors: null, status: 'finished' }, ...over });
const challenge = (loose: ch.Slot[], over: Partial<ch.Challenge> = {}): ch.Challenge => ({
  id: 'c', name: 'Boyfriends', kind: 'grid', color: '#a65e3a', year: 2026, bingo: null, layout: { order: ['main'], cols: {} }, groups: [], loose, usMap: false, description: null, askNote: false, noteLabel: 'Character', word: false, theme: null, target: null, letters: {}, done: 0, total: loose.length, left: 0, percent: 0, ...over,
} as ch.Challenge);
const acts = (over: Partial<GridActions> = {}): GridActions => ({ fill: vi.fn(), clear: vi.fn(), search: async () => [], rename: vi.fn(), color: vi.fn(), remove: vi.fn(), addGroup: vi.fn(), renameGroup: vi.fn(), groupColor: vi.fn(), removeGroup: vi.fn(), addPrompt: vi.fn(), renamePrompt: vi.fn(), removePrompt: vi.fn(), cardCols: vi.fn(), moveCard: vi.fn(), shuffleCards: vi.fn(), movePrompt: vi.fn(), shufflePrompts: vi.fn(), ...over });
const show = (c: ch.Challenge, a: GridActions) => render(<MemoryRouter><GridView challenge={c} covers={{}} act={a} /></MemoryRouter>);

describe('the note box on a prompt', () => {
  it('shows only under prompts that ask, and only once a book is on them', () => {
    const a = acts({ note: vi.fn() });
    show(challenge([slot({ id: 'a', label: 'Asks', askNote: true }), slot({ id: 'b', label: 'Follows' }), slot({ id: 'c', label: 'Empty', askNote: true, fill: null })]), a);
    expect(screen.getAllByLabelText('Character')).toHaveLength(1);
  });
  it('every prompt shows it when the challenge asks, unless a prompt says no', () => {
    show(challenge([slot({ id: 'a' }), slot({ id: 'b', askNote: false })], { askNote: true }), acts({ note: vi.fn() }));
    expect(screen.getAllByLabelText('Character')).toHaveLength(1);
  });
  it('saves on Enter and on Escape', async () => {
    const note = vi.fn();
    show(challenge([slot({ id: 'a', askNote: true })]), acts({ note }));
    const box = screen.getByLabelText('Character');
    fireEvent.change(box, { target: { value: 'Gideon' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(note).toHaveBeenCalledWith('a', 'Gideon');
    note.mockClear();
    await new Promise((r) => setTimeout(r, 5));
    fireEvent.change(box, { target: { value: 'Rhys' } });
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(note).toHaveBeenCalledWith('a', 'Rhys');
  });
  it('Edit mode has the challenge switch and a choice for each prompt', () => {
    const askAll = vi.fn(); const askPrompt = vi.fn();
    show(challenge([slot({ id: 'a' })]), acts({ askAll, askPrompt, note: vi.fn() }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByLabelText('Ask for a note with each book'));
    expect(askAll).toHaveBeenCalledWith(true, 'Character');
    fireEvent.change(screen.getByLabelText('Note for Prompt'), { target: { value: 'yes' } });
    expect(askPrompt).toHaveBeenCalledWith('a', true);
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { DbContext } from '../src/db/DbContext';
import { migrateNodeDb } from '../src/db/nodeDb';
import { activeMention, applyMention, hasMentions, mentionToken, parseMentions, plainMentions } from '../src/domain/mentions';
import { searchMentions } from '../src/repo/mentions';
import { addCharacterTag, createCharacter } from '../src/repo/characters';
import { EditNotes } from '../src/pages/bookLog/parts';
import { quickAdd } from '../src/repo/bookLog';
import { createSeries } from '../src/repo/series';
import { useState } from 'react';

afterEach(cleanup);
let db: Db;
beforeEach(() => { db = migrateNodeDb(); });

describe('mention text', () => {
  it('finds the @ being typed, and turns a choice into a token that reads back', () => {
    expect(activeMention('met @Ew', 7)).toEqual({ start: 4, query: 'Ew' });
    expect(activeMention('mail a@b', 8)).toBeNull();
    expect(activeMention('done @[Ewan](character:1) ok', 28)).toBeNull();
    const t = applyMention('met @Ew now', 7, 4, { kind: 'character', id: 'c1', name: 'Ewan', note: null });
    expect(t.text).toBe('met @[Ewan](character:c1)  now');
    expect(parseMentions(t.text)).toEqual([{ text: 'met ' }, { mention: { kind: 'character', id: 'c1', name: 'Ewan' } }, { text: '  now' }]);
    expect(hasMentions(t.text)).toBe(true);
    expect(plainMentions(mentionToken('book', 'b1', 'A [Odd] Name'))).toBe('@A Odd Name');
  });
});

describe('searching for a mention', () => {
  it('groups books, series, characters (with their tag), narrators and authors', async () => {
    const { bookId } = await quickAdd(db, { title: 'Sam and Co', authors: ['Sam Author'], status: 'reading' });
    const sam = await createCharacter(db, 'Sam'); await addCharacterTag(db, sam, 'Sam and Co');
    await createSeries(db, 'Samwise Saga');
    await db.execute("INSERT INTO narrator (id, name) VALUES ('n1', 'Sam Voice')");
    const hits = await searchMentions(db, 'sam');
    expect(new Set(hits.map((h) => h.kind))).toEqual(new Set(['book', 'series', 'character', 'narrator', 'author']));
    expect(hits.find((h) => h.kind === 'character')).toMatchObject({ id: sam, note: 'Sam and Co' });
    expect(hits.find((h) => h.kind === 'book')!.id).toBe(bookId);
  });
});

describe('typing @ in notes', () => {
  it('offers matches in groups, saves the mention, and shows it as a link', async () => {
    const sam = await createCharacter(db, 'Samuel'); await addCharacterTag(db, sam, 'Lead of Book One');
    let saved: string | null = null;
    function Host() { const [v, setV] = useState<string | null>(null); return <EditNotes label="Notes" addLabel="Add notes" value={v} onCommit={(x) => { saved = x; setV(x); }} />; }
    render(<DbContext.Provider value={db}><MemoryRouter><Host /></MemoryRouter></DbContext.Provider>);
    fireEvent.click(screen.getByRole('button', { name: 'Add notes' }));
    const box = screen.getByLabelText('Notes') as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: 'loved @Sam', selectionStart: 10, selectionEnd: 10 } });
    box.setSelectionRange(10, 10); fireEvent.select(box);
    expect(await screen.findByRole('group', { name: 'Characters' })).toBeTruthy();
    expect(screen.getByText('Lead of Book One')).toBeTruthy();
    fireEvent.click(screen.getByRole('option', { name: /Samuel/ }));
    await waitFor(() => expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toContain(`@[Samuel](character:${sam})`));
    fireEvent.blur(screen.getByLabelText('Notes'));
    await waitFor(() => expect(saved).toContain(`@[Samuel](character:${sam})`));
    const link = await screen.findByRole('link', { name: '@Samuel' });
    expect(link.getAttribute('href')).toBe(`/characters/${sam}`);
  });
});

describe('how notes with mentions are laid out', () => {
  it('lets the text and the mention flow together on one line of text', () => {
    const css = require('node:fs').readFileSync('src/theme/theme.css', 'utf8');
    expect(css).toMatch(/\.ed\.notes-view \{ display: block;/);
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { migrateNodeDb } from '../src/db/nodeDb';
import { addNarratorAccent, getBookLog, quickAdd, removeNarratorAccent, setNarratorAccent } from '../src/repo/bookLog';
import { addNarratorToRead } from '../src/repo/bookLog';
import { getNarrator } from '../src/repo/people';
import PersonSide, { type PersonActions } from '../src/pages/people/PersonSide';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const noop = () => undefined;
const actions = (over: Partial<PersonActions> = {}): PersonActions => ({ update: noop, addAlias: noop, removeAlias: noop, addLink: noop, removeLink: noop, updateLink: noop, setPhoto: noop, setPhotoUrl: async () => undefined, removePhoto: noop, ...over });
const show = (links: { label: string; url: string }[], over: Partial<PersonActions> = {}) =>
  render(<MemoryRouter><PersonSide photo={null} name="Daniel Lewis" aliases={[]} aliasLabel="Aliases" links={links} notes={null} act={actions(over)} /></MemoryRouter>);

describe('links on author and narrator pages', () => {
  const link = { label: 'Audible Page', url: 'https://www.audible.ca/search?searchNarrator=Daniel+Lewis' };
  it('the label is the link, with the address under it and no Copy button', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    show([link]);
    expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull();
    fireEvent.click(screen.getByText('Audible Page'));
    expect(open).toHaveBeenCalledWith(link.url, '_blank', 'noopener,noreferrer');
    expect(screen.getByText(link.url).className).toContain('linkurl'); // truncated by CSS, with the full address on hover
    expect(screen.getByText('Audible Page').closest('.linkhead')!.querySelectorAll('button')).toHaveLength(2); // pencil and cross, same line
  });
  it('the pencil edits the label and address, and the cross removes', async () => {
    const updateLink = vi.fn(); const removeLink = vi.fn();
    show([link], { updateLink, removeLink });
    fireEvent.click(screen.getByLabelText('Edit Audible Page'));
    fireEvent.change(screen.getByLabelText('Edit link label'), { target: { value: 'Audible' } });
    fireEvent.change(screen.getByLabelText('Edit link address'), { target: { value: 'https://example.com/x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateLink).toHaveBeenCalledWith(0, 'Audible', 'https://example.com/x'));
    fireEvent.click(screen.getByLabelText('Remove Audible Page'));
    expect(removeLink).toHaveBeenCalledWith(0);
  });
  it('shows why a save failed and stays open', async () => {
    show([link], { updateLink: () => { throw new Error('Type the address of the link.'); } });
    fireEvent.click(screen.getByLabelText('Edit Audible Page'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Type the address/);
  });
});

describe('narrator accents on a listen', () => {
  it('can be several, added once, removed, and show on the narrator page', async () => {
    const db = migrateNodeDb();
    const { bookId, readId } = await quickAdd(db, { title: 'Aud', authors: ['A'], status: 'finished' });
    await db.execute("UPDATE read SET format = 'audio' WHERE id = ?", [readId!]);
    await db.execute("INSERT INTO narrator (id, name) VALUES ('nn', 'Daniel Lewis')");
    await addNarratorToRead(db, readId!, 'nn');
    const rn = (await getBookLog(db, bookId))!.narrators[0];
    await addNarratorAccent(db, rn.id, 'British'); await addNarratorAccent(db, rn.id, 'Irish'); await addNarratorAccent(db, rn.id, 'british');
    expect((await getBookLog(db, bookId))!.narrators[0].accents.map((a) => a.name)).toEqual(['British', 'Irish']);
    expect((await getNarrator(db, 'nn'))!.commonAccents.map((a) => [a.name, a.n])).toEqual([['British', 1], ['Irish', 1]]);
    await removeNarratorAccent(db, rn.id, (await getBookLog(db, bookId))!.narrators[0].accents[0].id);
    expect((await getBookLog(db, bookId))!.narrators[0].accents.map((a) => a.name)).toEqual(['Irish']);
    await setNarratorAccent(db, rn.id, 'Scottish');
    expect((await getBookLog(db, bookId))!.narrators[0].accents.map((a) => a.name)).toEqual(['Scottish']);
  });
});

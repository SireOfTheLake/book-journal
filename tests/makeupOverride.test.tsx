// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { migrateNodeDb } from '../src/db/nodeDb';
import { MakeupEditor } from '../src/pages/bookLog/BookLogView';
import { getBookLog, quickAdd, updateBook } from '../src/repo/bookLog';
import { addCharacterToBook, createCharacter, updateCharacter } from '../src/repo/characters';

afterEach(cleanup);

describe('the couple makeup you set yourself', () => {
  it('replaces the one from the main characters, counts for the dashboard bucket, and goes back when cleared', async () => {
    const db = migrateNodeDb();
    const { bookId } = await quickAdd(db, { title: 'Anthology', authors: ['A'], status: 'finished' });
    for (const [n, g] of [['A', 'male'], ['B', 'female'], ['C', 'male']] as const) {
      const id = await createCharacter(db, n); await updateCharacter(db, id, { gender: g });
      await addCharacterToBook(db, id, bookId, 'main');
    }
    expect((await getBookLog(db, bookId))!.makeup).toBe('MFM');
    await updateBook(db, bookId, { makeup_override: 'MM' });
    const log = (await getBookLog(db, bookId))!;
    expect(log).toMatchObject({ makeup: 'MM', bucket: 'MM' });
    await updateBook(db, bookId, { makeup_override: null });
    expect((await getBookLog(db, bookId))!.makeup).toBe('MFM');
  });
});

describe('the makeup on the Book Log', () => {
  it('shows M/M, opens on a click, keeps only M, F and X, and saves on Enter', () => {
    const onSave = vi.fn();
    render(<MakeupEditor makeup="MFM" overridden={false} onSave={onSave} />);
    expect(screen.queryByText(/from the main characters/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Edit makeup' }));
    const box = screen.getByLabelText('Makeup letters') as HTMLInputElement;
    fireEvent.change(box, { target: { value: 'mmz' } });
    expect(box.value).toBe('MM');
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onSave).toHaveBeenCalledWith('MM');
  });
  it('clearing it goes back to the characters, and Escape changes nothing', () => {
    const onSave = vi.fn();
    render(<MakeupEditor makeup="MM" overridden onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit makeup' }));
    fireEvent.change(screen.getByLabelText('Makeup letters'), { target: { value: '' } });
    fireEvent.keyDown(screen.getByLabelText('Makeup letters'), { key: 'Enter' });
    expect(onSave).toHaveBeenCalledWith(null);
    fireEvent.click(screen.getByRole('button', { name: 'Edit makeup' }));
    fireEvent.keyDown(screen.getByLabelText('Makeup letters'), { key: 'Escape' });
    expect(onSave).toHaveBeenCalledTimes(1);
  });
  it('lets you set one when there are no main characters', () => {
    render(<MakeupEditor makeup={null} overridden={false} onSave={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Set makeup' })).toBeTruthy();
  });
});

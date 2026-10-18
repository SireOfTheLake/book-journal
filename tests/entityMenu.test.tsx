// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EntityMenu from '../src/pages/EntityMenu';

afterEach(cleanup);
const merge = { plan: async () => ({ fields: [], items: [{ key: 'book:1', group: 'Books', label: 'Book One' }] }), merge: vi.fn().mockResolvedValue(undefined) };

describe('entity menu', () => {
  it('reviews then merges a series', async () => {
    render(<EntityMenu noun="series" self={{ id: 'a', name: 'Wolves' }} others={[{ id: 'a', name: 'Wolves' }, { id: 'b', name: 'Wolf Books' }]} merge={merge} remove={{ describe: async () => '', run: vi.fn() }} />);
    fireEvent.click(screen.getByLabelText('Series menu'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Merge series...' }));
    const dlg = screen.getByRole('dialog', { name: 'Merge series' });
    const box = within(dlg).getByLabelText('Search the other series');
    fireEvent.focus(box); fireEvent.change(box, { target: { value: 'Wolf B' } }); fireEvent.mouseDown(await within(dlg).findByText('Wolf Books'));
    fireEvent.click(within(dlg).getByRole('button', { name: 'Review...' }));
    await within(dlg).findByLabelText('Book One');
    fireEvent.click(within(dlg).getByRole('button', { name: 'Merge' }));
    await waitFor(() => expect(merge.merge).toHaveBeenCalledWith('a', 'b', { fields: {}, leave: [] }));
  });
  it('explains what deleting does before deleting an author', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    render(<EntityMenu noun="author" self={{ id: 'a', name: 'Pat' }} others={[]} merge={merge} remove={{ describe: async () => 'Their 2 books stay in your journal.', run }} />);
    fireEvent.click(screen.getByLabelText('Author menu'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete this author...' }));
    await screen.findByText(/Their 2 books stay/);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(run).toHaveBeenCalled());
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TimePeriodCard from '../src/pages/bookLog/TimePeriodCard';

afterEach(cleanup);
const opts = [{ id: 'h', name: 'Historical' }, { id: 'r', name: 'Recent History' }, { id: 'f', name: 'Future' }];
const mk = (over: Partial<Parameters<typeof TimePeriodCard>[0]> = {}) => {
  const p = { periodId: null, detail: null, options: opts, onPick: vi.fn(), onDetail: vi.fn(), onCreate: vi.fn(), onRemove: vi.fn(), onRename: vi.fn(), ...over };
  render(<TimePeriodCard {...p} />);
  return p;
};

describe('the time period card', () => {
  it('Historical offers an optional era', () => {
    const p = mk({ periodId: 'h' });
    fireEvent.click(screen.getByRole('button', { name: 'Add an era (optional)' }));
    fireEvent.change(screen.getByLabelText('Historical era'), { target: { value: 'Regency' } });
    fireEvent.keyDown(screen.getByLabelText('Historical era'), { key: 'Enter' });
    expect(p.onDetail).toHaveBeenCalledWith('Regency');
  });
  it('Recent History offers decades', () => {
    const p = mk({ periodId: 'r' });
    const sel = screen.getByLabelText('Decade') as HTMLSelectElement;
    expect([...sel.options].map((o) => o.value)).toEqual(['', '1950s', '1960s', '1970s', '1980s', '1990s', '2000s', '2010s']);
    fireEvent.change(sel, { target: { value: '1980s' } });
    expect(p.onDetail).toHaveBeenCalledWith('1980s');
  });
  it('other periods have no detail box', () => {
    mk({ periodId: 'f' });
    expect(screen.queryByLabelText('Decade')).toBeNull();
    expect(screen.queryByLabelText('Historical era')).toBeNull();
  });
  it('removes a period from the list after confirming', () => {
    const p = mk();
    fireEvent.click(screen.getByRole('button', { name: 'Manage list' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Future from the list' }));
    expect(p.onRemove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Future' }));
    expect(p.onRemove).toHaveBeenCalledWith('f');
  });
  it('renames a period', () => {
    const p = mk();
    fireEvent.click(screen.getByRole('button', { name: 'Manage list' }));
    const box = screen.getByLabelText('Rename Future');
    fireEvent.change(box, { target: { value: 'Far Future' } });
    fireEvent.blur(box);
    expect(p.onRename).toHaveBeenCalledWith('f', 'Far Future');
  });
});

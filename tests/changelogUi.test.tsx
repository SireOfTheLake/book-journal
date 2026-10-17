// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ChangelogModal, { releases } from '../src/changelog/ChangelogModal';
import ReadPicker from '../src/pages/challenges/ReadPicker';
import type { Candidate } from '../src/repo/challenges';

beforeEach(() => { cleanup(); try { localStorage.clear(); } catch { /* ignore */ } });

describe("What's new", () => {
  it('shows the current version and hides earlier ones until asked', () => {
    const onClose = vi.fn();
    render(<ChangelogModal onClose={onClose} />);
    expect(screen.getByText(`Version ${releases[0].version}`)).toBeTruthy();
    expect(screen.getByText('Current')).toBeTruthy();
    if (releases.length > 1) {
      expect(screen.queryByText(`Version ${releases[1].version}`)).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: /Earlier versions/ }));
      expect(screen.getByText(`Version ${releases[1].version}`)).toBeTruthy();
    }
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});

const cand = (n: number): Candidate => ({ read_id: `r${n}`, book_id: `b${n}`, title: `Book ${n}`, authors: 'A', series: null, status: 'finished', when: null, used_on: null } as unknown as Candidate);

describe('book picker keys', () => {
  it('moves with the arrow keys and chooses with Enter', async () => {
    const onPick = vi.fn();
    render(<ReadPicker prompt="P" search={async () => [cand(1), cand(2), cand(3)]} onPick={onPick} onClose={() => undefined} />);
    const box = await screen.findByLabelText('Search books');
    await screen.findByText('Book 3');
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    fireEvent.keyDown(box, { key: 'ArrowUp' });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onPick).toHaveBeenCalledWith('r2');
  });
  it('Enter picks the first book when you have only typed', async () => {
    const onPick = vi.fn();
    render(<ReadPicker prompt="P" search={async () => [cand(1), cand(2)]} onPick={onPick} onClose={() => undefined} />);
    await screen.findByText('Book 2');
    fireEvent.keyDown(screen.getByLabelText('Search books'), { key: 'Enter' });
    expect(onPick).toHaveBeenCalledWith('r1');
  });
});

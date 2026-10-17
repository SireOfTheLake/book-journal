// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BootScreen } from '../src/db/DbContext';

describe('start-up screen', () => {
  it('shows a calm loading state', () => {
    render(<BootScreen />);
    expect(screen.getByText('Opening your journal...')).toBeTruthy();
  });
  it('explains a failure, offers Try again, and tucks the technical text away', () => {
    const retry = vi.fn();
    render(<BootScreen error="migration 1 was previously applied but has been modified" onRetry={retry} />);
    expect(screen.getByText(/Your books and notes are safe/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalled();
    expect(screen.getByText(/migration 1 was previously applied/).closest('details')).not.toBeNull();
  });
});

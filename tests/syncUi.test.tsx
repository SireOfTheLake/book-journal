// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import SyncCard from '../src/pages/settings/SyncCard';

afterEach(cleanup);
describe('Sync settings', () => {
  it('starts as not set up, with Save waiting for both fields', () => {
    render(<SyncCard />);
    expect(screen.getByRole('status').textContent).toContain('Not set up');
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Sync now' })).toBeNull();
  });
});

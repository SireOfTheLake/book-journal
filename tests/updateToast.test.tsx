// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import UpdateToast from '../src/update/UpdateToast';
import { tauriUpdateEnv, type UpdateEnv } from '../src/update/update';

afterEach(cleanup);
const found = (install = vi.fn(async () => undefined)): UpdateEnv => ({ check: async () => ({ version: '0.2.0', notes: 'Adds the series arrows\nand more', install }) });

describe('the update notice', () => {
  it('stays quiet when there is no update, or the check fails', async () => {
    const { container, rerender } = render(<UpdateToast env={{ check: async () => null }} delayMs={0} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(container.innerHTML).toBe('');
    rerender(<UpdateToast env={{ check: async () => { throw new Error('offline'); } }} delayMs={0} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(container.innerHTML).toBe('');
  });
  it('announces a new version, and can be dismissed', async () => {
    render(<UpdateToast env={found()} delayMs={0} />);
    await screen.findByText('Version 0.2.0 is available');
    expect(screen.getByText('Adds the series arrows')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss the update notice' }));
    expect(screen.queryByText('Version 0.2.0 is available')).toBeNull();
  });
  it('installs when asked, and says so if that fails', async () => {
    const install = vi.fn(async () => { throw new Error('boom'); });
    render(<UpdateToast env={found(install)} delayMs={0} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Update and restart' }));
    await waitFor(() => expect(install).toHaveBeenCalledTimes(1));
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
  it('does nothing outside the app window', async () => {
    expect(await tauriUpdateEnv.check()).toBeNull();
  });
});

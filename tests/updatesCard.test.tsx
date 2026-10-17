// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import UpdatesCard from '../src/pages/settings/UpdatesCard';
import { explainUpdateError, type UpdateEnv } from '../src/update/update';
import { buildExtra } from '../scripts/updaterConfig.mjs';

afterEach(cleanup);
const env = (check: UpdateEnv['check']): UpdateEnv => ({ check, version: async () => '0.1.1' });

describe('Settings > App updates', () => {
  it('shows the version and says when you are up to date', async () => {
    render(<UpdatesCard env={env(async () => null)} />);
    await screen.findByText(/version 0.1.1/);
    fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }));
    expect(await screen.findByText(/You are up to date/)).toBeTruthy();
  });
  it('offers the new version and installs it on request', async () => {
    const install = vi.fn(async () => undefined);
    render(<UpdatesCard env={env(async () => ({ version: '0.1.2', notes: 'More stickers', install }))} />);
    fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Update to 0.1.2 and restart' }));
    await waitFor(() => expect(install).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/Version 0.1.2 is available|Downloading/)).toBeTruthy();
  });
  it('explains a failed check, with the raw text tucked away', async () => {
    render(<UpdatesCard env={env(async () => { throw new Error('Could not fetch a valid release JSON from the remote'); })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }));
    expect(await screen.findByText(/No published release was found/)).toBeTruthy();
    expect(screen.getByText(/Could not fetch a valid release JSON/).closest('details')).not.toBeNull();
  });
  it('recognizes the usual causes', () => {
    expect(explainUpdateError('signature verification failed')).toMatch(/different key/);
    expect(explainUpdateError('error sending request: dns error')).toMatch(/could not be reached/);
    expect(explainUpdateError('weird')).toMatch(/did not work/);
  });
});

describe('update settings in the build', () => {
  it('keeps the placeholder address out of the app', () => {
    const conf = readFileSync('src-tauri/tauri.conf.json', 'utf8');
    expect(conf).not.toContain('YOUR-GITHUB-NAME');
    expect(conf).toContain('SireOfTheLake/book-journal/releases/latest/download/latest.json');
  });
  it('takes the key from updater-pubkey.txt and refuses a signed build without it', () => {
    expect(buildExtra({ pubkey: ' KEY\n', sign: true })).toEqual({ plugins: { updater: { pubkey: 'KEY' } }, bundle: { createUpdaterArtifacts: true } });
    expect(buildExtra({ pubkey: '', sign: false })).toEqual({});
    expect(() => buildExtra({ pubkey: '', sign: true })).toThrow(/updater-pubkey/);
  });
});

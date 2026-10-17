// A newer version of the app that is ready to install. install() downloads it, installs it and restarts the app.
export interface PendingUpdate { version: string; notes: string | null; install(): Promise<void> }
export interface UpdateEnv { check(): Promise<PendingUpdate | null>; version?(): Promise<string | null> }

// The real thing, only inside the app window: asks the update address in the app's settings (GitHub) whether a newer version exists.
export const tauriUpdateEnv: UpdateEnv = {
  async version() {
    if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return null;
    const { getVersion } = await import('@tauri-apps/api/app');
    return getVersion();
  },
  async check() {
    if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return null;
    const { check } = await import('@tauri-apps/plugin-updater');
    const found = await check();
    if (!found) return null;
    return {
      version: found.version,
      notes: found.body ?? null,
      async install() {
        await found.downloadAndInstall();
        const { relaunch } = await import('@tauri-apps/plugin-process');
        await relaunch();
      },
    };
  },
};

// Puts a failed check into plain words, most likely cause first. The original text is always shown too.
export function explainUpdateError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('signature') || m.includes('pubkey') || m.includes('public key')) return 'The newest version is signed with a different key than this copy of the app expects. Install the newest Book Journal Setup.exe once by hand; updates work by themselves after that.';
  if (m.includes('404') || m.includes('valid release json') || m.includes('not found') || m.includes('status code')) return 'No published release was found at the update address. A release is published with "npm run release -- X.Y.Z" (a plain push does not publish one), and GitHub has to finish building it first.';
  if (m.includes('endpoint') || m.includes('url')) return 'The update address in this copy of the app is not valid.';
  if (m.includes('network') || m.includes('connect') || m.includes('dns') || m.includes('timed out') || m.includes('request')) return 'The update address could not be reached. Check the internet connection and try again.';
  return 'The check for updates did not work.';
}

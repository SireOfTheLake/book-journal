// A newer version of the app that is ready to install. install() downloads it, installs it and restarts the app.
export interface PendingUpdate { version: string; notes: string | null; install(): Promise<void> }
export interface UpdateEnv { check(): Promise<PendingUpdate | null> }

// The real thing, only inside the app window: asks the update address in the app's settings (GitHub) whether a newer version exists.
export const tauriUpdateEnv: UpdateEnv = {
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

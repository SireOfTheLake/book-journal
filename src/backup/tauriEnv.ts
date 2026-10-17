import type { BackupEnv } from './backup';

// The real thing: the app's folders, the Save dialog, and file copying, through Tauri.
export async function createTauriBackupEnv(): Promise<BackupEnv> {
  const { appConfigDir, join } = await import('@tauri-apps/api/path');
  const { save } = await import('@tauri-apps/plugin-dialog');
  const fs = await import('@tauri-apps/plugin-fs');
  const root = await join(await appConfigDir(), 'backups');
  return {
    async backupsDir() { await fs.mkdir(root, { recursive: true }); return root; },
    async list(dir) { return (await fs.readDir(dir)).filter((e) => e.isFile).map((e) => e.name); },
    remove: (path) => fs.remove(path),
    copy: (from, to) => fs.copyFile(from, to),
    async pickSavePath(defaultName, kindName, extension) { return save({ defaultPath: defaultName, filters: [{ name: kindName, extensions: [extension] }] }); },
    writeText: (path, text) => fs.writeTextFile(path, text),
    join: (dir, name) => `${dir.replace(/[\\/]+$/, '')}${dir.includes('\\') ? '\\' : '/'}${name}`,
    now: () => new Date(),
  };
}

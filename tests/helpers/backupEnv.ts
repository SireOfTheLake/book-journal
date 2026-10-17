import { copyFileSync, mkdtempSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BackupEnv } from '../../src/backup/backup';

// A backup environment that uses real folders in a temporary place, with a clock and Save dialog you control.
export function tempBackupEnv(opts: { pick?: () => string | null; failCopy?: boolean; clock?: () => Date } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'bj-ui-backups-'));
  const elsewhere = mkdtempSync(join(tmpdir(), 'bj-ui-elsewhere-'));
  const env: BackupEnv = {
    backupsDir: async () => dir,
    list: async (d) => readdirSync(d),
    remove: async (p) => unlinkSync(p),
    copy: async (a, b) => { if (opts.failCopy) throw new Error('The drive is full.'); copyFileSync(a, b); },
    pickSavePath: async (name) => (opts.pick ? opts.pick() : join(elsewhere, name)),
    writeText: async (p, t) => writeFileSync(p, t),
    join: (d, n) => join(d, n),
    now: opts.clock ?? (() => new Date()),
  };
  return { env, dir, elsewhere, cleanup: () => { rmSync(dir, { recursive: true, force: true }); rmSync(elsewhere, { recursive: true, force: true }); } };
}

import type { Db } from '../db/adapter';

// The newest database change this copy of the app knows about. A test keeps it equal to the real newest migration.
export const SCHEMA_VERSION = 35;

export type Compatibility = 'same' | 'this_is_older' | 'this_is_newer';

/** Devices can only sync when they are on the same database version. The older one has to update first. */
export function compareVersions(local: number, remote: number): Compatibility {
  return local === remote ? 'same' : local < remote ? 'this_is_older' : 'this_is_newer';
}
export const canSync = (local: number, remote: number) => compareVersions(local, remote) === 'same';

/** The version this device's database is really at (inside the app), or this build's own version otherwise. */
export async function databaseVersion(db: Db): Promise<number> {
  try {
    const [r] = await db.select<{ v: number | null }>('SELECT max(version) AS v FROM _sqlx_migrations WHERE success = 1');
    if (r?.v) return Number(r.v);
  } catch { /* not running inside the app */ }
  return SCHEMA_VERSION;
}

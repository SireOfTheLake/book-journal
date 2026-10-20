import type { Db } from './adapter';

// Lets other parts of the app hear that something was written to the journal (used to send changes to the cloud soon after).
const listeners = new Set<() => void>();
export const onLocalWrite = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const RAW = Symbol('rawDb');

export function withWriteNotifier(db: Db): Db {
  const wrapped: Db = {
    async execute(sql, params) { await db.execute(sql, params); for (const l of listeners) l(); },
    select: (sql, params) => db.select(sql, params),
  };
  (wrapped as unknown as Record<symbol, Db>)[RAW] = db;
  return wrapped;
}
/** The database without the notifier. The sync itself writes through this, so its own writes do not trigger another sync. */
export const rawDb = (db: Db): Db => (db as unknown as Record<symbol, Db>)[RAW] ?? db;

import type { Db } from '../db/adapter';
import { syncedTables } from './schema';

/** How many changes made on this device are still waiting to be sent to the cloud. */
export async function pendingChanges(db: Db): Promise<number> {
  let n = 0;
  for (const t of await syncedTables(db)) {
    const [m] = await db.select<{ value: string }>('SELECT value FROM app_setting WHERE key = ?', [`sync_push:${t.name}`]);
    const [r] = await db.select<{ n: number }>(`SELECT count(*) AS n FROM "${t.name}" WHERE updated_at > ?`, [m?.value ?? '']);
    n += Number(r?.n ?? 0);
  }
  return n;
}

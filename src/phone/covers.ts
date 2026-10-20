import type { SupabaseClient } from '@supabase/supabase-js';
import { idbClear, idbCount, idbGet, idbSet } from './idb';

// Cover pictures are big (about 76 MB for the whole library), so the phone does not fetch them with the rest of the journal.
// They are downloaded when asked (on Wi-Fi), kept in the phone's storage, and then new ones arrive with each sync.
// An iPhone web app cannot tell Wi-Fi from mobile data, so the person chooses the moment.

const PAGE = 12;
export interface CoverRow { id: string; file_path: string | null; deleted_at: string | null; synced_at: string }

export interface CoverSource {
  page(after: string | null, limit: number): Promise<CoverRow[]>;
  count(): Promise<number>;
}

export function supabaseCoverSource(client: SupabaseClient): CoverSource {
  return {
    async page(after, limit) {
      let q = client.from('image').select('id, file_path, deleted_at, synced_at').order('synced_at', { ascending: true }).limit(limit);
      if (after) q = q.gt('synced_at', after);
      const { data, error } = await q;
      if (error) throw new Error(`Could not read covers: ${error.message}`);
      return (data ?? []) as CoverRow[];
    },
    async count() {
      const { count, error } = await client.from('image').select('id', { count: 'exact', head: true }).is('deleted_at', null);
      if (error) throw new Error(`Could not count covers: ${error.message}`);
      return count ?? 0;
    },
  };
}

const CURSOR = 'cover_cursor';
const ENABLED = 'covers_enabled';

export const coversEnabled = async () => (await idbGet<boolean>('kv', ENABLED)) === true;
export const storedCoverCount = () => idbCount('covers');

/** Downloads every cover that is new since last time. Returns how many were stored. `onProgress` is called after each batch. */
export async function downloadCovers(src: CoverSource, onProgress?: (stored: number) => void, shouldStop: () => boolean = () => false): Promise<number> {
  await idbSet('kv', ENABLED, true);
  let cursor = (await idbGet<string>('kv', CURSOR)) ?? null;
  let stored = 0;
  for (;;) {
    if (shouldStop()) break;
    const rows = await src.page(cursor, PAGE);
    for (const r of rows) {
      if (r.deleted_at || !r.file_path) await idbSet('covers', r.id, null);
      else { await idbSet('covers', r.id, r.file_path); stored++; }
      memory.delete(r.id);
    }
    if (rows.length) { cursor = rows[rows.length - 1].synced_at; await idbSet('kv', CURSOR, cursor); onProgress?.(stored); }
    if (rows.length < PAGE) break;
  }
  return stored;
}

/** Run after each sync: fetches only covers that are new, and only once the person has chosen to download covers. */
export async function topUpCovers(src: CoverSource): Promise<number> {
  if (!(await coversEnabled())) return 0;
  return downloadCovers(src);
}

export async function removeAllCovers() {
  await idbClear('covers');
  await idbSet('kv', CURSOR, null);
  await idbSet('kv', ENABLED, false);
  memory.clear();
}

// A small in-memory cache so scrolling a list does not reopen storage for every picture.
const memory = new Map<string, string | null>();
export async function coverData(imageId: string): Promise<string | null> {
  if (memory.has(imageId)) return memory.get(imageId) ?? null;
  const v = (await idbGet<string | null>('covers', imageId)) ?? null;
  if (memory.size > 120) memory.delete(memory.keys().next().value as string);
  memory.set(imageId, v);
  return v;
}

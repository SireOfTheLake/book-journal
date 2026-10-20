import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Transport } from './engine';
import type { RemoteRow } from './schema';

export interface CloudConfig { url: string; anonKey: string }

export function makeClient(c: CloudConfig): SupabaseClient {
  return createClient(c.url.trim(), c.anonKey.trim(), { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'book-journal-cloud-login' } });
}

const fail = (what: string, e: { message: string } | null) => { if (e) throw new Error(`${what}: ${e.message}`); };

// Talks to the tables made by supabase/schema.sql.
export function supabaseTransport(client: SupabaseClient): Transport {
  return {
    async schemaVersion() {
      const { data, error } = await client.from('sync_schema').select('version').limit(1);
      fail('Could not read the cloud database version. Has the setup script been run?', error);
      if (!data?.length) throw new Error('The cloud database has no version yet. Run the setup script in Supabase.');
      return Number((data[0] as { version: number }).version);
    },
    async pull(table, after, limit) {
      let q = client.from(table).select('*').order('synced_at', { ascending: true }).limit(limit);
      if (after) q = q.gt('synced_at', after);
      const { data, error } = await q;
      fail(`Could not read ${table} from the cloud`, error);
      const rows = (data ?? []) as Record<string, unknown>[];
      const cursor = rows.length ? (rows[rows.length - 1].synced_at as string) : after;
      return { rows: rows.map(({ user_id: _u, synced_at: _s, ...r }) => r as RemoteRow), cursor };
    },
    async push(table, rows) {
      const { error } = await client.from(table).upsert(rows, { onConflict: table === 'app_setting' ? 'key' : 'id' });
      fail(`Could not send ${table} to the cloud`, error);
    },
  };
}

/** Calls `onPing` whenever any device changes something, so this one can fetch it straight away. Returns a way to stop. */
export function watchPings(client: SupabaseClient, onPing: () => void): () => void {
  const ch = client.channel('book-journal-ping').on('postgres_changes', { event: '*', schema: 'public', table: 'sync_ping' }, () => onPing()).subscribe();
  return () => { void client.removeChannel(ch); };
}

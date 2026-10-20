import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useDb } from '../db/DbContext';
import { onLocalWrite, rawDb } from '../db/notify';
import { syncOnce, SyncVersionError } from './engine';
import { makeClient, supabaseTransport, watchPings, type CloudConfig } from './supabaseTransport';

export type SyncState = 'off' | 'signed_out' | 'idle' | 'syncing' | 'problem';
interface Ctx {
  state: SyncState; message: string | null; lastSyncedAt: Date | null; email: string | null; config: CloudConfig | null;
  /** The connection to the cloud, once the address and key are saved. */
  client: SupabaseClient | null;
  /** Changes whenever other devices' changes were brought in, so screens can reload. */
  dataVersion: number;
  saveConfig(c: CloudConfig): Promise<void>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  syncNow(): Promise<void>;
}
const noop = async () => undefined;
const SyncCtx = createContext<Ctx>({ state: 'off', message: null, lastSyncedAt: null, email: null, config: null, client: null, dataVersion: 0, saveConfig: noop, signIn: noop, signOut: noop, syncNow: noop });
export const useSync = () => useContext(SyncCtx);

const get = async (db: ReturnType<typeof rawDb>, k: string) => (await db.select<{ value: string }>('SELECT value FROM app_setting WHERE key = ?', [k]))[0]?.value ?? null;
const put = (db: ReturnType<typeof rawDb>, k: string, v: string) => db.execute("INSERT INTO app_setting (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')", [k, v]);

export function SyncProvider({ children, skipPull, afterSync }: { children: ReactNode; skipPull?: string[]; afterSync?: (client: SupabaseClient) => Promise<number> }) {
  const appDb = useDb();
  const db = useMemo(() => rawDb(appDb), [appDb]);
  const [config, setConfig] = useState<CloudConfig | null>(null);
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [state, setState] = useState<SyncState>('off');
  const [message, setMessage] = useState<string | null>(null);
  const [lastSyncedAt, setLast] = useState<Date | null>(null);
  const [dataVersion, setDataVersion] = useState(0);
  const running = useRef(false);
  const again = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      const url = await get(db, 'sync_url'); const key = await get(db, 'sync_anon_key');
      if (url && key) setConfig({ url, anonKey: key });
      const last = await get(db, 'sync_last_at'); if (last) setLast(new Date(last));
    })().catch(() => undefined);
  }, [db]);

  useEffect(() => {
    if (!config) { setClient(null); setState('off'); return; }
    const c = makeClient(config);
    setClient(c);
    c.auth.getSession().then(({ data }) => { setEmail(data.session?.user.email ?? null); setState(data.session ? 'idle' : 'signed_out'); }, () => setState('signed_out'));
    const { data: sub } = c.auth.onAuthStateChange((_e, session) => { setEmail(session?.user.email ?? null); setState(session ? 'idle' : 'signed_out'); });
    return () => sub.subscription.unsubscribe();
  }, [config]);

  const run = useCallback(async () => {
    if (!client) return;
    if (running.current) { again.current = true; return; }
    const { data } = await client.auth.getSession();
    if (!data.session) return;
    running.current = true; setState('syncing'); setMessage(null);
    try {
      const r = await syncOnce(db, supabaseTransport(client), { skipPull });
      const extra = afterSync ? await afterSync(client).catch(() => 0) : 0;
      const now = new Date();
      await put(db, 'sync_last_at', now.toISOString());
      setLast(now); setState('idle');
      if (r.pulled + extra > 0) setDataVersion((v) => v + 1);
    } catch (e) {
      setState('problem');
      setMessage(e instanceof SyncVersionError || e instanceof Error ? e.message : String(e));
    } finally {
      running.current = false;
      if (again.current) { again.current = false; schedule(500); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, db, skipPull, afterSync]);

  const schedule = useCallback((ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void run(); }, ms);
  }, [run]);

  // Sync when the app opens, shortly after you change something, when another device changes something, and now and then as a safety net.
  useEffect(() => {
    if (!client || state === 'signed_out' || state === 'off') return;
    schedule(300);
    const offWrite = onLocalWrite(() => schedule(1500));
    const stopPing = watchPings(client, () => schedule(200));
    const beat = setInterval(() => schedule(0), 60_000);
    const online = () => schedule(500);
    window.addEventListener('online', online);
    return () => { offWrite(); stopPing(); clearInterval(beat); window.removeEventListener('online', online); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, state === 'signed_out' || state === 'off', schedule]);

  const value = useMemo<Ctx>(() => ({
    state, message, lastSyncedAt, email, config, client, dataVersion,
    async saveConfig(c) { await put(db, 'sync_url', c.url.trim()); await put(db, 'sync_anon_key', c.anonKey.trim()); setConfig({ url: c.url.trim(), anonKey: c.anonKey.trim() }); },
    async signIn(e, p) {
      if (!client) throw new Error('Save the cloud address and key first.');
      const { error } = await client.auth.signInWithPassword({ email: e.trim(), password: p });
      if (error) throw new Error(error.message);
    },
    async signOut() { await client?.auth.signOut(); },
    async syncNow() { await run(); },
  }), [state, message, lastSyncedAt, email, config, dataVersion, client, db, run]);

  return <SyncCtx.Provider value={value}>{children}</SyncCtx.Provider>;
}

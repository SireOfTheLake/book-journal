import { useEffect, useRef, useState } from 'react';
import { useDb } from '../../db/DbContext';
import { rawDb } from '../../db/notify';
import { pendingChanges } from '../../sync/pending';
import { useSync } from '../../sync/SyncContext';
import { downloadCovers, removeAllCovers, storedCoverCount, supabaseCoverSource } from '../covers';

function Covers() {
  const { client } = useSync();
  const [stored, setStored] = useState<number | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stop = useRef(false);

  useEffect(() => {
    void storedCoverCount().then(setStored, () => undefined);
    if (client) void supabaseCoverSource(client).count().then(setTotal, () => undefined);
  }, [client]);

  const start = async () => {
    if (!client) return;
    setBusy(true); setError(null); stop.current = false;
    try { await downloadCovers(supabaseCoverSource(client), () => { void storedCoverCount().then(setStored); }, () => stop.current); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    setStored(await storedCoverCount()); setBusy(false);
  };
  const done = total !== null && stored !== null && stored >= total;
  return (
    <section className="ph-card">
      <span className="ph-label">Book covers</span>
      <p className="ph-note">{stored === null ? '' : `${stored}${total !== null ? ` of ${total}` : ''} covers are on this phone.`} Covers are big (around 76 MB for the whole library), and an iPhone web app cannot tell Wi-Fi from mobile data. So covers download only when you tap the button below. Do it on Wi-Fi. After that, new covers arrive by themselves, a few at a time.</p>
      {error && <div className="ph-err" role="alert">{error}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        {busy
          ? <button type="button" className="ph-btn" style={{ flex: 1 }} onClick={() => { stop.current = true; }}>Stop</button>
          : <button type="button" className="ph-btn primary" style={{ flex: 1, minHeight: 48, fontSize: 15 }} disabled={!client || done} onClick={() => void start()}>{done ? 'All covers downloaded' : stored ? 'Download the rest (use Wi-Fi)' : 'Download covers (use Wi-Fi)'}</button>}
        {!!stored && !busy && <button type="button" className="ph-btn" onClick={() => { if (window.confirm('Remove the covers from this phone? You can download them again.')) void removeAllCovers().then(() => storedCoverCount().then(setStored)); }}>Remove</button>}
      </div>
    </section>
  );
}

export default function SyncScreen() {
  const s = useSync();
  const db = useDb();
  const [pending, setPending] = useState<number | null>(null);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true); const down = () => setOnline(false);
    window.addEventListener('online', up); window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  useEffect(() => { void pendingChanges(rawDb(db)).then(setPending, () => setPending(null)); }, [db, s.state, s.lastSyncedAt]);

  const label = s.state === 'syncing' ? 'Syncing...' : s.state === 'problem' ? 'Needs attention' : s.state === 'idle' ? (pending ? 'Changes waiting to upload' : 'Up to date') : 'Not signed in';
  const dot = s.state === 'syncing' ? 'busy' : s.state === 'problem' || s.state === 'signed_out' ? 'bad' : pending ? 'busy' : '';
  return (
    <>
      <div className="ph-top"><h1>SYNC</h1></div>
      <section className="ph-card">
        <div className="ph-sync-big"><span className={`ph-dot ${dot}`} style={{ width: 12, height: 12 }} />{label}</div>
        <p className="ph-note">{s.lastSyncedAt ? `Last synced ${s.lastSyncedAt.toLocaleString()}` : 'Not synced yet'}{s.email ? ` · Signed in as ${s.email}` : ''}</p>
        {s.message && <div className="ph-err" role="alert">{s.message}</div>}
        <button type="button" className="ph-btn primary" style={{ marginTop: 6 }} disabled={s.state === 'syncing' || !s.email} onClick={() => void s.syncNow()}>Sync now</button>
      </section>

      <section className="ph-card">
        <span className="ph-label">When you&rsquo;re offline</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span className={`ph-dot ${pending ? 'busy' : ''}`} style={{ width: 12, height: 12 }} />{online ? (pending ? `${pending} change${pending === 1 ? '' : 's'} waiting to upload` : 'Everything is uploaded') : `You are offline${pending ? `. ${pending} change${pending === 1 ? '' : 's'} waiting` : ''}`}</div>
        <p className="ph-note">Edits are saved on your phone first and sent the moment you&rsquo;re back online.</p>
      </section>

      <Covers />

      <section className="ph-card">
        <span className="ph-label">Add to Home Screen</span>
        <p style={{ margin: 0, lineHeight: 1.4 }}>In Safari, tap Share, then &ldquo;Add to Home Screen&rdquo;. It opens full screen like a regular app, and iPhone keeps its saved journal as long as it is on your Home Screen.</p>
      </section>

      <section className="ph-card">
        <span className="ph-label">Not on the phone yet</span>
        <p style={{ margin: 0, lineHeight: 1.4 }}>Series, authors, quotes, reading orders and the dashboards stay on the computer for now. Anything you change there shows up here.</p>
      </section>

      <p className="ph-muted ph-small" style={{ textAlign: 'center', marginTop: 16 }}>Phone app version {typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'}</p>

      {s.email && <button type="button" className="ph-btn" style={{ width: '100%', marginTop: 16 }} onClick={() => void s.signOut()}>Sign out</button>}
    </>
  );
}

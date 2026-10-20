import { useState } from 'react';
import { useSync } from '../../sync/SyncContext';
import { makeSetupCode } from '../../sync/setupCode';

const STATE_TEXT = { off: 'Not set up', signed_out: 'Signed out', idle: 'Up to date', syncing: 'Syncing...', problem: 'Needs attention' } as const;

// Settings > Sync: connect this device to your Supabase project, sign in, and see how syncing is going.
export default function SyncCard() {
  const s = useSync();
  const [url, setUrl] = useState(s.config?.url ?? '');
  const [key, setKey] = useState(s.config?.anonKey ?? '');
  const [email, setEmail] = useState(s.email ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const run = async (fn: () => Promise<void>) => { setError(null); try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } };
  return (
    <div className="bcard">
      <span className="lbl2">Sync with your other devices</span>
      <p className="muted">Keeps this journal in step with your other computers and your phone through your own Supabase project. Changes are sent a moment after you make them. Backups still work as before.</p>
      <div className="notice" role="status">{STATE_TEXT[s.state]}{s.email ? ` as ${s.email}` : ''}{s.lastSyncedAt ? `. Last synced ${s.lastSyncedAt.toLocaleString()}.` : '.'}</div>
      {s.message && <div className="muted" role="alert">{s.message}</div>}
      {error && <div className="muted" role="alert">{error}</div>}

      <span className="lbl2">1. Your cloud project</span>
      <label className="stack"><span className="muted">Project URL</span><input className="field" aria-label="Project URL" placeholder="https://xxxx.supabase.co" value={url} onChange={(e) => setUrl(e.target.value)} /></label>
      <label className="stack"><span className="muted">Public (anon) key</span><input className="field" aria-label="Public key" value={key} onChange={(e) => setKey(e.target.value)} /></label>
      <div className="actions"><button type="button" className="btn" disabled={!url.trim() || !key.trim()} onClick={() => run(() => s.saveConfig({ url, anonKey: key }))}>Save</button></div>

      {s.config && s.state !== 'idle' && s.state !== 'syncing' && s.state !== 'problem' && (
        <>
          <span className="lbl2">2. Sign in</span>
          <label className="stack"><span className="muted">Email</span><input className="field" aria-label="Email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label className="stack"><span className="muted">Password</span><input className="field" type="password" aria-label="Password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void run(() => s.signIn(email, password))} /></label>
          <div className="actions"><button type="button" className="btn on" onClick={() => run(async () => { await s.signIn(email, password); setPassword(''); })}>Sign in</button></div>
        </>
      )}
      {s.email && (
        <div className="actions">
          <button type="button" className="btn on" disabled={s.state === 'syncing'} onClick={() => run(s.syncNow)}>Sync now</button>
          <button type="button" className="btn" onClick={() => run(s.signOut)}>Sign out</button>
        </div>
      )}
      {s.config && (
        <>
          <span className="lbl2">Set up your phone</span>
          <p className="muted small">On the phone, open the Book Journal web page, paste this code, then sign in with the same email and password. It carries the cloud address and key so you do not have to type them.</p>
          <div className="actions">
            <button type="button" className="btn" onClick={() => run(async () => { await navigator.clipboard.writeText(makeSetupCode(s.config!)); setCopied(true); setTimeout(() => setCopied(false), 3000); })}>{copied ? 'Copied' : 'Copy phone setup code'}</button>
          </div>
        </>
      )}
      <span className="muted small">Your password is not kept in the journal. This device stays signed in until you sign out.</span>
    </div>
  );
}

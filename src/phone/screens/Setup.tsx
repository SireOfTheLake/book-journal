import { useState } from 'react';
import { useSync } from '../../sync/SyncContext';
import { readSetupCode } from '../../sync/setupCode';

// First run on a phone: paste the setup code from the computer, then sign in.
export default function Setup() {
  const s = useSync();
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const needCode = !s.config;

  const go = async () => {
    setError(null); setBusy(true);
    try {
      if (needCode) { await s.saveConfig(readSetupCode(code)); }
      await s.signIn(email, password);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };
  return (
    <div className="ph-setup">
      <h1>BOOK JOURNAL</h1>
      <p className="ph-muted">{needCode ? 'Connect this phone to your journal. On your computer, open Settings > Sync and tap "Copy phone setup code", then paste it here.' : 'Sign in to bring your journal onto this phone.'}</p>
      {error && <div className="ph-err" role="alert">{error}</div>}
      {needCode && <label className="ph-field" style={{ display: 'block' }}><span className="ph-label">Setup code</span><textarea className="ph-textarea" aria-label="Setup code" value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="off" autoCorrect="off" spellCheck={false} /></label>}
      <label className="ph-field" style={{ display: 'block' }}><span className="ph-label">Email</span><input className="ph-input" type="email" autoComplete="username" aria-label="Email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label className="ph-field" style={{ display: 'block' }}><span className="ph-label">Password</span><input className="ph-input" type="password" autoComplete="current-password" aria-label="Password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void go()} /></label>
      <button type="button" className="ph-btn primary" style={{ marginTop: 20 }} disabled={busy || !email || !password || (needCode && !code.trim())} onClick={() => void go()}>{busy ? 'Signing in...' : 'Sign in'}</button>
    </div>
  );
}

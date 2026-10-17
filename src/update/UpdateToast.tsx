import { useEffect, useState } from 'react';
import { tauriUpdateEnv, type PendingUpdate, type UpdateEnv } from './update';

// A small notice in the corner when a newer version of the app is available. It can be dismissed (it comes back the next time the app starts).
export default function UpdateToast({ env = tauriUpdateEnv, delayMs = 3000 }: { env?: UpdateEnv; delayMs?: number }) {
  const [update, setUpdate] = useState<PendingUpdate | null>(null);
  const [state, setState] = useState<'idle' | 'installing' | 'failed'>('idle');
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => { env.check().then((u) => { if (live) setUpdate(u); }, () => undefined); }, delayMs); // no internet or no update address: stay quiet
    return () => { live = false; clearTimeout(t); };
  }, [env, delayMs]);
  if (!update) return null;
  const go = async () => { setState('installing'); try { await update.install(); } catch { setState('failed'); } };
  return (
    <div className="toast" role="status" aria-live="polite">
      <div className="toasttext">
        <b>{`Version ${update.version} is available`}</b>
        {update.notes && <span className="muted small">{update.notes.split('\n')[0]}</span>}
        {state === 'installing' && <span className="muted small">Downloading and installing... the app restarts when it is done.</span>}
        {state === 'failed' && <span className="muted small" role="alert">The update did not install. Try again, or install it later.</span>}
      </div>
      <div className="toastbtns">
        <button type="button" className="btn on" disabled={state === 'installing'} onClick={go}>{state === 'failed' ? 'Try again' : 'Update and restart'}</button>
        <button type="button" className="quiet" aria-label="Dismiss the update notice" disabled={state === 'installing'} onClick={() => setUpdate(null)}>Later</button>
      </div>
    </div>
  );
}

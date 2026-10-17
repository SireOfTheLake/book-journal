import { useEffect, useState } from 'react';
import { explainUpdateError, tauriUpdateEnv, type PendingUpdate, type UpdateEnv } from '../../update/update';

type State = { kind: 'idle' } | { kind: 'checking' } | { kind: 'current' } | { kind: 'found'; update: PendingUpdate } | { kind: 'installing'; update: PendingUpdate } | { kind: 'error'; message: string };

// Settings > App updates: the manual way to look for a new version and install it (the corner notice does the same by itself).
export default function UpdatesCard({ env = tauriUpdateEnv }: { env?: UpdateEnv }) {
  const [version, setVersion] = useState<string | null>(null);
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  useEffect(() => { env.version?.().then(setVersion, () => undefined); }, [env]);

  const check = async () => {
    setState({ kind: 'checking' });
    try {
      const u = await env.check();
      setCheckedAt(new Date());
      setState(u ? { kind: 'found', update: u } : { kind: 'current' });
    } catch (e) { setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) }); }
  };
  const install = async (update: PendingUpdate) => {
    setState({ kind: 'installing', update });
    try { await update.install(); } catch (e) { setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) }); }
  };
  const busy = state.kind === 'checking' || state.kind === 'installing';

  return (
    <div className="bcard">
      <span className="lbl2">App updates</span>
      <p className="muted">{version ? `You have Book Journal version ${version}.` : 'Book Journal checks for a new version by itself each time it starts. You can also check here.'} Your journal is not touched by an update.</p>
      <div className="pictools">
        <button type="button" className="btn on" disabled={busy} onClick={check}>{state.kind === 'checking' ? 'Checking...' : 'Check for updates'}</button>
        {state.kind === 'found' && <button type="button" className="btn" onClick={() => install(state.update)}>{`Update to ${state.update.version} and restart`}</button>}
      </div>
      {state.kind === 'current' && <div className="notice" role="status">{`You are up to date${version ? ` (version ${version})` : ''}.${checkedAt ? ` Checked ${checkedAt.toLocaleTimeString()}.` : ''}`}</div>}
      {state.kind === 'found' && <div className="notice" role="status">{`Version ${state.update.version} is available.`}{state.update.notes ? ` ${state.update.notes.split('\n')[0]}` : ''}</div>}
      {state.kind === 'installing' && <div className="muted" role="status">Downloading and installing... the app restarts when it is done.</div>}
      {state.kind === 'error' && (
        <div role="alert" className="updateerr">
          <p>{explainUpdateError(state.message)}</p>
          <details><summary className="muted small">Technical details</summary><code>{state.message}</code></details>
        </div>
      )}
    </div>
  );
}

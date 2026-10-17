import { useEffect, useMemo, useState } from 'react';
import changelogText from '../../CHANGELOG.md?raw';
import { parseChangelog } from './parse';

const SEEN_KEY = 'bj.changelog.seen';
export const releases = parseChangelog(changelogText);

function read(): string | null { try { return localStorage.getItem(SEEN_KEY); } catch { return null; } }
function write(v: string) { try { localStorage.setItem(SEEN_KEY, v); } catch { /* remembering is a convenience */ } }

// "What's new": the sidebar button (with a dot until you have looked at the newest version) and the window it opens.
export function useChangelog() {
  const latest = releases[0]?.version ?? null;
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState<string | null>(read);
  const show = () => { setOpen(true); if (latest) { write(latest); setSeen(latest); } };
  return { open, show, close: () => setOpen(false), unseen: !!latest && seen !== latest };
}

export default function ChangelogModal({ onClose }: { onClose(): void }) {
  const [older, setOlder] = useState(false);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  const [current, ...previous] = releases;
  const body = useMemo(() => (r: (typeof releases)[number]) => r.groups.map((g) => (
    <div className="clgroup" key={g.title}>
      {g.title && <h4 className="cltitle">{g.title}</h4>}
      <ul>{g.items.map((it, i) => <li key={i}>{it}</li>)}</ul>
    </div>
  )), []);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog cldlg" role="dialog" aria-modal="true" aria-label="What's new">
        <h2 className="pagetitle small2">WHAT'S NEW</h2>
        <div className="clscroll">
          {!current && <p className="muted">No release notes yet.</p>}
          {current && (
            <section className="clrelease clcurrent">
              <div className="clhead"><span className="clver">Version {current.version}</span><span className="chip on tiny">Current</span>{current.date && <span className="muted small">{current.date}</span>}</div>
              {body(current)}
            </section>
          )}
          {previous.length > 0 && (
            <button type="button" className="btn quiet clmore" aria-expanded={older} onClick={() => setOlder(!older)}>{older ? 'Hide earlier versions' : `Earlier versions (${previous.length})`}</button>
          )}
          {older && previous.map((r) => (
            <section className="clrelease" key={r.version}>
              <div className="clhead"><span className="clver">Version {r.version}</span>{r.date && <span className="muted small">{r.date}</span>}</div>
              {body(r)}
            </section>
          ))}
        </div>
        <div className="actions"><span className="grow" /><button type="button" className="btn" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}

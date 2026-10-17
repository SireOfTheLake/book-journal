import { useState, type ReactNode } from 'react';
import type { Item } from '../../repo/bookLog';
import type { LinkRef } from '../../repo/people';
import { Card, EditNotes, FilePicker, LinkImageForm, ZoomImage } from '../bookLog/parts';

export interface PersonActions {
  update(f: Record<string, string | number | null>): void;
  addAlias(name: string): void; removeAlias(id: string): void;
  addLink(label: string, url: string): void | Promise<void>; removeLink(index: number): void;
  setPhoto(file: File): void; setPhotoUrl(url: string): Promise<void>; removePhoto(): void;
}

// The left column shared by author and narrator pages: photo, other names, links, notes.
export default function PersonSide({ photo, name, aliases, aliasLabel, links, notes, act, children }:
  { photo: string | null; name: string; aliases: Item[]; aliasLabel: string; links: LinkRef[]; notes: string | null; act: PersonActions; children?: ReactNode }) {
  const [alias, setAlias] = useState('');
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const addLink = async () => { setError(null); try { await act.addLink(label, url); setLabel(''); setUrl(''); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } };
  return (
    <div className="bl-left">
      <div className="mainart square">{photo ? <ZoomImage src={photo} alt={`Photo of ${name}`} /> : <span className="muted">No photo</span>}</div>
      <div className="pictools">
        <FilePicker label={photo ? 'Replace photo' : 'Add photo'} onFile={act.setPhoto} />
        <LinkImageForm label="Photo from a link" onUrl={act.setPhotoUrl} />
        {photo && <button type="button" className="mini" onClick={act.removePhoto}>Remove photo</button>}
      </div>
      <Card label={aliasLabel}>
        <div className="chips">{aliases.map((a) => <span key={a.id} className="chip" style={{ borderColor: 'var(--line2)' }}>{a.name}<button type="button" className="x" aria-label={`Remove ${a.name}`} onClick={() => act.removeAlias(a.id)}>&times;</button></span>)}</div>
        <input className="field small" placeholder="+ Add a name" aria-label={`Add ${aliasLabel.toLowerCase()}`} value={alias} onChange={(e) => setAlias(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && alias.trim()) { act.addAlias(alias); setAlias(''); } }} />
      </Card>
      {children}
      <Card label="Links">
        {links.map((l, i) => (
          <div className="relline" key={i}><span className="grow"><b>{l.label}</b><br /><span className="muted small">{l.url}</span></span>
            <button type="button" className="mini" onClick={() => navigator.clipboard?.writeText(l.url)}>Copy</button>
            <button type="button" className="mini" aria-label={`Remove ${l.label}`} onClick={() => act.removeLink(i)}>&times;</button></div>
        ))}
        <input className="field small" placeholder="Label (Website, Audible...)" aria-label="Link label" value={label} onChange={(e) => setLabel(e.target.value)} />
        <input className="field small" placeholder="Address" aria-label="Link address" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addLink()} />
        <button type="button" className="mini" onClick={addLink}>Add link</button>
        {error && <span className="muted" role="alert">{error}</span>}
      </Card>
      <Card label="Notes"><EditNotes label="Notes" addLabel="Add notes" value={notes} onCommit={(v) => act.update({ notes: v.trim() || null })} /></Card>
    </div>
  );
}

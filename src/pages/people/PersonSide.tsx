import { useState, type ReactNode } from 'react';
import type { Item } from '../../repo/bookLog';
import type { LinkRef } from '../../repo/people';
import { openExternal } from '../../ui/openExternal';
import { Card, EditNotes, FilePicker, LinkImageForm, ZoomImage } from '../bookLog/parts';

export interface PersonActions {
  update(f: Record<string, string | number | null>): void;
  addAlias(name: string): void; removeAlias(id: string): void;
  addLink(label: string, url: string): void | Promise<void>; removeLink(index: number): void; updateLink(index: number, label: string, url: string): void | Promise<void>;
  setPhoto(file: File): void; setPhotoUrl(url: string): Promise<void>; removePhoto(): void;
}

// One saved link: the label opens it, the web address sits under it, and the pencil and cross are on the label's line, on the right.
function LinkRow({ link, onSave, onRemove }: { link: LinkRef; onSave(label: string, url: string): void | Promise<void>; onRemove(): void }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(link.label);
  const [url, setUrl] = useState(link.url);
  const [error, setError] = useState<string | null>(null);
  const start = () => { setLabel(link.label); setUrl(link.url); setError(null); setEditing(true); };
  const save = async () => { try { await onSave(label, url); setEditing(false); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } };
  if (editing) {
    return (
      <div className="linkrow editing">
        <input className="field small" aria-label="Edit link label" value={label} onChange={(e) => setLabel(e.target.value)} />
        <input className="field small" aria-label="Edit link address" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void save(); if (e.key === 'Escape') setEditing(false); }} />
        <div className="actions"><button type="button" className="mini" onClick={() => void save()}>Save</button><button type="button" className="mini" onClick={() => setEditing(false)}>Cancel</button></div>
        {error && <span className="muted" role="alert">{error}</span>}
      </div>
    );
  }
  return (
    <div className="linkrow">
      <div className="linkhead">
        <a className="linklabel l" href={link.url} title={link.url} onClick={(e) => { e.preventDefault(); void openExternal(link.url); }}>{link.label}</a>
        <button type="button" className="iconbtn" aria-label={`Edit ${link.label}`} title="Edit" onClick={start}>&#9998;</button>
        <button type="button" className="iconbtn" aria-label={`Remove ${link.label}`} title="Remove" onClick={onRemove}>&times;</button>
      </div>
      <span className="linkurl muted small" title={link.url}>{link.url}</span>
    </div>
  );
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
        {links.map((l, i) => <LinkRow key={`${i}:${l.label}:${l.url}`} link={l} onSave={(lb, u) => act.updateLink(i, lb, u)} onRemove={() => act.removeLink(i)} />)}
        <input className="field small" placeholder="Label (Website, Audible...)" aria-label="Link label" value={label} onChange={(e) => setLabel(e.target.value)} />
        <input className="field small" placeholder="Address" aria-label="Link address" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addLink()} />
        <button type="button" className="mini" onClick={addLink}>Add link</button>
        {error && <span className="muted" role="alert">{error}</span>}
      </Card>
      <Card label="Notes"><EditNotes label="Notes" addLabel="Add notes" value={notes} onCommit={(v) => act.update({ notes: v.trim() || null })} /></Card>
    </div>
  );
}

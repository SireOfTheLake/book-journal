import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AddFromWebDialog from '../pages/AddFromWebDialog';
import { decodeClipUrl } from './link';
import type { BookClip } from './types';

/** The event a bookjournal:// link arrives as (the desktop app listens for the real thing and sends the same event). */
export const CLIP_EVENT = 'book-journal-link';
let launchHandled = false; // the link the app was started with is read once

async function bringForward() {
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const w = getCurrentWindow();
    await w.unminimize(); await w.show(); await w.setFocus();
  } catch { /* not in the desktop app */ }
}

// Listens for books sent by the browser extension and shows the Add to library window.
export default function ClipHost({ onSaved }: { onSaved?(): void }) {
  const [clip, setClip] = useState<BookClip | null>(null);
  const nav = useNavigate();

  useEffect(() => {
    const take = (links: string[] | null | undefined) => {
      for (const l of links ?? []) { const c = decodeClipUrl(l); if (c) { setClip(c); void bringForward(); } }
    };
    const onEvent = (e: Event) => take([String((e as CustomEvent).detail ?? '')]);
    window.addEventListener(CLIP_EVENT, onEvent);
    let off: (() => void) | undefined; let dead = false;
    if ('__TAURI_INTERNALS__' in window) {
      (async () => {
        const dl = await import('@tauri-apps/plugin-deep-link');
        if (!launchHandled) { launchHandled = true; take(await dl.getCurrent()); }
        const un = await dl.onOpenUrl(take);
        if (dead) un(); else off = un;
      })().catch(() => undefined);
    }
    return () => { dead = true; off?.(); window.removeEventListener(CLIP_EVENT, onEvent); };
  }, []);

  if (!clip) return null;
  return <AddFromWebDialog clip={clip} onSaved={onSaved} onClose={() => setClip(null)} onOpenBook={(id) => { setClip(null); nav(`/book/${id}`); }} />;
}

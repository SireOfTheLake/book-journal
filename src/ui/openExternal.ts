// Opens a web address in the person's own browser. In the desktop app that is the system browser; elsewhere, a new tab.
export async function openExternal(url: string): Promise<void> {
  const clean = url.trim();
  if (!clean) return;
  const href = /^[a-z][a-z0-9+.-]*:/i.test(clean) ? clean : `https://${clean}`;
  try {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(href);
      return;
    }
  } catch { /* fall back to the browser's own way */ }
  window.open(href, '_blank', 'noopener,noreferrer');
}

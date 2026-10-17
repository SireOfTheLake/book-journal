import { parseTheme, resolveVars, serializeTheme, type ThemeSettings } from './themes';

const CACHE_KEY = 'book-journal-theme';
let applied: string[] = [];

// Puts the settings on the page: the mode, and every palette variable.
export function applyTheme(t: ThemeSettings, root: HTMLElement = document.documentElement) {
  root.setAttribute('data-theme', t.mode);
  for (const k of applied) root.style.removeProperty(`--${k}`);
  const vars = resolveVars(t);
  applied = Object.keys(vars);
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(`--${k}`, v);
  root.style.colorScheme = t.mode;
}

// A copy in the browser's own storage, so the right colors show at once on start, before the database opens.
export function cacheTheme(t: ThemeSettings) {
  try { localStorage.setItem(CACHE_KEY, serializeTheme(t)); } catch { /* storage may be unavailable */ }
}
export function readCachedTheme(): ThemeSettings | null {
  try { const v = localStorage.getItem(CACHE_KEY); return v ? parseTheme(v) : null; } catch { return null; }
}
export function applyCachedTheme() {
  const t = readCachedTheme();
  if (t) applyTheme(t);
}

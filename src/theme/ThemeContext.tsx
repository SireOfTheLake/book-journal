import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useDb } from '../db/DbContext';
import { loadTheme, saveTheme } from '../repo/theme';
import { applyTheme, cacheTheme, readCachedTheme } from './apply';
import { DEFAULT_THEME, type Mode, type ThemeSettings } from './themes';

interface ThemeApi { theme: ThemeSettings; update(change: (t: ThemeSettings) => ThemeSettings): void; setMode(mode: Mode): void; toggleMode(): void }
const stub: ThemeApi = { theme: DEFAULT_THEME, update: () => undefined, setMode: () => undefined, toggleMode: () => undefined };
export const ThemeContext = createContext<ThemeApi>(stub);
export const useTheme = () => useContext(ThemeContext);

// Keeps the theme settings, puts them on the page, and saves them (shortly after the last change, so dragging a color does not write on every step).
export function ThemeProvider({ children, saveDelay = 400 }: { children: ReactNode; saveDelay?: number }) {
  const db = useDb();
  const [theme, setTheme] = useState<ThemeSettings>(() => readCachedTheme() ?? DEFAULT_THEME);
  const pending = useRef<ThemeSettings | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { let live = true; loadTheme(db).then((t) => { if (live && !pending.current) setTheme(t); }).catch(() => undefined); return () => { live = false; }; }, [db]);
  useEffect(() => { applyTheme(theme); cacheTheme(theme); }, [theme]);

  const flush = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const t = pending.current;
    pending.current = null;
    if (t) saveTheme(db, t).catch(() => undefined);
  }, [db]);
  useEffect(() => flush, [flush]); // save anything waiting when the app closes this part

  const update = useCallback((change: (t: ThemeSettings) => ThemeSettings) => {
    setTheme((prev) => {
      const next = change(prev);
      pending.current = next;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, saveDelay);
      return next;
    });
  }, [flush, saveDelay]);

  const api = useMemo<ThemeApi>(() => ({
    theme, update,
    setMode: (mode) => update((t) => ({ ...t, mode })),
    toggleMode: () => update((t) => ({ ...t, mode: t.mode === 'dark' ? 'light' : 'dark' })),
  }), [theme, update]);
  return <ThemeContext.Provider value={api}>{children}</ThemeContext.Provider>;
}

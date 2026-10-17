import { MONTH_COLORS } from '../domain/months';

export type Mode = 'dark' | 'light';
// The palette variables a theme sets. Everything else (status colors and so on) comes from the mode.
export const PALETTE_KEYS = ['bg', 'panel', 'panel2', 'side', 'line', 'line2', 'text', 'muted', 'accent', 'field', 'nav-cur'] as const;
export type PaletteKey = (typeof PALETTE_KEYS)[number];
export type Palette = Record<PaletteKey, string>;
export interface Preset { id: string; name: string; mode: Mode; palette: Palette }

const p = (bg: string, panel: string, panel2: string, side: string, line: string, line2: string, text: string, muted: string, accent: string, field: string, navCur: string): Palette =>
  ({ bg, panel, panel2, side, line, line2, text, muted, accent, field, 'nav-cur': navCur });

export const PRESETS: Preset[] = [
  { id: 'dark-brown', name: 'Dark brown', mode: 'dark', palette: p('#1c1714', '#2a2420', '#332b25', '#2b241f', '#4d4237', '#6a5a4a', '#ece3d6', '#a99b8a', '#c4683d', '#1f1a16', '#4a3a2e') },
  { id: 'midnight', name: 'Midnight', mode: 'dark', palette: p('#121722', '#1b2230', '#232c3d', '#171d2a', '#34405a', '#4d5c7d', '#e3e9f4', '#94a1ba', '#5b8def', '#0f141d', '#26324a') },
  { id: 'forest', name: 'Forest', mode: 'dark', palette: p('#141b16', '#1d2820', '#26332a', '#18211b', '#38483c', '#52695a', '#e2eadf', '#9bae9f', '#7fb069', '#101712', '#2c3d31') },
  { id: 'plum', name: 'Plum', mode: 'dark', palette: p('#1c141b', '#2a1f29', '#342834', '#241a23', '#4d3a4b', '#6a5068', '#efe3ee', '#b09aae', '#c46a9a', '#160f15', '#43304a') },
  { id: 'charcoal', name: 'Charcoal', mode: 'dark', palette: p('#181818', '#242424', '#2d2d2d', '#1e1e1e', '#3f3f3f', '#5a5a5a', '#ececec', '#a0a0a0', '#d0894a', '#121212', '#383838') },
  { id: 'paper', name: 'Paper', mode: 'light', palette: p('#f4efe6', '#ffffff', '#ece5d8', '#e6dfd1', '#cbbfae', '#a89a86', '#2a2420', '#665a4c', '#a8502a', '#fffdf8', '#ddd0bd') },
  { id: 'sage', name: 'Sage', mode: 'light', palette: p('#eef0e8', '#fbfcf8', '#e2e7d9', '#dde3d3', '#c3ccb5', '#98a584', '#222a1f', '#55634e', '#4f7a3a', '#ffffff', '#cfd8bf') },
  { id: 'sky', name: 'Sky', mode: 'light', palette: p('#edf1f6', '#fbfcfe', '#e0e7f0', '#d9e1ec', '#bcc9db', '#8fa3bf', '#1c2430', '#4f5e75', '#2f6bb8', '#ffffff', '#c9d6e8') },
  { id: 'rose', name: 'Rose', mode: 'light', palette: p('#f6eeee', '#fffafa', '#ede1e1', '#e8d9d9', '#d4bcbc', '#b08f8f', '#2a1f1f', '#735b5b', '#a8405c', '#ffffff', '#e4cfcf') },
];
export const DEFAULT_PRESET: Record<Mode, string> = { dark: 'dark-brown', light: 'paper' };
export const presetsFor = (mode: Mode) => PRESETS.filter((x) => x.mode === mode);
export const presetById = (id: string, mode: Mode) => PRESETS.find((x) => x.id === id && x.mode === mode) ?? PRESETS.find((x) => x.id === DEFAULT_PRESET[mode])!;

// Colors the person can change on top of a preset, kept apart for each mode.
export const CUSTOM_KEYS = ['accent', 'bg', 'panel', 'side', 'text'] as const;
export type CustomKey = (typeof CUSTOM_KEYS)[number];
export type Custom = Partial<Record<CustomKey, string>>;

export interface ThemeSettings { mode: Mode; presets: Record<Mode, string>; custom: Record<Mode, Custom>; months: string[] }
export const DEFAULT_THEME: ThemeSettings = { mode: 'dark', presets: { ...DEFAULT_PRESET }, custom: { dark: {}, light: {} }, months: [...MONTH_COLORS] };

const HEX = /^#[0-9a-f]{6}$/i;
export const isHex = (v: unknown): v is string => typeof v === 'string' && HEX.test(v);

// Reads saved settings, ignoring anything that is not valid so a damaged value cannot break the app.
export function parseTheme(text: string | null | undefined): ThemeSettings {
  const out: ThemeSettings = { mode: 'dark', presets: { ...DEFAULT_PRESET }, custom: { dark: {}, light: {} }, months: [...MONTH_COLORS] };
  if (!text) return out;
  let raw: any;
  try { raw = JSON.parse(text); } catch { return out; }
  if (!raw || typeof raw !== 'object') return out;
  if (raw.mode === 'light' || raw.mode === 'dark') out.mode = raw.mode;
  for (const m of ['dark', 'light'] as Mode[]) {
    const id = raw.presets?.[m];
    if (typeof id === 'string' && PRESETS.some((x) => x.id === id && x.mode === m)) out.presets[m] = id;
    for (const k of CUSTOM_KEYS) { const v = raw.custom?.[m]?.[k]; if (isHex(v)) out.custom[m][k] = v.toLowerCase(); }
  }
  if (Array.isArray(raw.months)) {
    // An older save has six colors that repeat; a month the person changed keeps its color in both halves of the year.
    const list = raw.months.length <= 6 ? [...raw.months, ...raw.months] : raw.months;
    list.slice(0, 12).forEach((v: unknown, i: number) => { if (isHex(v)) out.months[i] = v.toLowerCase(); });
  }
  return out;
}
export const serializeTheme = (t: ThemeSettings) => JSON.stringify(t);

// ---------- contrast ----------
function channel(v: number) { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
// Dark or light text, whichever reads better on this color.
export const readableOn = (hex: string) => (contrast(hex, '#1c1714') >= contrast(hex, '#ffffff') ? '#1c1714' : '#ffffff');

// Every variable to set for these settings: the preset, then the person's own colors, then what follows from them.
export function resolveVars(t: ThemeSettings): Record<string, string> {
  const mode = t.mode;
  const preset = presetById(t.presets[mode], mode);
  const vars: Record<string, string> = { ...preset.palette };
  const c = t.custom[mode];
  for (const k of CUSTOM_KEYS) if (c[k]) vars[k] = c[k]!;
  // Typing a new background brings the field color along with it, so inputs stay readable against it.
  if (c.bg && !c.panel) vars.field = mode === 'dark' ? shade(c.bg, -0.25) : '#ffffff';
  vars['on-accent'] = readableOn(vars.accent);
  t.months.forEach((m, i) => { vars[`month-${i + 1}`] = m; });
  return vars;
}
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(amount < 0 ? v * (1 + amount) : v + (255 - v) * amount)));
  const out = (f((n >> 16) & 255) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255);
  return `#${out.toString(16).padStart(6, '0')}`;
}

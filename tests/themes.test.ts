import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { MONTH_COLORS, monthColor } from '../src/domain/months';
import { listTagColors, loadTheme, saveTheme, setTagColor } from '../src/repo/theme';
import { contrast, DEFAULT_THEME, parseTheme, PRESETS, presetById, readableOn, resolveVars, serializeTheme, type ThemeSettings } from '../src/theme/themes';

const css = readFileSync(new URL('../src/theme/theme.css', import.meta.url), 'utf8');

describe('every preset is readable', () => {
  for (const p of PRESETS) {
    it(`${p.name} (${p.mode}): text, muted text, accent, and the text on the accent all have enough contrast`, () => {
      const c = p.palette;
      for (const surface of [c.bg, c.panel, c.panel2, c.side, c.field]) expect(contrast(c.text, surface), `text on ${surface}`).toBeGreaterThanOrEqual(7);
      for (const surface of [c.bg, c.panel, c.panel2, c.side]) expect(contrast(c.muted, surface), `muted on ${surface}`).toBeGreaterThanOrEqual(4.5);
      for (const surface of [c.bg, c.panel]) expect(contrast(c.accent, surface), `accent on ${surface}`).toBeGreaterThanOrEqual(3);
      expect(contrast(readableOn(c.accent), c.accent), 'text on accent').toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.text, c['nav-cur']), 'text on the current nav item').toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.line2, c.bg), 'borders can be seen').toBeGreaterThanOrEqual(1.5);
    });
  }
  it('has a dark and a light default, and several of each', () => {
    expect(PRESETS.filter((p) => p.mode === 'dark').length).toBeGreaterThanOrEqual(4);
    expect(PRESETS.filter((p) => p.mode === 'light').length).toBeGreaterThanOrEqual(3);
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
  });
  it('keeps the original dark palette as the stylesheet default, so nothing changes until you pick another', () => {
    const base = presetById('dark-brown', 'dark').palette;
    for (const [k, v] of Object.entries(base)) expect(css, `--${k}`).toContain(`--${k}: ${v}`);
  });
});

describe('status colors in both modes', () => {
  const block = (sel: string) => css.slice(css.indexOf(sel), css.indexOf('}', css.indexOf(sel)));
  const pull = (b: string, name: string) => b.match(new RegExp(`--${name}: (#[0-9a-f]{6})`, 'i'))![1];
  for (const [mode, sel, surface] of [['dark', ':root {', '#2a2420'], ['light', ":root[data-theme='light'] {", '#ffffff']] as const) {
    it(`${mode}: chip text colors read against the panel`, () => {
      const b = block(sel);
      for (const n of ['ok-text', 'warn-text', 'bad-text', 't-up', 't-down', 'dead', 'undead', 'estranged']) expect(contrast(pull(b, n), surface), n).toBeGreaterThanOrEqual(3.5);
      expect(contrast(pull(b, 'warn-text'), pull(b, 'warn-bg')), 'text on the amber background').toBeGreaterThanOrEqual(4.5);
    });
  }
  it('has no color left in the stylesheet that only works on a dark page, outside images and overlays', () => {
    const rules = css.split('\n').filter((l) => /#[0-9a-f]{6}/i.test(l) && !l.startsWith('  --') && !/overlay|lightbox|lbclose|libstatus|libnext|libfav|seg\.thumbs|\.cover|\.libgen|\.scover|\.cwheel/.test(l));
    expect(rules).toEqual([]);
  });
});

describe('settings', () => {
  it('start as the dark brown theme with the original month colors', () => {
    expect(DEFAULT_THEME).toMatchObject({ mode: 'dark', presets: { dark: 'dark-brown', light: 'paper' }, months: MONTH_COLORS });
    expect(parseTheme(null)).toEqual(DEFAULT_THEME);
  });
  it('round trip, and ignore anything damaged', () => {
    const t: ThemeSettings = { mode: 'light', presets: { dark: 'forest', light: 'sky' }, custom: { dark: { accent: '#112233' }, light: { bg: '#fafafa', text: '#101010' } }, months: ['#111111', '#222222', '#333333', '#444444', '#555555', '#666666', '#777777', '#888888', '#999999', '#aaaaaa', '#bbbbbb', '#cccccc'] };
    expect(parseTheme(serializeTheme(t))).toEqual(t);
    expect(parseTheme('{nope')).toEqual(DEFAULT_THEME);
    const bad = parseTheme(JSON.stringify({ mode: 'purple', presets: { dark: 'sky', light: 'nope' }, custom: { dark: { accent: 'red', bg: '#ABCDEF' } }, months: ['#123456', 'blue', 7] }));
    expect(bad.mode).toBe('dark');
    expect(bad.presets).toEqual({ dark: 'dark-brown', light: 'paper' }); // a light preset cannot be used for dark
    expect(bad.custom.dark).toEqual({ bg: '#abcdef' });
    expect(bad.months.slice(0, 2)).toEqual(['#123456', MONTH_COLORS[1]]);
  });
  it("resolves a preset, then the person's own colors, then what follows from them", () => {
    const base = resolveVars(DEFAULT_THEME);
    expect(base).toMatchObject({ bg: '#1c1714', accent: '#c4683d', 'on-accent': '#1c1714', 'month-1': MONTH_COLORS[0], 'month-6': MONTH_COLORS[5] });
    const custom = resolveVars({ ...DEFAULT_THEME, custom: { dark: { accent: '#0a2a6a', bg: '#101820' }, light: {} } });
    expect(custom.accent).toBe('#0a2a6a');
    expect(custom['on-accent']).toBe('#ffffff'); // light text on a dark accent
    expect(custom.bg).toBe('#101820');
    expect(custom.field).not.toBe(base.field); // inputs follow the new background
    expect(custom.panel).toBe(base.panel);
    const light = resolveVars({ ...DEFAULT_THEME, mode: 'light', presets: { dark: 'dark-brown', light: 'sage' } });
    expect(light.bg).toBe('#eef0e8');
  });
  it('keeps a custom color per mode', () => {
    const t: ThemeSettings = { ...DEFAULT_THEME, custom: { dark: { accent: '#00ff00' }, light: {} } };
    expect(resolveVars({ ...t, mode: 'light' }).accent).toBe(presetById('paper', 'light').palette.accent);
  });
  it('gives each month its own variable, starting out repeating the six colors', () => {
    expect(monthColor(1)).toBe('var(--month-1)');
    expect(monthColor(7)).toBe('var(--month-7)');
    expect(monthColor(12)).toBe('var(--month-12)');
    expect(MONTH_COLORS).toHaveLength(12);
    for (let i = 1; i <= 12; i++) expect(css).toContain(`--month-${i}: ${MONTH_COLORS[i - 1]}`);
    for (let i = 0; i < 6; i++) expect(MONTH_COLORS[i]).toBe(MONTH_COLORS[i + 6]);
  });
  it('turns an older six-color save into twelve, so nothing the person chose is lost', () => {
    const t = parseTheme(JSON.stringify({ months: ['#111111', '#222222', '#333333', '#444444', '#555555', '#666666'] }));
    expect(t.months).toHaveLength(12);
    expect(t.months[6]).toBe('#111111');
    expect(t.months[11]).toBe('#666666');
  });
});

describe('saving', () => {
  let db: Db;
  beforeEach(() => { db = migrateNodeDb(); });
  it('saves and loads the theme from the database', async () => {
    expect(await loadTheme(db)).toEqual(DEFAULT_THEME);
    const t: ThemeSettings = { ...DEFAULT_THEME, mode: 'light', presets: { dark: 'plum', light: 'rose' } };
    await saveTheme(db, t);
    await saveTheme(db, { ...t, mode: 'dark' });
    expect((await loadTheme(db)).mode).toBe('dark');
    expect((await loadTheme(db)).presets).toEqual({ dark: 'plum', light: 'rose' });
  });
  it('lists tags with their colors and changes one', async () => {
    await db.execute("INSERT INTO genre (id, name, color) VALUES ('g1', 'Romance', '#c98270')");
    await db.execute("INSERT INTO trope (id, name) VALUES ('t1', 'found family')");
    expect(await listTagColors(db, 'genre')).toEqual([{ id: 'g1', name: 'Romance', color: '#c98270', books: 0 }]);
    await setTagColor(db, 'genre', 'g1', '#AABBCC');
    expect((await listTagColors(db, 'genre'))[0].color).toBe('#aabbcc');
    expect((await listTagColors(db, 'trope'))[0].color).toBeNull();
    await expect(setTagColor(db, 'trope', 't1', 'red')).rejects.toThrow(/not a color/);
  });
});

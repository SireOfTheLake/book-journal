import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEVICE_SETTINGS, isSharedSetting, settingScope } from '../src/repo/settings';

const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) ? [p] : []; });

describe('setting scopes', () => {
  it('features sync; everything else stays on the device', () => {
    expect(settingScope('feature_quotes')).toBe('shared');
    expect(isSharedSetting('theme')).toBe(false);
    expect(settingScope('something_new')).toBe('device');
  });
  it('every key the app saves is classified on purpose', () => {
    const keys = new Set<string>();
    for (const f of walk('src').filter((p) => !p.includes('settings.ts'))) {
      const s = readFileSync(f, 'utf8');
      if (!s.includes('app_setting')) continue;
      for (const m of s.matchAll(/key = '(\w+)'/g)) keys.add(m[1]);
      for (const m of s.matchAll(/VALUES \('(\w+)'/g)) keys.add(m[1]);
      for (const m of s.matchAll(/`(feature_)\$\{/g)) keys.add(m[1] + 'x');
    }
    expect([...keys].length).toBeGreaterThan(3);
    for (const k of keys) expect(DEVICE_SETTINGS.includes(k) || isSharedSetting(k), `${k} has no scope`).toBe(true);
  });
});

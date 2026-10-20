import type { CloudConfig } from './supabaseTransport';

// A short code that carries the cloud address and key from the desktop app to a phone, so nothing long has to be typed.
const PREFIX = 'bj1.';

export function makeSetupCode(c: CloudConfig): string {
  const json = JSON.stringify({ u: c.url.trim(), k: c.anonKey.trim() });
  const bytes = new TextEncoder().encode(json);
  let bin = ''; for (const b of bytes) bin += String.fromCharCode(b);
  return PREFIX + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function readSetupCode(text: string): CloudConfig {
  const t = text.trim().replace(/\s+/g, '');
  if (!t.startsWith(PREFIX)) throw new Error('That is not a setup code. It starts with "bj1." and comes from Settings > Sync on your computer.');
  try {
    const b64 = t.slice(PREFIX.length).replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const o = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))) as { u?: unknown; k?: unknown };
    if (typeof o.u !== 'string' || typeof o.k !== 'string' || !/^https?:\/\//.test(o.u) || !o.k) throw new Error('bad');
    return { url: o.u, anonKey: o.k };
  } catch {
    throw new Error('The setup code looks damaged. Copy it again from your computer.');
  }
}

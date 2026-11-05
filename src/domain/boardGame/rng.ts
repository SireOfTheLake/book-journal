export type Rng = () => number;

/** A small seeded random number generator: the same seed always gives the same board. */
export function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const newSeed = () => { try { return crypto.getRandomValues(new Uint32Array(1))[0]; } catch { return Math.floor(Math.random() * 4294967296); } };
export const int = (r: Rng, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1)); // inclusive
export const pick = <T,>(r: Rng, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
export function shuffled<T>(r: Rng, xs: readonly T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
/** Picks a key with the chance given by its weight. */
export function weighted<K extends string>(r: Rng, w: Partial<Record<K, number>>): K {
  const entries = (Object.entries(w) as [K, number][]).filter(([, n]) => n > 0);
  const total = entries.reduce((n, [, x]) => n + x, 0);
  let at = r() * total;
  for (const [k, n] of entries) { at -= n; if (at <= 0) return k; }
  return entries[entries.length - 1][0];
}

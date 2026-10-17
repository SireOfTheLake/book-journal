import { ACCENTS } from './challenges';
import { STATE_SHAPES } from './usStates';

export const STATE_NAMES: string[] = STATE_SHAPES.map((s) => s.name);
export const shapeOf = (name: string) => STATE_SHAPES.find((s) => s.name === name) ?? null;

// A random fill color for a state. It picks among the colors used the fewest times on this map so far, so the map stays varied (all twelve get used before any repeats). `not` leaves out one color, for a re-roll.
export function pickMapColor(used: (string | null)[], rng: () => number = Math.random, not: string | null = null): string {
  const count = new Map(ACCENTS.map((c) => [c.toLowerCase(), 0]));
  for (const u of used) if (u && count.has(u.toLowerCase())) count.set(u.toLowerCase(), count.get(u.toLowerCase())! + 1);
  const least = Math.min(...count.values());
  const pool = ACCENTS.filter((c) => count.get(c.toLowerCase()) === least && c.toLowerCase() !== not?.toLowerCase());
  if (!pool.length) return ACCENTS.find((c) => c.toLowerCase() !== not?.toLowerCase()) ?? ACCENTS[0];
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
}

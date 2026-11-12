import { shade } from '../theme/themes';

export const DEFAULT_PALETTE = ['#c4683d', '#5b6e7e', '#7a6bb0', '#4f8a8b', '#c0566b'];
export const SIDE = 5;
export const FREE_POSITION = 13; // the centre square, counting 1 to 25 across then down
export const PLAYABLE = 24;

// The light version of a square's colour, used behind its text.
export const tint = (hex: string) => shade(hex, 0.86);

// Readability for any palette colour: a pale colour (silver, gold, white) on its own tint is unreadable, so text and borders darken until they pass.
const channel = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
// The colour itself if it already reads on `bg`, otherwise a darker shade of it that does.
export function readableOn(hex: string, bg: string, min = 4.5): string {
  let out = hex;
  for (let i = 1; i <= 20 && contrast(out, bg) < min; i++) out = shade(hex, -i * 0.05);
  return out;
}
// Black or white, whichever reads better on a solid colour.
export const inkOn = (hex: string) => (contrast('#ffffff', hex) >= contrast('#111111', hex) ? '#ffffff' : '#111111');
// The CSS variables for a square or letter of this colour.
export function tileVars(hex: string): Record<string, string> {
  const bg = tint(hex);
  return { '--tc': hex, '--tt': bg, '--tx': readableOn(hex, bg), '--bd': readableOn(hex, bg, 3), '--ox': inkOn(hex) };
}
// How big a square is for each size step on the board's width control.
export const squarePx = (step: number) => 60 + 20 * Math.max(1, Math.min(6, step));

// A Bingo board always has exactly five colours (one for each letter of BINGO), and each colour goes on exactly five of the 25 squares.
export const PALETTE_SIZE = 5;
// The first five valid, different colours of `list`; if there are fewer, the gaps are filled from the default colours and then the standard choices.
export function normalizePalette(list: readonly string[] | null | undefined): string[] {
  const out: string[] = [];
  const add = (c: string) => { const h = c.toLowerCase(); if (/^#[0-9a-f]{6}$/.test(h) && !out.includes(h) && out.length < PALETTE_SIZE) out.push(h); };
  (list ?? []).forEach(add);
  [...DEFAULT_PALETTE, ...BINGO_COLOR_CHOICES].forEach(add);
  return out;
}
// A colour for each of `count` squares laid out five across. Every colour is used the same number of times (five each for 25 squares and five colours),
// shuffled, and of many shuffles the one with the fewest neighbours of the same colour is kept.
export function assignColors(palette: string[], count: number, rng: () => number = Math.random): string[] {
  const pool = Array.from({ length: count }, (_, i) => palette[i % palette.length]);
  const clashes = (c: string[]) => c.reduce((n, v, i) => n + (i % SIDE > 0 && c[i - 1] === v ? 1 : 0) + (i >= SIDE && c[i - SIDE] === v ? 1 : 0), 0);
  let best = pool; let bestScore = Infinity;
  for (let t = 0; t < 200 && bestScore > 0; t++) {
    const c = [...pool];
    for (let i = c.length - 1; i > 0; i--) { const j = Math.min(i, Math.floor(rng() * (i + 1))); [c[i], c[j]] = [c[j], c[i]]; }
    const score = clashes(c);
    if (score < bestScore) { best = c; bestScore = score; }
  }
  return best;
}

// How many of the twelve lines (5 rows, 5 columns, 2 diagonals) are complete. `filled` is 25 flags in board order.
export function bingoLines(filled: boolean[]): number {
  if (filled.length !== SIDE * SIDE) return 0;
  const lines: number[][] = [];
  for (let r = 0; r < SIDE; r++) lines.push(Array.from({ length: SIDE }, (_, c) => r * SIDE + c));
  for (let c = 0; c < SIDE; c++) lines.push(Array.from({ length: SIDE }, (_, r) => r * SIDE + c));
  lines.push(Array.from({ length: SIDE }, (_, i) => i * SIDE + i), Array.from({ length: SIDE }, (_, i) => i * SIDE + (SIDE - 1 - i)));
  return lines.filter((l) => l.every((i) => filled[i])).length;
}

export const MAX_BINGO_GOAL = 11; // twelve lines make a blackout, so a bingo goal stops one short of that
export const BINGO_COLOR_CHOICES = ['#c4683d', '#d3a05c', '#5b6e7e', '#b5705e', '#8a9a82', '#747a4c', '#9a5b8c', '#4f8a8b', '#a65e3a', '#7a6bb0', '#c0566b', '#6c9a4f'];

// Where a board stands against its goal: null goal = blackout (all 25 squares), otherwise that many bingos.
export function bingoGoalState(filled: boolean[], goal: number | null): { reached: boolean; label: string } {
  const squares = filled.filter(Boolean).length;
  if (goal === null) return { reached: squares === filled.length && filled.length > 0, label: `Goal: blackout (${squares}/${filled.length})` };
  const lines = bingoLines(filled);
  return { reached: lines >= goal, label: `Goal: ${goal} bingo${goal === 1 ? '' : 's'} (${Math.min(lines, goal)}/${goal})` };
}

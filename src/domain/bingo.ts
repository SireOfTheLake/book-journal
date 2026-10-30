import { shade } from '../theme/themes';

export const DEFAULT_PALETTE = ['#c4683d', '#5b6e7e', '#7a6bb0', '#4f8a8b', '#c0566b'];
export const SIDE = 5;
export const FREE_POSITION = 13; // the centre square, counting 1 to 25 across then down
export const PLAYABLE = 24;
export const MAX_PALETTE = 10;

// The light version of a square's colour, used behind its text.
export const tint = (hex: string) => shade(hex, 0.86);
// How big a square is for each size step on the board's width control.
export const squarePx = (step: number) => 60 + 20 * Math.max(1, Math.min(6, step));

// A random colour for each of `count` squares laid out five across, avoiding the same colour beside or below another when the palette allows.
export function assignColors(palette: string[], count: number, rng: () => number = Math.random): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const avoid = new Set<string>();
    if (i % SIDE > 0) avoid.add(out[i - 1]);
    if (i >= SIDE) avoid.add(out[i - SIDE]);
    const free = palette.filter((c) => !avoid.has(c));
    const from = free.length ? free : palette;
    out.push(from[Math.min(from.length - 1, Math.floor(rng() * from.length))]);
  }
  return out;
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

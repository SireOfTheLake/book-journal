// How the cards of a challenge are arranged: their order, and how many books (or stickers) wide each is. 0 means the full width.
export interface Layout { order: string[]; cols: Record<string, number> }
export const MAX_COLS = 12;

// Card keys: 'main' (prompts not in a sub-category) and a sub-category id (Grid and Sticker challenges), or 'board' (Bingo).
// A sticker challenge without sub-categories also has a 'stickers' card, next to the 'main' card of covers.
export const defaultKeys = (kind: string, groupIds: string[]): string[] => (kind === 'bingo' ? ['board'] : kind === 'sticker' && groupIds.length === 0 ? ['stickers', 'main'] : ['main', ...groupIds]);
export const defaultCols = (key: string, split = false): number => (key === 'board' ? 3 : split ? (key === 'stickers' ? 3 : 6) : 0);

export function resolveLayout(kind: string, groupIds: string[], stored: string | null | undefined): Layout {
  let raw: { order?: unknown; cols?: unknown } = {};
  try { const v = stored ? JSON.parse(stored) : {}; if (v && typeof v === 'object') raw = v; } catch { /* use defaults */ }
  const keys = defaultKeys(kind, groupIds);
  const storedOrder = Array.isArray(raw.order) ? raw.order.filter((k): k is string => typeof k === 'string' && keys.includes(k)) : [];
  const order = [...new Set([...(keys.includes('stickers') && !storedOrder.includes('stickers') ? ['stickers'] : []), ...storedOrder, ...keys])];
  const storedCols = raw.cols && typeof raw.cols === 'object' ? (raw.cols as Record<string, unknown>) : {};
  const cols: Record<string, number> = {};
  for (const k of keys) {
    const n = storedCols[k];
    cols[k] = typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= MAX_COLS ? n : defaultCols(k, keys.includes('stickers'));
  }
  return { order, cols };
}
export const serializeLayout = (l: Layout) => JSON.stringify(l);

// Moves one item of a list so that it sits before another (or at the end when `before` is null).
export function moveBefore<T>(list: T[], item: T, before: T | null): T[] {
  if (!list.includes(item) || item === before) return list;
  const rest = list.filter((x) => x !== item);
  const at = before === null ? rest.length : rest.indexOf(before);
  if (at < 0) return list;
  return [...rest.slice(0, at), item, ...rest.slice(at)];
}
// A fair shuffle. `rng` returns a number from 0 up to (not including) 1.
export function shuffled<T>(list: T[], rng: () => number = Math.random): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

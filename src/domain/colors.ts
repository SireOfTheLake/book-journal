// Colors for genre, theme, and trope tags. Each new tag gets one at random and keeps it.
export const TAG_COLORS = ['#c98270', '#d6a35e', '#93a58a', '#6f8aa0', '#9a7b8f', '#8c9158', '#5aa5a0', '#c4683d', '#b8a07e', '#c47a9a'];

export function randomTagColor(random: () => number = Math.random): string {
  return TAG_COLORS[Math.floor(random() * TAG_COLORS.length)];
}

// A soft background and a clear border for a chip of the given color.
export function chipStyle(color: string | null | undefined): { borderColor: string; background: string } {
  const c = color && /^#[0-9a-f]{6}$/i.test(color) ? color : '#6a5a4a';
  return { borderColor: c, background: `${c}2e` };
}

// Calendar book colors rotate through the same ten colors.
export const BOOK_COLORS = TAG_COLORS;
export const bookColor = (index: number | null) => BOOK_COLORS[(index ?? 0) % BOOK_COLORS.length];

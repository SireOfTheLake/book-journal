// Ratings are stored as whole numbers 0-20 (quarter stars). null means unrated; 0 is a real rating.
export function starsToStored(stars: number | null): number | null {
  if (stars === null) return null;
  const q = Math.round(stars * 4);
  if (Math.abs(stars * 4 - q) > 1e-9 || q < 0 || q > 20) {
    throw new Error(`Rating must be 0 to 5 in quarter-star steps, got ${stars}`);
  }
  return q;
}

export function storedToStars(stored: number | null): number | null {
  return stored === null ? null : stored / 4;
}

// Fill fraction (0 to 1) for each of five stars, so the display is exact to the quarter.
export function starFills(stars: number | null): number[] {
  const s = stars ?? 0;
  return [0, 1, 2, 3, 4].map((i) => Math.max(0, Math.min(1, s - i)));
}

// Each star is split into four quarters and filled like a spiral: top left, then bottom left (so a half
// is the left side), then bottom right, then top right. Returns how many quarters (0-4) are filled.
export const QUARTER_ORDER = ['top-left', 'bottom-left', 'bottom-right', 'top-right'] as const;
export const starQuarters = (fill: number): number => Math.round(Math.max(0, Math.min(1, fill)) * 4);

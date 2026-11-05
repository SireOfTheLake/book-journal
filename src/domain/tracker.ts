// The bullet-journal trackers: one square for each day of the year, colored by how much was read (or how many books were finished).
export const RANGE_COLORS = ['#7fc4d6', '#8cc084', '#b08ad0', '#ee8fa3', '#f2a65a'];
export const DEFAULT_BOUNDS = [10, 25, 50, 100]; // 1-10, 11-25, 26-50, 51-100, 101+

/** Upper edges of the first four ranges (the fifth has no top). */
export function validBounds(b: unknown): number[] | null {
  if (!Array.isArray(b) || b.length !== 4) return null;
  const n = b.map((x) => Math.round(Number(x)));
  return n.every((x, i) => Number.isFinite(x) && x >= 1 && (i === 0 || x > n[i - 1])) ? n : null;
}

const nice = (n: number) => (n < 20 ? Math.max(1, Math.round(n / 5) * 5) : n < 100 ? Math.round(n / 10) * 10 : Math.round(n / 25) * 25);
/** Ranges that suit how much you usually read on a day you read: the edges sit at the 20th, 40th, 60th and 80th percentile of your days. */
export function autoBounds(daily: number[]): number[] {
  const v = daily.filter((x) => x > 0).sort((a, b) => a - b);
  if (v.length < 10) return [...DEFAULT_BOUNDS];
  const at = (p: number) => v[Math.min(v.length - 1, Math.floor(p * v.length))];
  const out: number[] = [];
  for (const p of [0.2, 0.4, 0.6, 0.8]) {
    let b = nice(at(p));
    const prev = out[out.length - 1] ?? 0;
    if (b <= prev) b = prev + (prev < 20 ? 5 : prev < 100 ? 10 : 25);
    out.push(b);
  }
  return out;
}

/** Which range a day falls in: -1 for nothing read, 0 to 4 otherwise. `read` with unknown pages shows as the first range. */
export function rangeIndex(pages: number, read: boolean, bounds: number[]): number {
  if (pages <= 0) return read ? 0 : -1;
  const i = bounds.findIndex((b) => pages <= b);
  return i === -1 ? 4 : i;
}
export function rangeLabels(bounds: number[]): string[] {
  return bounds.map((b, i) => `${i === 0 ? 1 : bounds[i - 1] + 1}-${b}`).concat(`${bounds[3] + 1}+`).map((l) => l.replace(/^(\d+)-\1$/, '$1'));
}
export const countIndex = (n: number): number => (n <= 0 ? -1 : Math.min(n, 4) - 1);
export const COUNT_LABELS = ['1', '2', '3', '4+'];

export const daysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate();

/** Alphabetical key that ignores a leading "The " (so "The Hobbit" files under H). */
export function sortKey(s: string | null | undefined): string {
  const t = (s ?? '').trim().toLowerCase();
  return /^the\s+\S/.test(t) ? t.replace(/^the\s+/, '') : t;
}
export const byTitle = (a: string | null | undefined, b: string | null | undefined): number =>
  sortKey(a).localeCompare(sortKey(b));

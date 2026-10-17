export interface Entry { page: number | null; percent: number | null; seconds: number | null }
export interface ReadInfo { format: 'physical' | 'audio' | 'ebook' | null; pageCount: number | null; audioSeconds: number | null }

// How far through a book you are, from the latest day entry, as a number from 0 to 1 (or null if it cannot be told).
// Audio uses the time you got to; print and ebooks use the page. A percent is used when the other is missing.
export function progressOf(entry: Entry | null, read: ReadInfo): number | null {
  if (!entry) return null;
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  const byTime = entry.seconds !== null && read.audioSeconds ? clamp(entry.seconds / read.audioSeconds) : null;
  const byPage = entry.page !== null && read.pageCount ? clamp(entry.page / read.pageCount) : null;
  const byPercent = entry.percent !== null ? clamp(entry.percent / 100) : null;
  const order = read.format === 'audio' ? [byTime, byPercent, byPage] : [byPage, byPercent, byTime];
  return order.find((p): p is number => p !== null) ?? null;
}

// Whole days between two dates in the form 2026-10-05.
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

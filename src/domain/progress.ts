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

export interface EntryParts { percent: number | null; page: number | null; seconds: number | null }

// Everything an entry says about where you are: what you typed, plus the rest worked out from it.
// The percent is always a whole number; the time is only worked out for audiobooks.
export function entryParts(entry: Entry, read: ReadInfo): EntryParts {
  const f = progressOf(entry, read);
  return {
    percent: f !== null ? Math.round(f * 100) : entry.percent !== null ? Math.round(entry.percent) : null,
    page: entry.page ?? (f !== null && read.pageCount ? Math.round(f * read.pageCount) : null),
    seconds: read.format === 'audio' ? (entry.seconds ?? (f !== null && read.audioSeconds ? Math.round(f * read.audioSeconds) : null)) : null,
  };
}

import { formatDuration } from './format';
import { entryParts, type Entry, type ReadInfo } from './progress';

// "42% · page 123 · 5h 3m": a day entry with every number worked out from what was typed (time only for audiobooks).
export function entryLabel(entry: Entry, read: ReadInfo, empty = 'read'): string {
  const p = entryParts(entry, read);
  return [p.percent !== null ? `${p.percent}%` : null, p.page !== null ? `page ${p.page}` : null, p.seconds !== null ? formatDuration(p.seconds) : null].filter(Boolean).join(' · ') || empty;
}

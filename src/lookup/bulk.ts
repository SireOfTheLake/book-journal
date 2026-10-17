import type { BookQuery, CoverCandidate, SearchResult } from './covers';
import type { ShrunkImage } from '../ui/imageFile';

export interface BulkBook { id: string; title: string; authors: string[] }
export interface BulkRow {
  book: BulkBook;
  status: 'found' | 'none' | 'failed'; // failed: the sources could not be reached at all
  candidates: CoverCandidate[];
  chosen: number; // index into candidates, or -1
  include: boolean; // whether this cover will be saved
  errors: string[];
}

// Only a strong match is ticked for you. Everything else waits for your say.
export function pickDefault(candidates: CoverCandidate[]): { chosen: number; include: boolean } {
  return candidates.length ? { chosen: 0, include: candidates[0].confidence === 'high' } : { chosen: -1, include: false };
}

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve) => {
  if (ms <= 0 || signal?.aborted) return resolve();
  const t = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
});

// Looks up one book at a time (so no source is hammered). Stops early, keeping what it has, if cancelled.
export async function searchBulk(books: BulkBook[], opts: {
  search: (q: BookQuery) => Promise<SearchResult>; delayMs?: number; signal?: AbortSignal; onProgress?: (done: number, total: number, current: BulkBook) => void;
}): Promise<BulkRow[]> {
  const rows: BulkRow[] = [];
  for (let i = 0; i < books.length; i++) {
    if (opts.signal?.aborted) break;
    const book = books[i];
    opts.onProgress?.(i, books.length, book);
    try {
      const r = await opts.search({ title: book.title, authors: book.authors });
      const pick = pickDefault(r.candidates);
      rows.push({ book, candidates: r.candidates, errors: r.errors, status: r.candidates.length ? 'found' : r.errors.length ? 'failed' : 'none', ...pick });
    } catch (e) {
      rows.push({ book, candidates: [], chosen: -1, include: false, errors: [e instanceof Error ? e.message : String(e)], status: 'failed' });
    }
    if (i < books.length - 1) await sleep(opts.delayMs ?? 250, opts.signal);
  }
  opts.onProgress?.(rows.length, books.length, books[Math.min(rows.length, books.length - 1)]);
  return rows;
}

export interface SaveOutcome { saved: number; failed: { title: string; reason: string }[] }

// Downloads and stores every ticked cover. One failure never stops the rest.
export async function saveBulk(rows: BulkRow[], deps: {
  download: (c: CoverCandidate) => Promise<ShrunkImage>; save: (bookId: string, img: ShrunkImage) => Promise<void>; onProgress?: (done: number, total: number) => void;
}): Promise<SaveOutcome> {
  const todo = rows.filter((r) => r.include && r.chosen >= 0);
  const out: SaveOutcome = { saved: 0, failed: [] };
  for (const [i, row] of todo.entries()) {
    deps.onProgress?.(i, todo.length);
    try {
      await deps.save(row.book.id, await deps.download(row.candidates[row.chosen]));
      out.saved++;
    } catch (e) { out.failed.push({ title: row.book.title, reason: e instanceof Error ? e.message : String(e) }); }
  }
  deps.onProgress?.(todo.length, todo.length);
  return out;
}

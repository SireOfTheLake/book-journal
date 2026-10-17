import type { ShrunkImage } from '../ui/imageFile';
import { downloadCover } from './download';
import { searchCovers, type BookQuery, type CoverCandidate, type SearchResult } from './covers';
import { appFetch } from './http';

// What the screens use to look up and download covers. Tests replace these.
export interface CoverDeps {
  search(q: BookQuery): Promise<SearchResult>;
  download(c: CoverCandidate): Promise<ShrunkImage>;
}
export const realCoverDeps: CoverDeps = { search: (q) => searchCovers(q, appFetch), download: downloadCover };

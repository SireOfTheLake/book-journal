import { urlToDataUrl, type ShrunkImage } from '../ui/imageFile';
import type { CoverCandidate } from './covers';

// Downloads a chosen cover. Tries the large picture first, then the smaller one, and refuses a
// placeholder (a 1-pixel "no cover" image) by checking the size.
export async function downloadCover(c: CoverCandidate): Promise<ShrunkImage> {
  let last: unknown = null;
  for (const url of [c.imageUrl, c.fallbackUrl].filter((u): u is string => !!u)) {
    try {
      const img = await urlToDataUrl(url, 900);
      if (img.width >= 90 && img.height >= 120) return img;
      last = new Error('That cover was only a placeholder.');
    } catch (e) { last = e; }
  }
  throw last instanceof Error ? last : new Error('The cover could not be downloaded.');
}

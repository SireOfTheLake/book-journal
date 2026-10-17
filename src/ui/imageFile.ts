import { appFetch } from '../lookup/http';

export interface ShrunkImage { dataUrl: string; width: number; height: number; mime: string }

// Shrinks a picked or downloaded picture so it stays small enough to keep inside the database.
// Photos become JPEG; PNGs stay PNG (to keep see-through backgrounds) unless they are still large.
export async function fileToDataUrl(file: Blob, maxSide = 1200, quality = 0.85): Promise<ShrunkImage> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('That picture could not be read.');
  ctx.drawImage(bitmap, 0, 0, width, height);
  let mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  let dataUrl = canvas.toDataURL(mime, quality);
  if (mime === 'image/png' && dataUrl.length > 1_500_000) { mime = 'image/jpeg'; dataUrl = canvas.toDataURL(mime, quality); }
  return { dataUrl, width, height, mime };
}

// Checks a pasted web address before anything is downloaded.
export function cleanImageUrl(input: string): string {
  const text = input.trim();
  if (!text) throw new Error('Paste the address of a picture first.');
  let url: URL;
  try { url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`); } catch { throw new Error('That does not look like a web address.'); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Only web addresses (http or https) can be used.');
  return url.toString();
}

// Downloads a picture from a web address. Inside the app this goes through the app's own download component,
// because a web page is not allowed to read pictures from other sites. The link must point at the picture itself.
export async function urlToDataUrl(input: string, maxSide = 1200): Promise<ShrunkImage> {
  const url = cleanImageUrl(input);
  let res: Response;
  try { res = await appFetch(url); } catch { throw new Error('The picture could not be downloaded. Check the address and your connection.'); }
  if (!res.ok) throw new Error(`The site said no (${res.status}). Try a different link.`);
  const blob = await res.blob();
  if (blob.type && !blob.type.startsWith('image/')) throw new Error('That link is a web page, not a picture. Right-click the picture and copy the image address.');
  try { return await fileToDataUrl(blob, maxSide); } catch { throw new Error('That link did not give a picture the app can read.'); }
}

// A picture cut to a centred square (for Bingo squares), `side` pixels across.
export async function fileToSquare(file: Blob, side = 320, quality = 0.85): Promise<ShrunkImage> {
  const bitmap = await createImageBitmap(file);
  const crop = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  const out = Math.min(side, crop);
  canvas.width = out; canvas.height = out;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('That picture could not be read.');
  ctx.drawImage(bitmap, (bitmap.width - crop) / 2, (bitmap.height - crop) / 2, crop, crop, 0, 0, out, out);
  const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  return { dataUrl: canvas.toDataURL(mime, quality), width: out, height: out, mime };
}

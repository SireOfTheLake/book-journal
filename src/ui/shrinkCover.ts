// Covers are only ever shown small, so they are kept at a modest size. This keeps the journal (and the cloud copy) from filling up.
export const COVER_SIDE = 420;
export const COVER_QUALITY = 0.8;

export interface CoverPicture { dataUrl: string; width?: number; height?: number; mime?: string }

function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',');
  const mime = /^data:([^;,]+)/.exec(dataUrl)?.[1] ?? 'image/jpeg';
  const bin = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** A smaller JPEG of a cover. Returns the picture unchanged if it is already small, cannot be read, or this environment cannot draw pictures. */
export async function shrinkCover<T extends CoverPicture>(img: T): Promise<T> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return img;
  try {
    const blob = dataUrlToBlob(img.dataUrl);
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, COVER_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return img;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height); // see-through areas become white, since a JPEG cannot hold them
    ctx.drawImage(bitmap, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/jpeg', COVER_QUALITY);
    if (!dataUrl.startsWith('data:image/jpeg') || dataUrl.length >= img.dataUrl.length) return img;
    return { ...img, dataUrl, width, height, mime: 'image/jpeg' };
  } catch { return img; }
}

/** Shrinks every cover already in the journal that is bigger than it needs to be. Reports progress; returns how many were made smaller and how many bytes were saved. */
export async function shrinkExistingCovers(
  db: { select<T>(sql: string, p?: (string | number | null)[]): Promise<T[]>; execute(sql: string, p?: (string | number | null)[]): Promise<void> },
  onProgress?: (done: number, total: number) => void,
): Promise<{ shrunk: number; savedBytes: number }> {
  const ids = (await db.select<{ id: string }>(
    `SELECT i.id AS id FROM image i WHERE i.deleted_at IS NULL AND length(i.file_path) > ? AND i.id IN (SELECT cover_image_id FROM book WHERE cover_image_id IS NOT NULL AND deleted_at IS NULL) ORDER BY length(i.file_path) DESC`, [BIG_COVER_CHARS])).map((r) => r.id);
  let shrunk = 0; let savedBytes = 0;
  for (let n = 0; n < ids.length; n++) {
    const [row] = await db.select<{ file_path: string; width: number | null; height: number | null; mime_type: string | null }>('SELECT file_path, width, height, mime_type FROM image WHERE id = ?', [ids[n]]);
    if (row) {
      const out: CoverPicture = await shrinkCover<CoverPicture>({ dataUrl: row.file_path });
      if (out.dataUrl !== row.file_path) {
        await db.execute("UPDATE image SET file_path = ?, mime_type = ?, width = ?, height = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?", [out.dataUrl, out.mime ?? 'image/jpeg', out.width ?? null, out.height ?? null, ids[n]]);
        shrunk++; savedBytes += row.file_path.length - out.dataUrl.length;
      }
    }
    onProgress?.(n + 1, ids.length);
  }
  return { shrunk, savedBytes };
}
const BIG_COVER_CHARS = 90_000; // anything under about 65 KB of picture is already small enough

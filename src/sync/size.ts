import type { Db } from '../db/adapter';

export interface DataSize { pictures: number; pictureBytes: number; textBytes: number }

// How much of the journal is pictures. Pictures are by far the heaviest part, so this decides how big a first sync is.
export async function dataSize(db: Db): Promise<DataSize> {
  const [img] = await db.select<{ n: number; bytes: number | null }>('SELECT count(*) AS n, COALESCE(sum(length(file_path)), 0) AS bytes FROM image WHERE deleted_at IS NULL');
  const [pages] = await db.select<{ c: number; s: number }>('PRAGMA page_count').then(async (a) => [{ c: Number((a[0] as unknown as Record<string, number>).page_count ?? 0), s: Number(((await db.select<Record<string, number>>('PRAGMA page_size'))[0] ?? {}).page_size ?? 4096) }]);
  const total = pages.c * pages.s;
  const pictureBytes = Number(img?.bytes ?? 0);
  return { pictures: Number(img?.n ?? 0), pictureBytes, textBytes: Math.max(0, total - pictureBytes) };
}

export const megabytes = (n: number) => (n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0);

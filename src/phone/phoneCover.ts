import type { Db } from '../db/adapter';
import { setBookCover } from '../repo/bookLog';
import { idbSet } from './idb';

/** A cover added on the phone: saved in the journal (so it syncs to your other devices) and kept in the phone's cover storage so it shows at once. */
export async function setPhoneCover(db: Db, bookId: string, img: { dataUrl: string; width?: number; height?: number; mime?: string }): Promise<void> {
  await setBookCover(db, bookId, img);
  const [b] = await db.select<{ cover_image_id: string | null }>('SELECT cover_image_id FROM book WHERE id = ?', [bookId]);
  if (b?.cover_image_id) await idbSet('covers', b.cover_image_id, img.dataUrl);
}

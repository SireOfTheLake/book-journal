import type { Db } from '../db/adapter';
import type { BulkBook } from '../lookup/bulk';

// Books to look covers up for, A to Z. By default only books that have no cover yet.
export async function listBooksForCovers(db: Db, opts: { includeWithCover?: boolean } = {}): Promise<BulkBook[]> {
  const rows = await db.select<{ id: string; title: string; authors: string | null }>(
    `SELECT b.id AS id, b.title AS title,
       (SELECT json_group_array(x.name) FROM (SELECT au.name AS name FROM book_author ba JOIN author au ON au.id = ba.author_id WHERE ba.book_id = b.id AND ba.deleted_at IS NULL AND au.deleted_at IS NULL ORDER BY ba.sort_order) x) AS authors
     FROM book b WHERE b.deleted_at IS NULL
       ${opts.includeWithCover ? '' : 'AND (b.cover_image_id IS NULL OR NOT EXISTS (SELECT 1 FROM image i WHERE i.id = b.cover_image_id AND i.deleted_at IS NULL))'}
     ORDER BY lower(b.title)`);
  return rows.map((r) => ({ id: r.id, title: r.title, authors: r.authors ? (JSON.parse(r.authors) as string[]) : [] }));
}

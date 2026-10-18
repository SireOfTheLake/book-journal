import type { Db } from '../db/adapter';
import { newId } from '../domain/ids';

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
export interface Quote { id: string; book_id: string; text: string; page: number | null; audio_seconds: number | null; note: string | null; is_favorite: number }
export interface QuoteWithBook extends Quote { title: string; authors: string | null }
export interface QuoteInput { text: string; page?: number | null; audio_seconds?: number | null; note?: string | null }

export const listBookQuotes = (db: Db, bookId: string) =>
  db.select<Quote>('SELECT id, book_id, text, page, audio_seconds, note, is_favorite FROM quote WHERE book_id = ? AND deleted_at IS NULL ORDER BY is_favorite DESC, COALESCE(page, 999999), created_at, rowid', [bookId]);

export const listAllQuotes = (db: Db) =>
  db.select<QuoteWithBook>(
    `SELECT q.id, q.book_id, q.text, q.page, q.audio_seconds, q.note, q.is_favorite, b.title,
       (SELECT group_concat(x.name, ', ') FROM (SELECT au.name AS name FROM book_author ba JOIN author au ON au.id = ba.author_id WHERE ba.book_id = b.id AND ba.deleted_at IS NULL AND au.deleted_at IS NULL ORDER BY ba.rowid) x) AS authors
     FROM quote q JOIN book b ON b.id = q.book_id AND b.deleted_at IS NULL WHERE q.deleted_at IS NULL ORDER BY q.created_at DESC, q.rowid DESC`);

export async function addQuote(db: Db, bookId: string, input: QuoteInput): Promise<string> {
  const text = input.text.trim();
  if (!text) throw new Error('Type the passage first.');
  const id = newId();
  await db.execute('INSERT INTO quote (id, book_id, text, page, audio_seconds, note) VALUES (?, ?, ?, ?, ?, ?)', [id, bookId, text, input.page ?? null, input.audio_seconds ?? null, input.note?.trim() || null]);
  return id;
}
export async function updateQuote(db: Db, id: string, input: QuoteInput) {
  const text = input.text.trim();
  if (!text) throw new Error('A quote cannot be empty. Delete it instead.');
  await db.execute('UPDATE quote SET text = ?, page = ?, audio_seconds = ?, note = ? WHERE id = ?', [text, input.page ?? null, input.audio_seconds ?? null, input.note?.trim() || null, id]);
}
export const setQuoteFavorite = (db: Db, id: string, fav: boolean) => db.execute('UPDATE quote SET is_favorite = ? WHERE id = ?', [fav ? 1 : 0, id]);
export const deleteQuote = (db: Db, id: string) => db.execute(`UPDATE quote SET deleted_at = ${NOW} WHERE id = ?`, [id]);

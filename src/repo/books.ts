import type { Db } from '../db/adapter';
import { newId } from '../domain/ids';

export async function findOrCreateAuthor(db: Db, name: string): Promise<string> {
  const found = await db.select<{ id: string }>(
    'SELECT id FROM author WHERE lower(name) = lower(?) AND deleted_at IS NULL LIMIT 1',
    [name],
  );
  if (found.length) return found[0].id;
  const id = newId();
  await db.execute('INSERT INTO author (id, name) VALUES (?, ?)', [id, name]);
  return id;
}

export interface NewBook {
  title: string;
  authors?: string[];
  seriesId?: string | null;
  seriesPosition?: number | null;
  shelf?: 'tbr' | 'up_next' | null;
}

// The "+ New book" quick add: a title is enough, everything else is optional.
export async function createBook(db: Db, input: NewBook): Promise<string> {
  const title = input.title.trim();
  if (!title) throw new Error('A book needs a title');
  const id = newId();
  await db.execute(
    'INSERT INTO book (id, title, series_id, series_position, shelf) VALUES (?, ?, ?, ?, ?)',
    [id, title, input.seriesId ?? null, input.seriesPosition ?? null, input.shelf ?? null],
  );
  const authors = input.authors ?? [];
  for (let i = 0; i < authors.length; i++) {
    const authorId = await findOrCreateAuthor(db, authors[i].trim());
    await db.execute('INSERT INTO book_author (id, book_id, author_id, sort_order) VALUES (?, ?, ?, ?)', [newId(), id, authorId, i]);
  }
  return id;
}

export interface BookListRow {
  read_id: string;
  book_id: string;
  title: string;
  authors: string | null;
  finish_date: string | null;
  format: 'physical' | 'audio' | 'ebook' | null;
  year_number: number | null;
}

// The yearly Book List: finished reads for one journal year, newest first.
export function listBookList(db: Db, year: number): Promise<BookListRow[]> {
  return db.select<BookListRow>(
    `SELECT r.id AS read_id, b.id AS book_id, b.title, r.finish_date, r.format, n.year_number,
       (SELECT group_concat(x.name, ', ') FROM (
          SELECT au.name FROM book_author ba JOIN author au ON au.id = ba.author_id
          WHERE ba.book_id = b.id AND ba.deleted_at IS NULL AND au.deleted_at IS NULL ORDER BY ba.sort_order) x) AS authors
     FROM read r
     JOIN book b ON b.id = r.book_id
     LEFT JOIN v_read_year_number n ON n.read_id = r.id
     WHERE r.deleted_at IS NULL AND b.deleted_at IS NULL AND r.status = 'finished'
       AND substr(r.finish_date, 1, 4) = ?
     ORDER BY r.finish_date DESC, COALESCE(r.finish_time, '') DESC, r.rowid DESC`,
    [String(year)],
  );
}

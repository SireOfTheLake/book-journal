// A book with the genre "Dark Romance" also counts as "Romance"; a Romance book does not count as Dark Romance.
// This is a table-shaped piece of SQL (book_id, genre_id, deleted_at) for use where book_genre would be: a book appears once per genre however it got it, so every book is counted once.
export const BOOK_GENRE_ROLLUP = `(SELECT bg.book_id AS book_id, bg.genre_id AS genre_id, NULL AS deleted_at FROM book_genre bg WHERE bg.deleted_at IS NULL
  UNION SELECT bg.book_id, p.id, NULL FROM book_genre bg JOIN genre c ON c.id = bg.genre_id AND c.deleted_at IS NULL AND lower(trim(c.name)) = 'dark romance'
    JOIN genre p ON p.deleted_at IS NULL AND lower(trim(p.name)) = 'romance' WHERE bg.deleted_at IS NULL)`;

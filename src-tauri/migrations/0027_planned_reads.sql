-- Every Up Next book carries a placeholder read. Older Up Next books got theirs only when you opened them,
-- which made opening a page write data. They get it here instead, with an id made from the book's so every
-- device ends up with the same row.
INSERT INTO read (id, book_id, status, color_index)
SELECT 'planned-' || b.id, b.id, 'on_hold', 0
FROM book b
WHERE b.shelf = 'up_next' AND b.deleted_at IS NULL AND COALESCE(b.is_draft, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM read r WHERE r.book_id = b.id AND r.status IN ('reading', 'on_hold') AND r.deleted_at IS NULL);

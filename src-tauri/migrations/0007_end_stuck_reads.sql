-- A book that was moved back to TBR or Up Next used to keep its unfinished read, so it still showed as
-- being read. Moving a book to a shelf now drops that read; this does the same for any book already stuck.
-- (Finished and DNF reads are untouched.)
UPDATE read SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE deleted_at IS NULL AND status IN ('reading', 'on_hold')
  AND book_id IN (SELECT id FROM book WHERE shelf IS NOT NULL AND deleted_at IS NULL);

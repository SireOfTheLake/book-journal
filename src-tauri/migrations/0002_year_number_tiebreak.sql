-- Books finished on the same day with no finish time now keep a stable order (the order they were added),
-- so the yearly "BOOK LOG: n" number never changes between runs.
DROP VIEW IF EXISTS v_read_year_number;
CREATE VIEW v_read_year_number AS
SELECT id AS read_id, book_id, finish_date,
  ROW_NUMBER() OVER (PARTITION BY substr(finish_date, 1, 4)
                     ORDER BY finish_date, COALESCE(finish_time, '99:99'), rowid) AS year_number
FROM read WHERE deleted_at IS NULL AND status = 'finished' AND finish_date IS NOT NULL;

-- Every challenge gets a new random color, different from the others in its year (twelve colors; a year with more challenges starts again). Bingo boards keep the colors of their own palette.
UPDATE challenge SET color = (
  SELECT CASE (r.n - 1) % 12 WHEN 0 THEN '#c4683d' WHEN 1 THEN '#d3a05c' WHEN 2 THEN '#5b6e7e' WHEN 3 THEN '#b5705e' WHEN 4 THEN '#8a9a82' WHEN 5 THEN '#747a4c' WHEN 6 THEN '#9a5b8c' WHEN 7 THEN '#4f8a8b' WHEN 8 THEN '#a65e3a' WHEN 9 THEN '#7a6bb0' WHEN 10 THEN '#c0566b' ELSE '#6c9a4f' END
  FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY journal_year_id ORDER BY random()) AS n FROM challenge WHERE deleted_at IS NULL AND kind <> 'bingo') r WHERE r.id = challenge.id),
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE deleted_at IS NULL AND kind <> 'bingo';

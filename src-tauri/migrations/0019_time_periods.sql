-- Time periods: a small base set, with an optional detail on a book (a historical era, or the decade of Recent History).
ALTER TABLE book ADD COLUMN time_period_detail TEXT;

INSERT INTO time_period (id, name, sort_order)
SELECT 'tp-base-' || lower(replace(v.name, ' ', '-')), v.name, v.ord FROM (
  SELECT 'Contemporary' AS name, 1 AS ord UNION ALL SELECT 'Recent History', 2 UNION ALL SELECT 'Historical', 3 UNION ALL SELECT 'Future', 4
  UNION ALL SELECT 'Dystopian Future', 5 UNION ALL SELECT 'Post Apocalyptic', 6 UNION ALL SELECT 'Fantasy', 7
) v WHERE NOT EXISTS (SELECT 1 FROM time_period t WHERE lower(t.name) = lower(v.name) AND t.deleted_at IS NULL);

-- Old decade-style periods ("Late 2010s", "1990s") become Recent History with that decade as the detail.
UPDATE book SET time_period_detail = '1950s', time_period_id = (SELECT id FROM time_period WHERE lower(name) = 'recent history' AND deleted_at IS NULL)
  WHERE time_period_id IN (SELECT id FROM time_period WHERE deleted_at IS NULL AND name LIKE '%1950s%' AND lower(name) <> 'recent history');
UPDATE book SET time_period_detail = '1960s', time_period_id = (SELECT id FROM time_period WHERE lower(name) = 'recent history' AND deleted_at IS NULL)
  WHERE time_period_id IN (SELECT id FROM time_period WHERE deleted_at IS NULL AND name LIKE '%1960s%' AND lower(name) <> 'recent history');
UPDATE book SET time_period_detail = '1970s', time_period_id = (SELECT id FROM time_period WHERE lower(name) = 'recent history' AND deleted_at IS NULL)
  WHERE time_period_id IN (SELECT id FROM time_period WHERE deleted_at IS NULL AND name LIKE '%1970s%' AND lower(name) <> 'recent history');
UPDATE book SET time_period_detail = '1980s', time_period_id = (SELECT id FROM time_period WHERE lower(name) = 'recent history' AND deleted_at IS NULL)
  WHERE time_period_id IN (SELECT id FROM time_period WHERE deleted_at IS NULL AND name LIKE '%1980s%' AND lower(name) <> 'recent history');
UPDATE book SET time_period_detail = '1990s', time_period_id = (SELECT id FROM time_period WHERE lower(name) = 'recent history' AND deleted_at IS NULL)
  WHERE time_period_id IN (SELECT id FROM time_period WHERE deleted_at IS NULL AND name LIKE '%1990s%' AND lower(name) <> 'recent history');
UPDATE book SET time_period_detail = '2000s', time_period_id = (SELECT id FROM time_period WHERE lower(name) = 'recent history' AND deleted_at IS NULL)
  WHERE time_period_id IN (SELECT id FROM time_period WHERE deleted_at IS NULL AND name LIKE '%2000s%' AND lower(name) <> 'recent history');
UPDATE book SET time_period_detail = '2010s', time_period_id = (SELECT id FROM time_period WHERE lower(name) = 'recent history' AND deleted_at IS NULL)
  WHERE time_period_id IN (SELECT id FROM time_period WHERE deleted_at IS NULL AND name LIKE '%2010s%' AND lower(name) <> 'recent history');
UPDATE time_period SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE deleted_at IS NULL AND lower(name) <> 'recent history' AND (name LIKE '%1950s%' OR name LIKE '%1960s%' OR name LIKE '%1970s%' OR name LIKE '%1980s%' OR name LIKE '%1990s%' OR name LIKE '%2000s%' OR name LIKE '%2010s%');

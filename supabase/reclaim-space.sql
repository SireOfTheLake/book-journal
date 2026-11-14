-- Run this in the Supabase SQL editor AFTER the new Book Journal has synced once on your desktop
-- (it replaces the big sticker and cover pictures in the cloud with small ones).
-- Postgres frees that space slowly on its own; this does it now.
vacuum full image;

-- Check the result (the size of the biggest tables):
select relname as table, pg_size_pretty(pg_total_relation_size(relid)) as size
from pg_catalog.pg_statio_user_tables order by pg_total_relation_size(relid) desc limit 8;

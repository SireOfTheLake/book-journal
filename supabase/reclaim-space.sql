-- Run this in the Supabase SQL editor AFTER the new Book Journal has synced once on your desktop
-- (that sync replaces the big sticker and cover pictures in the cloud with small ones).
-- Postgres frees that space slowly on its own. CLUSTER rewrites the table now, which hands the space back.
-- (VACUUM FULL does the same job but the SQL editor cannot run it, because it wraps queries in a transaction.)
-- The table is locked for a few seconds while it runs, so do not sync at the same moment.
cluster image using image_pkey;

-- Check the result (the size of the biggest tables):
select relname as table, pg_size_pretty(pg_total_relation_size(relid)) as size
from pg_catalog.pg_statio_user_tables order by pg_total_relation_size(relid) desc limit 8;

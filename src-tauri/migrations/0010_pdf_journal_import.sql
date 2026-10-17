-- Challenge details from the paper journal are kept as plain text on the read until challenges are built.
-- They are not shown anywhere; they are included in backups and exports.
ALTER TABLE read ADD COLUMN legacy_category TEXT;
ALTER TABLE read ADD COLUMN legacy_challenge TEXT;
ALTER TABLE read ADD COLUMN legacy_prompt TEXT;
ALTER TABLE read ADD COLUMN legacy_slot TEXT;

-- Why a book was picked, for the two that do not depend on a challenge.
INSERT INTO category (id, name, kind)
SELECT '00000000-0000-4000-8000-000000000004', 'TBR', 'other' WHERE NOT EXISTS (SELECT 1 FROM category WHERE lower(name) = 'tbr' AND deleted_at IS NULL);
INSERT INTO category (id, name, kind)
SELECT '00000000-0000-4000-8000-000000000005', 'Next in Series', 'other' WHERE NOT EXISTS (SELECT 1 FROM category WHERE lower(name) = 'next in series' AND deleted_at IS NULL);

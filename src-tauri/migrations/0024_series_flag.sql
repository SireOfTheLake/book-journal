-- A temporary "needs a change" flag on a series. Every series that exists now starts flagged; clearing it is one click on the series page.
ALTER TABLE series ADD COLUMN flagged INTEGER NOT NULL DEFAULT 0 CHECK (flagged IN (0,1));
UPDATE series SET flagged = 1 WHERE deleted_at IS NULL;

-- A book whose placeholder cover is meant to stay (no real cover exists). It is left out of the "No cover" filter and the missing-cover warnings.
ALTER TABLE book ADD COLUMN placeholder_permanent INTEGER NOT NULL DEFAULT 0 CHECK (placeholder_permanent IN (0,1));

-- Goals can be shown on the Home page, as a filling ring or a filling bar, and can track challenges.
-- show_on_home: 1 shows the goal on Home. display: 'ring' or 'bar'.
-- challenge_ids: for the 'challenges' metric, a JSON list of challenge ids to track; empty means every challenge of the year.
ALTER TABLE goal ADD COLUMN show_on_home INTEGER NOT NULL DEFAULT 0;
ALTER TABLE goal ADD COLUMN display TEXT NOT NULL DEFAULT 'ring';
ALTER TABLE goal ADD COLUMN challenge_ids TEXT;

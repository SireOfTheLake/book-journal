-- US map challenges: a Grid challenge whose prompts are the 50 states. Placing a book on a state fills it on the map with a random color (kept in challenge_slot.color).
ALTER TABLE challenge ADD COLUMN us_map INTEGER NOT NULL DEFAULT 0;

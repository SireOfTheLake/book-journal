-- Map challenges beyond the US map. map_region says which map (null = the US map, for challenges made before this); bonus_mode says what the bonus places do
-- (optional = extra points that do not count toward the goal, required = part of the goal, off = left out); map_limit makes the challenge "complete after N places" with N boxes instead of a card for every place;
-- map_australia names the continent Oceania "Australia". is_bonus marks a bonus place on a map.
ALTER TABLE challenge ADD COLUMN map_region TEXT;
ALTER TABLE challenge ADD COLUMN bonus_mode TEXT NOT NULL DEFAULT 'optional';
ALTER TABLE challenge ADD COLUMN map_limit INTEGER;
ALTER TABLE challenge ADD COLUMN map_australia INTEGER NOT NULL DEFAULT 0;
ALTER TABLE challenge_slot ADD COLUMN is_bonus INTEGER NOT NULL DEFAULT 0;
-- A US map you already have keeps its 50 states: DC and the territories start out not included.
UPDATE challenge SET map_region = 'us', bonus_mode = 'off' WHERE us_map = 1;

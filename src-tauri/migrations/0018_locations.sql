-- Locations: a place is now a city, an area (state, province, planet, dungeon...) and a country, any of which can be empty, and it can be marked fictional.
-- `name` stays as the label shown on tags (the parts joined with commas), or the old plain text of a location that has not been sorted out yet.
-- `located` = 1 once the location has been sorted into city/area/country (or was already). A plain-text, non-fictional place with located = 0 needs updating.
ALTER TABLE place ADD COLUMN city TEXT;
ALTER TABLE place ADD COLUMN located INTEGER NOT NULL DEFAULT 0;
UPDATE place SET located = 1 WHERE country IS NOT NULL OR state_region IS NOT NULL;

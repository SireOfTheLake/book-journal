-- Limited challenges, optional and bonus prompts, Bingo goals, preset words and revealed stickers.
-- required_count: a limited challenge needs only this many of its prompts (empty = all of them). allow_bonus: prompts past that number, and optional prompts, can still earn bonus points.
-- bonus_limit: a Word Builder's most bonus words (empty = no limit). bingo_goal: a Bingo board's goal in bingos (empty = a full blackout).
-- stickers_revealed: the unused stickers of a finished limited challenge have been shown. is_optional: a prompt that is always a bonus.
ALTER TABLE challenge ADD COLUMN required_count INTEGER;
ALTER TABLE challenge ADD COLUMN allow_bonus INTEGER NOT NULL DEFAULT 0;
ALTER TABLE challenge ADD COLUMN bonus_limit INTEGER;
ALTER TABLE challenge ADD COLUMN bingo_goal INTEGER;
ALTER TABLE challenge ADD COLUMN stickers_revealed INTEGER NOT NULL DEFAULT 0;
-- territory_mode: on the US map, what the territories do (optional / required / off) when it differs from DC, whose mode is bonus_mode (empty = same as bonus_mode).
ALTER TABLE challenge ADD COLUMN territory_mode TEXT;
ALTER TABLE challenge_slot ADD COLUMN is_optional INTEGER NOT NULL DEFAULT 0;

-- Two devices that had each moved squares about could meet on a position and one of the squares was thrown away as a "duplicate",
-- which is how a Bingo board lost tiles. Positions no longer have to be unique.
DROP INDEX IF EXISTS ux_challenge_slot_challenge_id_position;
CREATE INDEX ix_challenge_slot_position ON challenge_slot(challenge_id, position) WHERE deleted_at IS NULL;

-- Bring back Bingo squares that were lost that way, and number them again with the free space in the middle.
UPDATE challenge_slot SET deleted_at = NULL
 WHERE deleted_at IS NOT NULL AND challenge_id IN (SELECT id FROM challenge WHERE kind = 'bingo' AND deleted_at IS NULL);
UPDATE challenge_slot SET position = (
    SELECT n + CASE WHEN n >= 13 THEN 1 ELSE 0 END
    FROM (SELECT id AS sid, ROW_NUMBER() OVER (PARTITION BY challenge_id ORDER BY position, created_at, rowid) AS n
          FROM challenge_slot WHERE is_free = 0 AND deleted_at IS NULL) WHERE sid = challenge_slot.id)
 WHERE is_free = 0 AND deleted_at IS NULL AND challenge_id IN (SELECT id FROM challenge WHERE kind = 'bingo' AND deleted_at IS NULL);
UPDATE challenge_slot SET position = 13
 WHERE is_free = 1 AND deleted_at IS NULL AND challenge_id IN (SELECT id FROM challenge WHERE kind = 'bingo' AND deleted_at IS NULL);
UPDATE challenge_slot SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE deleted_at IS NULL AND position > 25 AND challenge_id IN (SELECT id FROM challenge WHERE kind = 'bingo' AND deleted_at IS NULL);

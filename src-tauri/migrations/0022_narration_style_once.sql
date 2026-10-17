-- One time only: a read with exactly one narrator becomes "solo", and exactly two becomes "dual".
-- Reads that already have a narration style, and reads with any other number of narrators, are left alone.
-- This is a migration, so it runs once; nothing changes a narration style again when books or narrators are added or edited.
UPDATE read SET narration_style = 'solo'
WHERE deleted_at IS NULL AND (narration_style IS NULL OR narration_style = '')
  AND (SELECT count(DISTINCT rn.narrator_id) FROM read_narrator rn WHERE rn.read_id = read.id AND rn.deleted_at IS NULL) = 1;
UPDATE read SET narration_style = 'dual'
WHERE deleted_at IS NULL AND (narration_style IS NULL OR narration_style = '')
  AND (SELECT count(DISTINCT rn.narrator_id) FROM read_narrator rn WHERE rn.read_id = read.id AND rn.deleted_at IS NULL) = 2;

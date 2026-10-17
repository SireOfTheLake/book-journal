// Shared SQL fragments. `c` is the character row of the enclosing query.
// A character's current partners: other characters they are linked to, and plain names listed on them.
export const PARTNERS_SQL = `(SELECT group_concat(x.n, ', ') FROM (
  SELECT p.name AS n FROM character_relationship r
    JOIN character p ON p.id = CASE WHEN r.character_a_id = c.id THEN r.character_b_id ELSE r.character_a_id END
    WHERE r.rel_type = 'partner' AND r.is_current = 1 AND r.deleted_at IS NULL AND p.deleted_at IS NULL AND c.id IN (r.character_a_id, r.character_b_id)
  UNION ALL
  SELECT rp.name FROM related_person rp WHERE rp.character_id = c.id AND rp.rel_type = 'partner' AND rp.is_current = 1 AND rp.deleted_at IS NULL) x)`;

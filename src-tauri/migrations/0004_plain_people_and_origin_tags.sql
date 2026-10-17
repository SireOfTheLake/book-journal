-- People who are only mentioned (a mother, an ex, a teammate) are no longer characters with their own page.
-- Each mention becomes a plain name and label on the character who mentions them, so two people with the
-- same name stay separate. A note in parentheses after a name, such as (TAME), becomes a tag.

CREATE TABLE related_person (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES character(id),
  name TEXT NOT NULL,
  rel_type TEXT NOT NULL CHECK (rel_type IN ('partner', 'family', 'friend', 'other')),
  is_current INTEGER CHECK (is_current IS NULL OR is_current IN (0,1)),
  label TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE INDEX ix_related_person_character ON related_person(character_id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_related_person_touch AFTER UPDATE ON related_person FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE related_person SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;

-- 1. Each relationship between a character and a "basic" character (no page, not in any book) becomes a plain person.
INSERT INTO related_person (id, character_id, name, rel_type, is_current, label)
SELECT lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))),
       owner, who, rel_type, is_current, label
FROM (
  SELECT r.character_a_id AS owner, b.name AS who, r.rel_type AS rel_type, r.is_current AS is_current, r.b_is_to_a AS label
  FROM character_relationship r JOIN character a ON a.id = r.character_a_id JOIN character b ON b.id = r.character_b_id
  WHERE r.deleted_at IS NULL AND b.deleted_at IS NULL AND a.deleted_at IS NULL
    AND b.is_featured = 0 AND NOT EXISTS (SELECT 1 FROM book_character bc WHERE bc.character_id = b.id AND bc.deleted_at IS NULL)
    AND NOT (a.is_featured = 0 AND NOT EXISTS (SELECT 1 FROM book_character bc WHERE bc.character_id = a.id AND bc.deleted_at IS NULL))
  UNION ALL
  SELECT r.character_b_id, a.name, r.rel_type, r.is_current, r.a_is_to_b
  FROM character_relationship r JOIN character a ON a.id = r.character_a_id JOIN character b ON b.id = r.character_b_id
  WHERE r.deleted_at IS NULL AND b.deleted_at IS NULL AND a.deleted_at IS NULL
    AND a.is_featured = 0 AND NOT EXISTS (SELECT 1 FROM book_character bc WHERE bc.character_id = a.id AND bc.deleted_at IS NULL)
    AND NOT (b.is_featured = 0 AND NOT EXISTS (SELECT 1 FROM book_character bc WHERE bc.character_id = b.id AND bc.deleted_at IS NULL))
);

-- 2. Remove those relationships and the basic characters themselves (soft delete, like everything else).
UPDATE character_relationship SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE deleted_at IS NULL AND (
  character_a_id IN (SELECT c.id FROM character c WHERE c.is_featured = 0 AND c.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM book_character bc WHERE bc.character_id = c.id AND bc.deleted_at IS NULL))
  OR character_b_id IN (SELECT c.id FROM character c WHERE c.is_featured = 0 AND c.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM book_character bc WHERE bc.character_id = c.id AND bc.deleted_at IS NULL)));
UPDATE character_alt_name SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE deleted_at IS NULL AND character_id IN (SELECT c.id FROM character c WHERE c.is_featured = 0 AND c.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM book_character bc WHERE bc.character_id = c.id AND bc.deleted_at IS NULL));
UPDATE character_occupation SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE deleted_at IS NULL AND character_id IN (SELECT c.id FROM character c WHERE c.is_featured = 0 AND c.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM book_character bc WHERE bc.character_id = c.id AND bc.deleted_at IS NULL));
UPDATE character_previous_place SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE deleted_at IS NULL AND character_id IN (SELECT c.id FROM character c WHERE c.is_featured = 0 AND c.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM book_character bc WHERE bc.character_id = c.id AND bc.deleted_at IS NULL));
UPDATE character_tag_link SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE deleted_at IS NULL AND character_id IN (SELECT c.id FROM character c WHERE c.is_featured = 0 AND c.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM book_character bc WHERE bc.character_id = c.id AND bc.deleted_at IS NULL));
UPDATE character_image SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE deleted_at IS NULL AND character_id IN (SELECT c.id FROM character c WHERE c.is_featured = 0 AND c.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM book_character bc WHERE bc.character_id = c.id AND bc.deleted_at IS NULL));
UPDATE character SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE is_featured = 0 AND deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM book_character bc WHERE bc.character_id = character.id AND bc.deleted_at IS NULL);

-- 3. Every remaining character has a page.
UPDATE character SET is_featured = 1 WHERE deleted_at IS NULL;

-- 4. The note in parentheses after a name becomes a tag on the character.
INSERT INTO character_tag (id, name, color)
SELECT lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))),
       o.name,
       CASE abs(random()) % 10 WHEN 0 THEN '#c98270' WHEN 1 THEN '#d6a35e' WHEN 2 THEN '#93a58a' WHEN 3 THEN '#6f8aa0' WHEN 4 THEN '#9a7b8f' WHEN 5 THEN '#8c9158' WHEN 6 THEN '#5aa5a0' WHEN 7 THEN '#c4683d' WHEN 8 THEN '#b8a07e' ELSE '#c47a9a' END
FROM (SELECT min(trim(origin_note)) AS name FROM character WHERE deleted_at IS NULL AND origin_note IS NOT NULL AND trim(origin_note) != '' GROUP BY lower(trim(origin_note))) o
WHERE NOT EXISTS (SELECT 1 FROM character_tag t WHERE lower(t.name) = lower(o.name) AND t.deleted_at IS NULL);

INSERT INTO character_tag_link (id, character_id, character_tag_id)
SELECT lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))),
       c.id, t.id
FROM character c JOIN character_tag t ON lower(t.name) = lower(trim(c.origin_note)) AND t.deleted_at IS NULL
WHERE c.deleted_at IS NULL AND c.origin_note IS NOT NULL AND trim(c.origin_note) != ''
  AND NOT EXISTS (SELECT 1 FROM character_tag_link l WHERE l.character_id = c.id AND l.character_tag_id = t.id AND l.deleted_at IS NULL);

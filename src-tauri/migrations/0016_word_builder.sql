-- Word Builder challenges: a variation of the Sticker challenge. There is one sticker per letter, and each book adds a word that is spelled out with them.
-- (A Word Builder is stored as kind 'sticker' with word_builder = 1; its words are challenge slots whose label is the word.)
ALTER TABLE challenge ADD COLUMN word_builder INTEGER NOT NULL DEFAULT 0;
ALTER TABLE challenge ADD COLUMN word_theme TEXT;
ALTER TABLE challenge ADD COLUMN word_target INTEGER;

CREATE TABLE challenge_letter (
  id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL REFERENCES challenge(id),
  letter TEXT NOT NULL CHECK (length(letter) = 1),
  image_id TEXT NOT NULL REFERENCES image(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE UNIQUE INDEX ux_challenge_letter ON challenge_letter(challenge_id, letter) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_challenge_letter_touch AFTER UPDATE ON challenge_letter FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE challenge_letter SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;

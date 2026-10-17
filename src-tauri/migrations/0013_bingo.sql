-- Bingo challenges: reusable prompt banks, draft/published boards, a colour palette, and per-square colour.
CREATE TABLE bingo_bank (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE TRIGGER trg_bingo_bank_touch AFTER UPDATE ON bingo_bank FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE bingo_bank SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;

CREATE TABLE bingo_prompt (
  id TEXT PRIMARY KEY,
  bank_id TEXT NOT NULL REFERENCES bingo_bank(id),
  text TEXT NOT NULL,
  image_id TEXT REFERENCES image(id),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE INDEX ix_bingo_prompt_bank_id ON bingo_prompt(bank_id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_bingo_prompt_touch AFTER UPDATE ON bingo_prompt FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE bingo_prompt SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;

ALTER TABLE challenge ADD COLUMN published INTEGER NOT NULL DEFAULT 1;
ALTER TABLE challenge ADD COLUMN palette TEXT;
ALTER TABLE challenge ADD COLUMN bank_id TEXT REFERENCES bingo_bank(id);
ALTER TABLE challenge ADD COLUMN prefer_unused INTEGER NOT NULL DEFAULT 1;
ALTER TABLE challenge_slot ADD COLUMN color TEXT;
ALTER TABLE challenge_slot ADD COLUMN is_free INTEGER NOT NULL DEFAULT 0;
ALTER TABLE challenge_slot ADD COLUMN bank_prompt_id TEXT REFERENCES bingo_prompt(id);

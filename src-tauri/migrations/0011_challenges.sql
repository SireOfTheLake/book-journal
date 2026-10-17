-- Challenges: Grid, Sticker and Bingo. A challenge has a kind, optional sub-categories (groups), and slots (prompts).
ALTER TABLE challenge ADD COLUMN kind TEXT NOT NULL DEFAULT 'grid' CHECK (kind IN ('grid','sticker','bingo'));

CREATE TABLE challenge_group (
  id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL REFERENCES challenge(id),
  name TEXT NOT NULL,
  color TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE INDEX ix_challenge_group_challenge_id ON challenge_group(challenge_id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_challenge_group_touch AFTER UPDATE ON challenge_group FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE challenge_group SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;

ALTER TABLE challenge_slot ADD COLUMN group_id TEXT REFERENCES challenge_group(id);

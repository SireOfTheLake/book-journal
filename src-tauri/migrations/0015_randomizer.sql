-- Prompt randomizer: your own Trick and Treat prompts, and a flag for the blank "next book" page that waits for a book.
CREATE TABLE randomizer_prompt (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('trick','treat')),
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE INDEX ix_randomizer_prompt_kind ON randomizer_prompt(kind) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_randomizer_prompt_touch AFTER UPDATE ON randomizer_prompt FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE randomizer_prompt SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;

ALTER TABLE book ADD COLUMN is_draft INTEGER NOT NULL DEFAULT 0;

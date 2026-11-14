-- Challenge categories: named sections on the Challenges page (per journal year). A challenge with no category is shown on its own.
-- Both categories and uncategorized challenges are ordered by sort_order in one shared sequence; a challenge in a category is ordered by sort_order inside it.
CREATE TABLE challenge_category (
  id TEXT PRIMARY KEY,
  journal_year_id TEXT NOT NULL REFERENCES journal_year(id),
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE INDEX ix_challenge_category_year ON challenge_category(journal_year_id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_challenge_category_touch AFTER UPDATE ON challenge_category FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE challenge_category SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;
ALTER TABLE challenge ADD COLUMN category_id TEXT REFERENCES challenge_category(id);

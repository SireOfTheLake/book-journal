-- Each quarter of the Book Bracket plays January against February and February against March.
-- This remembers which book won each of those two matches (the quarter's best-of is a normal bracket pick).
CREATE TABLE bracket_match_winner (
  id TEXT PRIMARY KEY,
  journal_year_id TEXT NOT NULL REFERENCES journal_year(id),
  quarter INTEGER NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  match INTEGER NOT NULL CHECK (match IN (1, 2)),
  read_id TEXT NOT NULL REFERENCES read(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE UNIQUE INDEX ux_bracket_match_winner ON bracket_match_winner(journal_year_id, quarter, match) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_bracket_match_winner_touch AFTER UPDATE ON bracket_match_winner FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE bracket_match_winner SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;

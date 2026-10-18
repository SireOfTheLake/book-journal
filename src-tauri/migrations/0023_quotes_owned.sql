-- Quotes and favorite passages (per book). A quote can carry a page, an audio time, and a note of its own.
CREATE TABLE quote (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES book(id),
  text TEXT NOT NULL,
  page INTEGER,
  audio_seconds INTEGER,
  note TEXT,
  is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE INDEX ix_quote_book_id ON quote(book_id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_quote_touch AFTER UPDATE ON quote FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE quote SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;

-- Which formats you own a copy of.
ALTER TABLE book ADD COLUMN own_physical INTEGER NOT NULL DEFAULT 0 CHECK (own_physical IN (0,1));
ALTER TABLE book ADD COLUMN own_ebook INTEGER NOT NULL DEFAULT 0 CHECK (own_ebook IN (0,1));
ALTER TABLE book ADD COLUMN own_audio INTEGER NOT NULL DEFAULT 0 CHECK (own_audio IN (0,1));

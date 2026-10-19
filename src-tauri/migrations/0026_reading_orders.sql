-- Reading orders: your own ordered lists of books to read, for a series, an author or anything else.
CREATE TABLE reading_order (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  series_id TEXT REFERENCES series(id),
  author_id TEXT REFERENCES author(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE TRIGGER trg_reading_order_touch AFTER UPDATE ON reading_order FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE reading_order SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;

-- book_id is empty for a book that is not in the library (or is a story inside a collection).
-- The title, author and series are kept on the line itself so it still reads right if the book is later deleted.
CREATE TABLE reading_order_item (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES reading_order(id),
  position INTEGER NOT NULL DEFAULT 0,
  book_id TEXT REFERENCES book(id),
  title TEXT NOT NULL,
  author_name TEXT,
  series_name TEXT,
  series_position REAL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE INDEX ix_reading_order_item_order ON reading_order_item(order_id, position) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_reading_order_item_touch AFTER UPDATE ON reading_order_item FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE reading_order_item SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;

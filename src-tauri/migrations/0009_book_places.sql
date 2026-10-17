-- A book can have several settings.
CREATE TABLE book_place (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES book(id),
  place_id TEXT NOT NULL REFERENCES place(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE UNIQUE INDEX ux_book_place_book_id_place_id ON book_place(book_id, place_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_book_place_place_id ON book_place(place_id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_book_place_touch AFTER UPDATE ON book_place FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE book_place SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
INSERT INTO book_place (id, book_id, place_id, sort_order)
SELECT lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-a' || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))), id, setting_place_id, 0
FROM book WHERE setting_place_id IS NOT NULL AND deleted_at IS NULL;

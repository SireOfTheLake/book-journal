-- Mood, pace and content-warning tags; why a read was dropped; who recommended a book.

CREATE TABLE mood (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE UNIQUE INDEX ux_mood_lowername ON mood(lower(name)) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_mood_touch AFTER UPDATE ON mood FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE mood SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;

CREATE TABLE book_mood (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES book(id),
  mood_id TEXT NOT NULL REFERENCES mood(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE UNIQUE INDEX ux_book_mood_book_id_mood_id ON book_mood(book_id, mood_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_book_mood_mood_id ON book_mood(mood_id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_book_mood_touch AFTER UPDATE ON book_mood FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE book_mood SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;

CREATE TABLE pace (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE UNIQUE INDEX ux_pace_lowername ON pace(lower(name)) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_pace_touch AFTER UPDATE ON pace FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE pace SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;

CREATE TABLE book_pace (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES book(id),
  pace_id TEXT NOT NULL REFERENCES pace(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE UNIQUE INDEX ux_book_pace_book_id_pace_id ON book_pace(book_id, pace_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_book_pace_pace_id ON book_pace(pace_id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_book_pace_touch AFTER UPDATE ON book_pace FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE book_pace SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;

CREATE TABLE content_warning (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE UNIQUE INDEX ux_content_warning_lowername ON content_warning(lower(name)) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_content_warning_touch AFTER UPDATE ON content_warning FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE content_warning SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;

CREATE TABLE book_content_warning (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES book(id),
  content_warning_id TEXT NOT NULL REFERENCES content_warning(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE UNIQUE INDEX ux_book_content_warning_book_id_content_warning_id ON book_content_warning(book_id, content_warning_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_book_content_warning_content_warning_id ON book_content_warning(content_warning_id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_book_content_warning_touch AFTER UPDATE ON book_content_warning FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE book_content_warning SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;

ALTER TABLE read ADD COLUMN stopped_reason TEXT;
ALTER TABLE read ADD COLUMN stopped_where TEXT;
ALTER TABLE book ADD COLUMN recommended_by TEXT;

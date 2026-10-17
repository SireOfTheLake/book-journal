-- Book Journal schema (SQLite). Generated for Draft 4 of the requirements.
-- Conventions: UUID text ids, UTC ISO-8601 timestamps, soft deletes (deleted_at), dates as YYYY-MM-DD,
-- booleans 0/1, rating 0-20 (quarter stars). Partial unique indexes ignore soft-deleted rows.
-- Fixed choices use CHECK constraints; open-ended lists (goal metrics) are checked by the app.
PRAGMA foreign_keys = ON;


-- ===== Images and editable lists =====

-- Every picture: covers, photos, character art, logos, icons. Files live in the app images folder.
CREATE TABLE image (
  id TEXT PRIMARY KEY,
  file_path TEXT NOT NULL,
  mime_type TEXT,
  width INTEGER,
  height INTEGER,
  sha256 TEXT,
  source_url TEXT,
  caption TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE INDEX ix_image_sha256 ON image(sha256) WHERE sha256 IS NOT NULL AND deleted_at IS NULL;
CREATE TRIGGER trg_image_touch AFTER UPDATE ON image FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE image SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;

-- Where a book came from (Kindle Unlimited, Audible, Spotify, Fanfic, Physical...)
CREATE TABLE source (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT,
  icon_image_id TEXT REFERENCES image(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE UNIQUE INDEX ux_source_lowername ON source(lower(name)) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_source_touch AFTER UPDATE ON source FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE source SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;

-- Book time period (Contemporary, Late 2010s...)
CREATE TABLE time_period (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT,
  icon_image_id TEXT REFERENCES image(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE UNIQUE INDEX ux_time_period_lowername ON time_period(lower(name)) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_time_period_touch AFTER UPDATE ON time_period FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE time_period SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;

-- Narrator accents (General NA, British...)
CREATE TABLE accent (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT,
  icon_image_id TEXT REFERENCES image(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE UNIQUE INDEX ux_accent_lowername ON accent(lower(name)) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_accent_touch AFTER UPDATE ON accent FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE accent SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;

-- Types of alternative character names (nickname, previous name, alias...)
CREATE TABLE name_type (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT,
  icon_image_id TEXT REFERENCES image(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE UNIQUE INDEX ux_name_type_lowername ON name_type(lower(name)) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_name_type_touch AFTER UPDATE ON name_type FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE name_type SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;

-- Character occupations
CREATE TABLE occupation (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT,
  icon_image_id TEXT REFERENCES image(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE UNIQUE INDEX ux_occupation_lowername ON occupation(lower(name)) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_occupation_touch AFTER UPDATE ON occupation FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE occupation SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;

-- Character sexuality
CREATE TABLE sexuality (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT,
  icon_image_id TEXT REFERENCES image(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE UNIQUE INDEX ux_sexuality_lowername ON sexuality(lower(name)) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_sexuality_touch AFTER UPDATE ON sexuality FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE sexuality SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;

-- Genres, for books and whole series
CREATE TABLE genre (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT,
  icon_image_id TEXT REFERENCES image(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE UNIQUE INDEX ux_genre_lowername ON genre(lower(name)) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_genre_touch AFTER UPDATE ON genre FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE genre SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;

-- Book themes
CREATE TABLE theme (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT,
  icon_image_id TEXT REFERENCES image(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE UNIQUE INDEX ux_theme_lowername ON theme(lower(name)) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_theme_touch AFTER UPDATE ON theme FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE theme SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;

-- Book tropes
CREATE TABLE trope (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT,
  icon_image_id TEXT REFERENCES image(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE UNIQUE INDEX ux_trope_lowername ON trope(lower(name)) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_trope_touch AFTER UPDATE ON trope FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE trope SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;

-- Free tags for characters
CREATE TABLE character_tag (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT,
  icon_image_id TEXT REFERENCES image(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE UNIQUE INDEX ux_character_tag_lowername ON character_tag(lower(name)) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_character_tag_touch AFTER UPDATE ON character_tag FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE character_tag SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;


-- ===== People and places =====

-- Authors. Co-authors and anthologies are just several rows linked to one book.
CREATE TABLE author (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_name TEXT,
  photo_image_id TEXT REFERENCES image(id),
  links TEXT,
  is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0,1)),
  notes TEXT,
  external_ids TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE INDEX ix_author_lowername ON author(lower(name)) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_author_touch AFTER UPDATE ON author FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE author SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;

-- Pen names / other names for a author.
CREATE TABLE author_alias (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL REFERENCES author(id),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE INDEX ix_author_alias_author_id ON author_alias(author_id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_author_alias_touch AFTER UPDATE ON author_alias FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE author_alias SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;

-- Audiobook narrators.
CREATE TABLE narrator (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_name TEXT,
  photo_image_id TEXT REFERENCES image(id),
  links TEXT,
  is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0,1)),
  notes TEXT,
  external_ids TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE INDEX ix_narrator_lowername ON narrator(lower(name)) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_narrator_touch AFTER UPDATE ON narrator FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE narrator SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;

-- Pen names / other names for a narrator.
CREATE TABLE narrator_alias (
  id TEXT PRIMARY KEY,
  narrator_id TEXT NOT NULL REFERENCES narrator(id),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE INDEX ix_narrator_alias_narrator_id ON narrator_alias(narrator_id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_narrator_alias_touch AFTER UPDATE ON narrator_alias FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE narrator_alias SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;

-- A narrator's usual accents.
CREATE TABLE narrator_accent (
  id TEXT PRIMARY KEY,
  narrator_id TEXT NOT NULL REFERENCES narrator(id),
  accent_id TEXT NOT NULL REFERENCES accent(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE UNIQUE INDEX ux_narrator_accent_narrator_id_accent_id ON narrator_accent(narrator_id, accent_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_narrator_accent_accent_id ON narrator_accent(accent_id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_narrator_accent_touch AFTER UPDATE ON narrator_accent FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE narrator_accent SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;

-- Shared places, real or fictional (St Dismas), reused by books and characters.
CREATE TABLE place (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  place_type TEXT CHECK (place_type IS NULL OR place_type IN ('city','town','village','region','other')),
  state_region TEXT,
  country TEXT,
  is_fictional INTEGER NOT NULL DEFAULT 0 CHECK (is_fictional IN (0,1)),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE INDEX ix_place_country_state_region ON place(country, state_region) WHERE deleted_at IS NULL;
CREATE INDEX ix_place_lowername ON place(lower(name)) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_place_touch AFTER UPDATE ON place FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE place SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;


-- ===== Universes and series =====

-- A shared world (the Sadenverse). Can include series and standalone books, but not everything an author wrote.
CREATE TABLE universe (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE UNIQUE INDEX ux_universe_lowername ON universe(lower(name)) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_universe_touch AFTER UPDATE ON universe FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE universe SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;

-- A series. Books and positions live on book (series_id, series_position). Authors and average rating are derived.
CREATE TABLE series (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  universe_id TEXT REFERENCES universe(id),
  total_books INTEGER CHECK (total_books IS NULL OR total_books >= 0),
  is_ongoing INTEGER NOT NULL DEFAULT 0 CHECK (is_ongoing IN (0,1)),
  publication_status TEXT NOT NULL DEFAULT 'incomplete' CHECK (publication_status IN ('complete','incomplete')),
  reading_status_override TEXT CHECK (reading_status_override IS NULL OR reading_status_override IN ('completed','in_progress','on_hold','dnf')),
  interconnected_standalones INTEGER NOT NULL DEFAULT 0 CHECK (interconnected_standalones IN (0,1)),
  is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0,1)),
  color TEXT,
  notes TEXT,
  external_ids TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE INDEX ix_series_lowertitle ON series(lower(title)) WHERE deleted_at IS NULL;
CREATE INDEX ix_series_universe_id ON series(universe_id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_series_touch AFTER UPDATE ON series FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE series SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;

-- Genres of a series as a whole.
CREATE TABLE series_genre (
  id TEXT PRIMARY KEY,
  series_id TEXT NOT NULL REFERENCES series(id),
  genre_id TEXT NOT NULL REFERENCES genre(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE UNIQUE INDEX ux_series_genre_series_id_genre_id ON series_genre(series_id, genre_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_series_genre_genre_id ON series_genre(genre_id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_series_genre_touch AFTER UPDATE ON series_genre FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE series_genre SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;


-- ===== Books =====

-- The work itself (not one reading of it). Each book is in at most one series (series_id, decimal series_position in publication order). shelf is NULL for a normal library book, tbr or up_next otherwise.
CREATE TABLE book (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  cover_image_id TEXT REFERENCES image(id),
  placeholder_color TEXT,
  synopsis TEXT,
  page_count INTEGER CHECK (page_count IS NULL OR page_count > 0),
  pov TEXT CHECK (pov IS NULL OR pov IN ('single','dual','multi')),
  perspective TEXT CHECK (perspective IS NULL OR perspective IN ('1st','2nd','3rd')),
  heat_level INTEGER CHECK (heat_level IS NULL OR heat_level BETWEEN 0 AND 5),
  time_period_id TEXT REFERENCES time_period(id),
  setting_place_id TEXT REFERENCES place(id),
  setting_text TEXT,
  original_publication_date TEXT,
  universe_id TEXT REFERENCES universe(id),
  series_id TEXT REFERENCES series(id),
  series_position REAL,
  makeup_override TEXT CHECK (makeup_override IS NULL OR makeup_override NOT GLOB '*[^MFX]*'),
  is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0,1)),
  shelf TEXT CHECK (shelf IS NULL OR shelf IN ('tbr','up_next')),
  tbr_priority INTEGER,
  planned_format TEXT CHECK (planned_format IS NULL OR planned_format IN ('ebook','physical','audio')),
  external_ids TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE INDEX ix_book_lowertitle ON book(lower(title)) WHERE deleted_at IS NULL;
CREATE INDEX ix_book_shelf_tbr_priority ON book(shelf, tbr_priority) WHERE shelf IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX ix_book_universe_id ON book(universe_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_book_series_id_series_position ON book(series_id, series_position) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_book_touch AFTER UPDATE ON book FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE book SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;

-- Authors of a book, in display order.
CREATE TABLE book_author (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES book(id),
  author_id TEXT NOT NULL REFERENCES author(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE UNIQUE INDEX ux_book_author_book_id_author_id ON book_author(book_id, author_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_book_author_author_id ON book_author(author_id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_book_author_touch AFTER UPDATE ON book_author FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE book_author SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;

-- Default narrators of a book. Each Read can override them.
CREATE TABLE book_narrator (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES book(id),
  narrator_id TEXT NOT NULL REFERENCES narrator(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE UNIQUE INDEX ux_book_narrator_book_id_narrator_id ON book_narrator(book_id, narrator_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_book_narrator_narrator_id ON book_narrator(narrator_id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_book_narrator_touch AFTER UPDATE ON book_narrator FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE book_narrator SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;

CREATE TABLE book_genre (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES book(id),
  genre_id TEXT NOT NULL REFERENCES genre(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE UNIQUE INDEX ux_book_genre_book_id_genre_id ON book_genre(book_id, genre_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_book_genre_genre_id ON book_genre(genre_id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_book_genre_touch AFTER UPDATE ON book_genre FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE book_genre SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;

CREATE TABLE book_theme (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES book(id),
  theme_id TEXT NOT NULL REFERENCES theme(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE UNIQUE INDEX ux_book_theme_book_id_theme_id ON book_theme(book_id, theme_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_book_theme_theme_id ON book_theme(theme_id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_book_theme_touch AFTER UPDATE ON book_theme FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE book_theme SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;

CREATE TABLE book_trope (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES book(id),
  trope_id TEXT NOT NULL REFERENCES trope(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE UNIQUE INDEX ux_book_trope_book_id_trope_id ON book_trope(book_id, trope_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_book_trope_trope_id ON book_trope(trope_id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_book_trope_touch AFTER UPDATE ON book_trope FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE book_trope SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;

-- Release date per format. Powers Unreleased status and the Upcoming Releases view.
CREATE TABLE format_release (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES book(id),
  format TEXT NOT NULL CHECK (format IN ('ebook','physical','audio')),
  status TEXT NOT NULL DEFAULT 'tba' CHECK (status IN ('dated','tba','not_planned')),
  release_date TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  CHECK ((status = 'dated') = (release_date IS NOT NULL))
);
CREATE UNIQUE INDEX ux_format_release_book_id_format ON format_release(book_id, format) WHERE deleted_at IS NULL;
CREATE INDEX ix_format_release_release_date ON format_release(release_date) WHERE release_date IS NOT NULL AND deleted_at IS NULL;
CREATE TRIGGER trg_format_release_touch AFTER UPDATE ON format_release FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE format_release SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;


-- ===== Reads, narration, and day entries =====

-- One reading of a book. A re-read is a new row. rating is quarter stars as 0-20; NULL means unrated. color_index (0-9) is the calendar color, assigned in rotation when the read is created.
CREATE TABLE read (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES book(id),
  status TEXT NOT NULL DEFAULT 'finished' CHECK (status IN ('reading','finished','on_hold','dnf')),
  start_date TEXT,
  finish_date TEXT,
  finish_time TEXT CHECK (finish_time IS NULL OR finish_time GLOB '[0-2][0-9]:[0-5][0-9]'),
  rating INTEGER CHECK (rating IS NULL OR rating BETWEEN 0 AND 20),
  format TEXT CHECK (format IS NULL OR format IN ('physical','audio','ebook')),
  source_id TEXT REFERENCES source(id),
  audio_length_seconds INTEGER,
  narration_style TEXT CHECK (narration_style IS NULL OR narration_style IN ('solo','dual','duet','full_cast','immersive')),
  color_index INTEGER CHECK (color_index IS NULL OR color_index BETWEEN 0 AND 9),
  category_id TEXT REFERENCES category(id),
  prompt TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  CHECK (start_date IS NULL OR finish_date IS NULL OR finish_date >= start_date)
);
CREATE INDEX ix_read_finish_date ON read(finish_date) WHERE deleted_at IS NULL;
CREATE INDEX ix_read_book_id ON read(book_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_read_status ON read(status) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_read_touch AFTER UPDATE ON read FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE read SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;

-- A narrator on one listen, with accent and thumbs rating.
CREATE TABLE read_narrator (
  id TEXT PRIMARY KEY,
  read_id TEXT NOT NULL REFERENCES read(id),
  narrator_id TEXT NOT NULL REFERENCES narrator(id),
  accent_id TEXT REFERENCES accent(id),
  rating TEXT CHECK (rating IS NULL OR rating IN ('up','neutral','down')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE UNIQUE INDEX ux_read_narrator_read_id_narrator_id ON read_narrator(read_id, narrator_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_read_narrator_narrator_id ON read_narrator(narrator_id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_read_narrator_touch AFTER UPDATE ON read_narrator FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE read_narrator SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;

-- Characters a narrator voiced on a listen. Shown on Character, Read, and Narrator pages.
CREATE TABLE read_narrator_character (
  id TEXT PRIMARY KEY,
  read_narrator_id TEXT NOT NULL REFERENCES read_narrator(id),
  character_id TEXT NOT NULL REFERENCES character(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE UNIQUE INDEX ux_read_narrator_character_read_narrator_id_character_id ON read_narrator_character(read_narrator_id, character_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_read_narrator_character_character_id ON read_narrator_character(character_id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_read_narrator_character_touch AFTER UPDATE ON read_narrator_character FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE read_narrator_character SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;

-- Optional reading-log entry. Positions are where you got to by the end of the day.
CREATE TABLE day_entry (
  id TEXT PRIMARY KEY,
  read_id TEXT NOT NULL REFERENCES read(id),
  entry_date TEXT NOT NULL,
  position_page INTEGER,
  position_percent REAL CHECK (position_percent IS NULL OR position_percent BETWEEN 0 AND 100),
  position_seconds INTEGER,
  text TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE UNIQUE INDEX ux_day_entry_read_id_entry_date ON day_entry(read_id, entry_date) WHERE deleted_at IS NULL;
CREATE INDEX ix_day_entry_entry_date ON day_entry(entry_date) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_day_entry_touch AFTER UPDATE ON day_entry FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE day_entry SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;


-- ===== Characters =====

-- Basic characters and featured ones (is_featured = 1, has a page) are the same row.
CREATE TABLE character (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_featured INTEGER NOT NULL DEFAULT 0 CHECK (is_featured IN (0,1)),
  description TEXT,
  gender TEXT CHECK (gender IS NULL OR gender IN ('male','female','non_binary','other')),
  gender_detail TEXT,
  is_transgender INTEGER NOT NULL DEFAULT 0 CHECK (is_transgender IN (0,1)),
  age_min INTEGER,
  age_max INTEGER,
  age_is_approximate INTEGER NOT NULL DEFAULT 0 CHECK (age_is_approximate IN (0,1)),
  sexuality_id TEXT REFERENCES sexuality(id),
  organization TEXT,
  current_place_id TEXT REFERENCES place(id),
  origin_note TEXT,
  notes TEXT,
  external_ids TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  CHECK (age_min IS NULL OR age_max IS NULL OR age_max >= age_min)
);
CREATE INDEX ix_character_lowername ON character(lower(name)) WHERE deleted_at IS NULL;
CREATE INDEX ix_character_is_featured ON character(is_featured) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_character_touch AFTER UPDATE ON character FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE character SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;

-- Nicknames, previous names, aliases.
CREATE TABLE character_alt_name (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES character(id),
  name TEXT NOT NULL,
  name_type_id TEXT REFERENCES name_type(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE INDEX ix_character_alt_name_character_id ON character_alt_name(character_id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_character_alt_name_touch AFTER UPDATE ON character_alt_name FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE character_alt_name SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;

CREATE TABLE character_occupation (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES character(id),
  occupation_id TEXT NOT NULL REFERENCES occupation(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE UNIQUE INDEX ux_character_occupation_character_id_occupation_id ON character_occupation(character_id, occupation_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_character_occupation_occupation_id ON character_occupation(occupation_id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_character_occupation_touch AFTER UPDATE ON character_occupation FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE character_occupation SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;

CREATE TABLE character_previous_place (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES character(id),
  place_id TEXT NOT NULL REFERENCES place(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE UNIQUE INDEX ux_character_previous_place_character_id_place_id ON character_previous_place(character_id, place_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_character_previous_place_place_id ON character_previous_place(place_id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_character_previous_place_touch AFTER UPDATE ON character_previous_place FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE character_previous_place SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;

CREATE TABLE character_tag_link (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES character(id),
  character_tag_id TEXT NOT NULL REFERENCES character_tag(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE UNIQUE INDEX ux_character_tag_link_character_id_character_tag_id ON character_tag_link(character_id, character_tag_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_character_tag_link_character_tag_id ON character_tag_link(character_tag_id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_character_tag_link_touch AFTER UPDATE ON character_tag_link FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE character_tag_link SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;

-- Art gallery. An image linked to two characters appears on both pages.
CREATE TABLE character_image (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES character(id),
  image_id TEXT NOT NULL REFERENCES image(id),
  is_main INTEGER NOT NULL DEFAULT 0 CHECK (is_main IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE UNIQUE INDEX ux_character_image_character_id_image_id ON character_image(character_id, image_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_character_image_image_id ON character_image(image_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX ux_character_image_character_id ON character_image(character_id) WHERE is_main = 1 AND deleted_at IS NULL;
CREATE TRIGGER trg_character_image_touch AFTER UPDATE ON character_image FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE character_image SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;

-- A character in a book: main (the featured couple/group) or side (appears in another character's book).
CREATE TABLE book_character (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES book(id),
  character_id TEXT NOT NULL REFERENCES character(id),
  role TEXT NOT NULL CHECK (role IN ('main','side')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE UNIQUE INDEX ux_book_character_book_id_character_id ON book_character(book_id, character_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_book_character_character_id ON book_character(character_id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_book_character_touch AFTER UPDATE ON book_character FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE book_character SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;

-- One row per pair and type, stored with character_a_id < character_b_id. Labels say what each is to the other.
CREATE TABLE character_relationship (
  id TEXT PRIMARY KEY,
  character_a_id TEXT NOT NULL REFERENCES character(id),
  character_b_id TEXT NOT NULL REFERENCES character(id),
  rel_type TEXT NOT NULL CHECK (rel_type IN ('partner','family','friend','other')),
  is_current INTEGER CHECK (is_current IS NULL OR is_current IN (0,1)),
  a_is_to_b TEXT,
  b_is_to_a TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  CHECK (character_a_id < character_b_id)
);
CREATE UNIQUE INDEX ux_character_relationship_character_a_id_character_b_id_rel_type ON character_relationship(character_a_id, character_b_id, rel_type) WHERE deleted_at IS NULL;
CREATE INDEX ix_character_relationship_character_b_id ON character_relationship(character_b_id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_character_relationship_touch AFTER UPDATE ON character_relationship FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE character_relationship SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;


-- ===== Journal years, goals, challenges =====

-- One row per journal year. Calendar, charts, and lists are filtered views of global data.
CREATE TABLE journal_year (
  id TEXT PRIMARY KEY,
  year INTEGER NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE UNIQUE INDEX ux_journal_year_year ON journal_year(year) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_journal_year_touch AFTER UPDATE ON journal_year FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE journal_year SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;

-- Yearly goals, set up each year. metric is open-ended (books, pages, series_finished, ...), checked by the app.
CREATE TABLE goal (
  id TEXT PRIMARY KEY,
  journal_year_id TEXT NOT NULL REFERENCES journal_year(id),
  label TEXT NOT NULL,
  metric TEXT NOT NULL,
  target REAL NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE INDEX ix_goal_journal_year_id ON goal(journal_year_id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_goal_touch AFTER UPDATE ON goal FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE goal SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;

-- A challenge in one year. Repeating challenges are copied forward by the app (slots and art copied, completions not); copied_from_challenge_id keeps the lineage.
CREATE TABLE challenge (
  id TEXT PRIMARY KEY,
  journal_year_id TEXT NOT NULL REFERENCES journal_year(id),
  copied_from_challenge_id TEXT REFERENCES challenge(id),
  name TEXT NOT NULL,
  logo_image_id TEXT REFERENCES image(id),
  color TEXT,
  goal_text TEXT,
  slot_kind TEXT NOT NULL CHECK (slot_kind IN ('named','numbered','grid','open')),
  goal_count INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE INDEX ix_challenge_journal_year_id ON challenge(journal_year_id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_challenge_touch AFTER UPDATE ON challenge FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE challenge SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;

-- A slot in a challenge (a mug, a letter, a state). art_image_id is the optional collectible.
CREATE TABLE challenge_slot (
  id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL REFERENCES challenge(id),
  label TEXT NOT NULL,
  prompt_text TEXT,
  position INTEGER NOT NULL,
  art_image_id TEXT REFERENCES image(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  UNIQUE (id, challenge_id)
);
CREATE UNIQUE INDEX ux_challenge_slot_challenge_id_position ON challenge_slot(challenge_id, position) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_challenge_slot_touch AFTER UPDATE ON challenge_slot FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE challenge_slot SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;

-- A Read counted toward a challenge, optionally in a slot. At most one per read per challenge.
CREATE TABLE challenge_completion (
  id TEXT PRIMARY KEY,
  read_id TEXT NOT NULL REFERENCES read(id),
  challenge_id TEXT NOT NULL REFERENCES challenge(id),
  slot_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  FOREIGN KEY (slot_id, challenge_id) REFERENCES challenge_slot(id, challenge_id)
);
CREATE UNIQUE INDEX ux_challenge_completion_read_id_challenge_id ON challenge_completion(read_id, challenge_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX ux_challenge_completion_slot_id ON challenge_completion(slot_id) WHERE slot_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX ix_challenge_completion_challenge_id ON challenge_completion(challenge_id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_challenge_completion_touch AFTER UPDATE ON challenge_completion FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE challenge_completion SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;

-- Why a book was picked: a challenge, an external challenge, Treat, Trick, or other (TBR, Next in Series).
CREATE TABLE category (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('challenge','external','treat','trick','other')),
  challenge_id TEXT REFERENCES challenge(id),
  color TEXT,
  icon_image_id TEXT REFERENCES image(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE INDEX ix_category_kind ON category(kind) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_category_touch AFTER UPDATE ON category FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE category SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;

-- Best-of picks for the Book Bracket. period: month 1-12, quarter 1-4, half 1-2, year 1.
CREATE TABLE bracket_pick (
  id TEXT PRIMARY KEY,
  journal_year_id TEXT NOT NULL REFERENCES journal_year(id),
  level TEXT NOT NULL CHECK (level IN ('month','quarter','half','year')),
  period INTEGER NOT NULL,
  read_id TEXT NOT NULL REFERENCES read(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  CHECK ((level='month' AND period BETWEEN 1 AND 12) OR (level='quarter' AND period BETWEEN 1 AND 4) OR (level='half' AND period BETWEEN 1 AND 2) OR (level='year' AND period = 1))
);
CREATE UNIQUE INDEX ux_bracket_pick_journal_year_id_level_period ON bracket_pick(journal_year_id, level, period) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_bracket_pick_touch AFTER UPDATE ON bracket_pick FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE bracket_pick SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;


-- ===== App, imports, and search =====

-- Color palettes. tokens is JSON (accents, backgrounds, month colors).
CREATE TABLE palette (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_builtin INTEGER NOT NULL DEFAULT 0 CHECK (is_builtin IN (0,1)),
  tokens TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE TRIGGER trg_palette_touch AFTER UPDATE ON palette FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE palette SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;

-- One run of an importer, so it can be reviewed and undone.
CREATE TABLE import_batch (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('notion_books','notion_characters','pdf_journal','goodreads','storygraph','cover_lookup','other')),
  note TEXT,
  finished_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE TRIGGER trg_import_batch_touch AFTER UPDATE ON import_batch FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE import_batch SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;

-- Rows waiting for review before they become real records.
CREATE TABLE import_staging (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES import_batch(id),
  entity_type TEXT NOT NULL,
  source_ref TEXT,
  payload TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending','accepted','rejected','merged')),
  target_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE INDEX ix_import_staging_batch_id_review_status ON import_staging(batch_id, review_status) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_import_staging_touch AFTER UPDATE ON import_staging FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE import_staging SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;

-- Small tables outside the sync-row pattern
CREATE TABLE app_setting (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE TABLE schema_migration (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
-- Full-text search, filled by the app (entity_type: book, author, narrator, series, character, read notes)
CREATE VIRTUAL TABLE search_fts USING fts5(entity_type UNINDEXED, entity_id UNINDEXED, title, body);


-- ===== Derived views (the app can use these or recompute) =====
CREATE VIEW v_book_makeup AS
SELECT b.id AS book_id,
  COALESCE(b.makeup_override,
    (SELECT group_concat(l, '') FROM (
       SELECT CASE WHEN c.gender IS NULL THEN '?' WHEN c.gender = 'male' THEN 'M' WHEN c.gender = 'female' THEN 'F' ELSE 'X' END AS l
       FROM book_character bc JOIN character c ON c.id = bc.character_id
       WHERE bc.book_id = b.id AND bc.role = 'main' AND bc.deleted_at IS NULL AND c.deleted_at IS NULL
       ORDER BY bc.sort_order))) AS makeup
FROM book b WHERE b.deleted_at IS NULL;

CREATE VIEW v_book_bucket AS
SELECT book_id, makeup,
  CASE
    WHEN makeup IS NULL OR length(makeup) < 2 OR makeup GLOB '*[?]*' THEN 'unknown'
    WHEN length(makeup) = 2 THEN CASE
      WHEN substr(makeup,1,1) = substr(makeup,2,1) THEN makeup
      WHEN makeup GLOB '*M*' AND makeup GLOB '*F*' THEN 'MF'
      WHEN makeup GLOB '*M*' AND makeup GLOB '*X*' THEN 'MX'
      ELSE 'FX' END
    WHEN replace(makeup,'M','') = '' THEN 'MM'
    WHEN replace(makeup,'F','') = '' THEN 'FF'
    WHEN replace(makeup,'X','') = '' THEN 'XX'
    ELSE 'Other' END AS dashboard_bucket
FROM v_book_makeup;

CREATE VIEW v_book_rating AS
SELECT book_id, AVG(rating) / 4.0 AS avg_stars, COUNT(rating) AS rated_reads
FROM read WHERE deleted_at IS NULL AND rating IS NOT NULL GROUP BY book_id;

-- reading status is derived by the app unless reading_status_override is set
CREATE VIEW v_series_summary AS
SELECT s.id AS series_id, s.title,
  COUNT(bs.id) AS books_listed,
  COALESCE(s.total_books, COUNT(bs.id)) AS books_total,
  COALESCE(SUM(EXISTS (SELECT 1 FROM read r WHERE r.book_id = bs.id AND r.status = 'finished' AND r.deleted_at IS NULL)), 0) AS books_read,
  AVG(vr.avg_stars) AS avg_stars
FROM series s
LEFT JOIN book bs ON bs.series_id = s.id AND bs.deleted_at IS NULL
LEFT JOIN v_book_rating vr ON vr.book_id = bs.id
WHERE s.deleted_at IS NULL GROUP BY s.id;

CREATE VIEW v_book_release AS
SELECT b.id AS book_id,
  CASE WHEN EXISTS (SELECT 1 FROM format_release f WHERE f.book_id = b.id AND f.deleted_at IS NULL
                      AND f.status IN ('dated','tba') AND (f.status = 'tba' OR f.release_date > date('now')))
        AND NOT EXISTS (SELECT 1 FROM format_release f WHERE f.book_id = b.id AND f.deleted_at IS NULL
                      AND f.status = 'dated' AND f.release_date <= date('now'))
       THEN 1 ELSE 0 END AS is_unreleased
FROM book b WHERE b.deleted_at IS NULL;

CREATE VIEW v_character_voiced_by AS
SELECT rnc.character_id, rn.narrator_id, r.book_id, r.id AS read_id
FROM read_narrator_character rnc
JOIN read_narrator rn ON rn.id = rnc.read_narrator_id
JOIN read r ON r.id = rn.read_id
WHERE rnc.deleted_at IS NULL AND rn.deleted_at IS NULL AND r.deleted_at IS NULL;

-- the "BOOK LOG: 27" number: position among the year's finished reads by finish date, then finish time
-- (reads without a time, such as imports, sort after timed reads on the same day)
CREATE VIEW v_read_year_number AS
SELECT id AS read_id, book_id, finish_date,
  ROW_NUMBER() OVER (PARTITION BY substr(finish_date, 1, 4)
                     ORDER BY finish_date, COALESCE(finish_time, '99:99'), created_at) AS year_number
FROM read WHERE deleted_at IS NULL AND status = 'finished' AND finish_date IS NOT NULL;


-- ===== Seed data =====
INSERT INTO category (id, name, kind) VALUES
  ('00000000-0000-4000-8000-000000000001', 'Free Read', 'other'),
  ('00000000-0000-4000-8000-000000000002', 'Treat', 'treat'),
  ('00000000-0000-4000-8000-000000000003', 'Trick', 'trick');
INSERT INTO schema_migration (version, name) VALUES (1, 'initial schema');

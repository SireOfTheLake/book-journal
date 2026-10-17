-- 1. A series has its own authors (real author records), no longer worked out from its books.
CREATE TABLE series_author (
  id TEXT PRIMARY KEY,
  series_id TEXT NOT NULL REFERENCES series(id),
  author_id TEXT NOT NULL REFERENCES author(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE UNIQUE INDEX ux_series_author ON series_author(series_id, author_id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_series_author_touch AFTER UPDATE ON series_author FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE series_author SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;

-- Start each existing series with the authors of its books, in the order they first appear.
INSERT INTO series_author (id, series_id, author_id, sort_order)
SELECT lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))),
       series_id, author_id, ord - 1
FROM (
  SELECT series_id, author_id, row_number() OVER (PARTITION BY series_id ORDER BY first_key) AS ord
  FROM (
    SELECT b.series_id AS series_id, ba.author_id AS author_id, min(b.rowid * 1000 + ba.sort_order) AS first_key
    FROM book b JOIN book_author ba ON ba.book_id = b.id AND ba.deleted_at IS NULL JOIN author a ON a.id = ba.author_id AND a.deleted_at IS NULL
    WHERE b.series_id IS NOT NULL AND b.deleted_at IS NULL
    GROUP BY b.series_id, ba.author_id
  )
);

-- 2. Whether a character is alive, dead, or undead.
ALTER TABLE character ADD COLUMN life_status TEXT CHECK (life_status IS NULL OR life_status IN ('alive', 'dead', 'undead'));

-- 3. Relationship status: whether the other person is deceased, or the two are estranged.
--    Linked characters are stored per side (like the relationship labels), so each side can differ.
ALTER TABLE character_relationship ADD COLUMN a_status TEXT CHECK (a_status IS NULL OR a_status IN ('deceased', 'estranged'));
ALTER TABLE character_relationship ADD COLUMN b_status TEXT CHECK (b_status IS NULL OR b_status IN ('deceased', 'estranged'));
ALTER TABLE related_person ADD COLUMN status TEXT CHECK (status IS NULL OR status IN ('deceased', 'estranged'));

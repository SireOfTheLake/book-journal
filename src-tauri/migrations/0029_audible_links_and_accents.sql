-- Narrator accents on a listen work like genres and tropes: a book's narrator can have several.
CREATE TABLE read_narrator_accent (
  id TEXT PRIMARY KEY,
  read_narrator_id TEXT NOT NULL REFERENCES read_narrator(id),
  accent_id TEXT NOT NULL REFERENCES accent(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE UNIQUE INDEX ux_read_narrator_accent ON read_narrator_accent(read_narrator_id, accent_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_read_narrator_accent_accent ON read_narrator_accent(accent_id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_read_narrator_accent_touch AFTER UPDATE ON read_narrator_accent FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN UPDATE read_narrator_accent SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id; END;

-- The accent each listen already had becomes its first accent. (The old single column stays, unused.)
INSERT INTO read_narrator_accent (id, read_narrator_id, accent_id)
SELECT lower(hex(randomblob(16))), rn.id, rn.accent_id FROM read_narrator rn
WHERE rn.accent_id IS NOT NULL AND rn.deleted_at IS NULL AND EXISTS (SELECT 1 FROM accent a WHERE a.id = rn.accent_id AND a.deleted_at IS NULL);

-- Every author and narrator gets an "Audible Page" link when they are created, and the ones you already have get it now.
-- Narrator: the name with + between the words. Author: periods and spaces become -, so "J.J. Mulder" is J-J-Mulder.
CREATE TRIGGER trg_author_audible AFTER INSERT ON author FOR EACH ROW WHEN NEW.links IS NULL
BEGIN UPDATE author SET links = json_array(json_object('label', 'Audible Page', 'url', 'https://www.audible.ca/author/' || trim(replace(replace(replace(replace(replace(replace(NEW.name,'.','-'),' ','-'),'--','-'),'--','-'),'--','-'),'--','-'),'-'))) WHERE id = NEW.id; END;
UPDATE author SET links = CASE WHEN links IS NULL OR trim(links) IN ('', '[]') THEN json_array(json_object('label', 'Audible Page', 'url', 'https://www.audible.ca/author/' || trim(replace(replace(replace(replace(replace(replace(name,'.','-'),' ','-'),'--','-'),'--','-'),'--','-'),'--','-'),'-'))) ELSE json_insert(links, '$[#]', json(json_object('label', 'Audible Page', 'url', 'https://www.audible.ca/author/' || trim(replace(replace(replace(replace(replace(replace(name,'.','-'),' ','-'),'--','-'),'--','-'),'--','-'),'--','-'),'-')))) END
WHERE deleted_at IS NULL AND (links IS NULL OR instr(links, 'Audible Page') = 0);
CREATE TRIGGER trg_narrator_audible AFTER INSERT ON narrator FOR EACH ROW WHEN NEW.links IS NULL
BEGIN UPDATE narrator SET links = json_array(json_object('label', 'Audible Page', 'url', 'https://www.audible.ca/search?searchNarrator=' || replace(trim(replace(replace(replace(replace(replace(replace(NEW.name,'%','%25'),'&','%26'),'#','%23'),'?','%3F'),'/','%2F'),'+','%2B')),' ','+'))) WHERE id = NEW.id; END;
UPDATE narrator SET links = CASE WHEN links IS NULL OR trim(links) IN ('', '[]') THEN json_array(json_object('label', 'Audible Page', 'url', 'https://www.audible.ca/search?searchNarrator=' || replace(trim(replace(replace(replace(replace(replace(replace(name,'%','%25'),'&','%26'),'#','%23'),'?','%3F'),'/','%2F'),'+','%2B')),' ','+'))) ELSE json_insert(links, '$[#]', json(json_object('label', 'Audible Page', 'url', 'https://www.audible.ca/search?searchNarrator=' || replace(trim(replace(replace(replace(replace(replace(replace(name,'%','%25'),'&','%26'),'#','%23'),'?','%3F'),'/','%2F'),'+','%2B')),' ','+')))) END
WHERE deleted_at IS NULL AND (links IS NULL OR instr(links, 'Audible Page') = 0);

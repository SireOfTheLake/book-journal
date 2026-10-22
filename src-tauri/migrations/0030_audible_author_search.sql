-- Audible author pages have an ID in their address that we cannot look up, so an author's "Audible Page" link is a search instead:
-- https://www.audible.ca/search?searchAuthor=J.J.+Mulder  (you can still paste the real author page into the link yourself).
DROP TRIGGER trg_author_audible;
CREATE TRIGGER trg_author_audible AFTER INSERT ON author FOR EACH ROW WHEN NEW.links IS NULL
BEGIN UPDATE author SET links = json_array(json_object('label', 'Audible Page', 'url', 'https://www.audible.ca/search?searchAuthor=' || replace(trim(replace(replace(replace(replace(replace(replace(NEW.name,'%','%25'),'&','%26'),'#','%23'),'?','%3F'),'/','%2F'),'+','%2B')),' ','+'))) WHERE id = NEW.id; END;
-- Only the links this app made itself are changed; one you have edited is left alone.
UPDATE author SET links = (SELECT json_group_array(CASE WHEN json_extract(j.value, '$.label') = 'Audible Page' AND json_extract(j.value, '$.url') = 'https://www.audible.ca/author/' || trim(replace(replace(replace(replace(replace(replace(author.name,'.','-'),' ','-'),'--','-'),'--','-'),'--','-'),'--','-'),'-')
    THEN json_object('label', 'Audible Page', 'url', 'https://www.audible.ca/search?searchAuthor=' || replace(trim(replace(replace(replace(replace(replace(replace(author.name,'%','%25'),'&','%26'),'#','%23'),'?','%3F'),'/','%2F'),'+','%2B')),' ','+')) ELSE json(j.value) END) FROM json_each(author.links) j)
WHERE deleted_at IS NULL AND links IS NOT NULL AND instr(links, 'https://www.audible.ca/author/') > 0;

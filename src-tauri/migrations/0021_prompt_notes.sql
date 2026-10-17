-- A prompt can ask for a short note when a book is placed on it (a character's name, a sport...).
-- Per challenge: ask on every prompt, and what to call the note. Per prompt: ask (1), do not ask (0), or follow the challenge (NULL).
ALTER TABLE challenge ADD COLUMN ask_note INTEGER NOT NULL DEFAULT 0;
ALTER TABLE challenge ADD COLUMN note_label TEXT;
ALTER TABLE challenge_slot ADD COLUMN ask_note INTEGER;
ALTER TABLE challenge_completion ADD COLUMN note TEXT;

-- A challenge (a seasonal Bingo board, say) can have a date window: it shows on Home between these dates (YYYY-MM-DD, both optional).
ALTER TABLE challenge ADD COLUMN active_from TEXT;
ALTER TABLE challenge ADD COLUMN active_until TEXT;

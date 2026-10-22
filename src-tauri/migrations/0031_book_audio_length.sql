-- A book's usual audiobook length. Each new read of the book starts with it, and a read can still have its own.
ALTER TABLE book ADD COLUMN audio_length_seconds INTEGER;

-- Books you have already listened to: the most recent listen's length becomes the book's usual length.
UPDATE book SET audio_length_seconds = (
  SELECT r.audio_length_seconds FROM read r
  WHERE r.book_id = book.id AND r.deleted_at IS NULL AND r.format = 'audio' AND r.audio_length_seconds IS NOT NULL
  ORDER BY COALESCE(r.finish_date, '9999') DESC, r.created_at DESC, r.rowid DESC LIMIT 1
) WHERE audio_length_seconds IS NULL;

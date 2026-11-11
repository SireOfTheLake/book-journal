-- A Pyramid challenge: kind 'grid' with pyramid = 1. Its sub-categories are the rows, and row N always has N prompts named "<row> slot 1" ... "<row> slot N".
ALTER TABLE challenge ADD COLUMN pyramid INTEGER NOT NULL DEFAULT 0;

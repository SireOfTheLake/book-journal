-- How a challenge's cards are arranged: their order and how many books wide each one is (JSON, null = defaults).
ALTER TABLE challenge ADD COLUMN layout TEXT;

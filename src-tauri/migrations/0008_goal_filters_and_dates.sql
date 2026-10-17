-- Goals can be limited to certain genres, tropes, or a format, and can cover part of a year.
-- filters: a JSON list like [{"kind":"genre","mode":"include","ref":"<genre id>"}], checked by the app.
-- start_date / end_date: empty means the whole journal year.
ALTER TABLE goal ADD COLUMN filters TEXT;
ALTER TABLE goal ADD COLUMN start_date TEXT;
ALTER TABLE goal ADD COLUMN end_date TEXT;

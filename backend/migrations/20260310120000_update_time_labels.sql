ALTER TABLE time_labels RENAME COLUMN timestamp TO start_timestamp;
ALTER TABLE time_labels ADD COLUMN end_timestamp TIMESTAMPTZ;
ALTER TABLE time_labels ADD COLUMN color TEXT NOT NULL DEFAULT '';
ALTER TABLE time_labels ALTER COLUMN color DROP DEFAULT;
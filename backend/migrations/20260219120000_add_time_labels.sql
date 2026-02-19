-- add time_labels table to store event labels attached to EEG timestamps during sessions

CREATE TABLE IF NOT EXISTS time_labels (
  id         SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL
    REFERENCES sessions(id) ON DELETE CASCADE,
  timestamp  TIMESTAMPTZ NOT NULL,    -- timestamp of the EEG data with timezone info
  label      TEXT NOT NULL           -- label for the EEG data
);

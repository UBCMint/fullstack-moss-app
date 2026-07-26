-- note that this assumes that eeg_data has no rows (since as of this migration there should be no real data yet)
-- to do so just run TRUNCATE TABLE eeg_data before applying this migration
ALTER TABLE eeg_data
ADD COLUMN session_id INTEGER NOT NULL,
ADD CONSTRAINT fk_session FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE;

-- we enforce uniqueness on imports through imposing a unique constraint on the 
-- combination of session_id and time, preventing duplicate entries for the same session and timestamp
ALTER TABLE eeg_data
ADD CONSTRAINT uq_eeg_session_time UNIQUE (session_id, time);

-- we can create an index on session_id and time, since the bulk of our queries will be filtering based on these
CREATE INDEX eeg_data_session_time_idx ON eeg_data (session_id, time DESC); -- using DESC since i'm expecting recent data to be more relevant
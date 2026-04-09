-- we enforce uniqueness on imports through imposing a unique constraint on the 
-- combination of session_id and time, preventing duplicate entries for the same session and timestamp
ALTER TABLE eeg_data
ADD CONSTRAINT uq_eeg_session_time UNIQUE (session_id, time);
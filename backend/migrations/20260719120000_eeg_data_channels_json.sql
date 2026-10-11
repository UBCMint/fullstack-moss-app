-- Expand eeg_data from fixed channel1..channel4 columns to a single JSONB
-- `channels` column holding all 12 channels (indices 0..7 = EEG, 8..11 = EMG).
--
-- Hard cutover: existing channel1..channel4 rows are migrated into the new
-- column with zero-padding for channels 4..11, then the old columns are dropped.

ALTER TABLE eeg_data
    ADD COLUMN channels JSONB;

UPDATE eeg_data
SET channels = jsonb_build_array(
        channel1, channel2, channel3, channel4,
        0, 0, 0, 0, 0, 0, 0, 0
    );

ALTER TABLE eeg_data
    ALTER COLUMN channels SET NOT NULL;

ALTER TABLE eeg_data
    DROP COLUMN channel1,
    DROP COLUMN channel2,
    DROP COLUMN channel3,
    DROP COLUMN channel4;

-- Enforce array length = 12 at the DB layer as a defense in depth.
ALTER TABLE eeg_data
    ADD CONSTRAINT eeg_data_channels_len_chk
    CHECK (jsonb_typeof(channels) = 'array' AND jsonb_array_length(channels) = 12);

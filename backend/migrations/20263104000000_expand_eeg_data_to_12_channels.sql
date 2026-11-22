-- Expand eeg_data from 4 Muse channels to the 12-channel Signals layout: 8 EEG + 4 EMG.
--
-- Wide format (one row per sample, one column per channel) rather than long format
-- (session_id, time, channel, value): at 256 Hz a 12-channel session writes 256 rows/s
-- wide versus 3,072 rows/s long, and each long row repeats the 8-byte time + 4-byte
-- session_id + index entry. Wide keeps the (session_id, time) unique key and index as they
-- are, and TimescaleDB compresses per-column, which suits fixed channel columns well.
--
-- The existing channel1..channel4 columns hold the 4 Muse EEG channels, so they are renamed
-- to eeg1..eeg4 and existing rows keep their data. The new columns are NULL for those rows.
-- All channel columns are nullable: NULL means "this device has no such channel", which
-- lets a smaller layout (e.g. EEG_CHANNEL_COUNT=4, EMG_CHANNEL_COUNT=0) share the table.
--
-- The type changes from INTEGER to DOUBLE PRECISION. Samples are microvolt floats, and the
-- INTEGER columns were rounding every sample on insert.

ALTER TABLE eeg_data RENAME COLUMN channel1 TO eeg1;
ALTER TABLE eeg_data RENAME COLUMN channel2 TO eeg2;
ALTER TABLE eeg_data RENAME COLUMN channel3 TO eeg3;
ALTER TABLE eeg_data RENAME COLUMN channel4 TO eeg4;

ALTER TABLE eeg_data
    ALTER COLUMN eeg1 TYPE DOUBLE PRECISION,
    ALTER COLUMN eeg2 TYPE DOUBLE PRECISION,
    ALTER COLUMN eeg3 TYPE DOUBLE PRECISION,
    ALTER COLUMN eeg4 TYPE DOUBLE PRECISION,
    ALTER COLUMN eeg1 DROP NOT NULL,
    ALTER COLUMN eeg2 DROP NOT NULL,
    ALTER COLUMN eeg3 DROP NOT NULL,
    ALTER COLUMN eeg4 DROP NOT NULL,
    ADD COLUMN eeg5 DOUBLE PRECISION,
    ADD COLUMN eeg6 DOUBLE PRECISION,
    ADD COLUMN eeg7 DOUBLE PRECISION,
    ADD COLUMN eeg8 DOUBLE PRECISION,
    ADD COLUMN emg1 DOUBLE PRECISION,
    ADD COLUMN emg2 DOUBLE PRECISION,
    ADD COLUMN emg3 DOUBLE PRECISION,
    ADD COLUMN emg4 DOUBLE PRECISION;

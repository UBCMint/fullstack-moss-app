CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS test_time_series (
    id SERIAL,
    timestamp TIMESTAMPTZ NOT NULL,
    value DOUBLE PRECISION NOT NULL,
    metadata TEXT,
    -- Define a composite primary key that includes the partitioning column
    PRIMARY KEY (id, timestamp)
);

SELECT create_hypertable('test_time_series', 'timestamp', if_not_exists => TRUE);

CREATE TABLE IF NOT EXISTS eeg_data (
   time TIMESTAMPTZ NOT NULL,
   channel1 INTEGER  NOT NULL,
   channel2 INTEGER  NOT NULL,
   channel3 INTEGER  NOT NULL,
   channel4 INTEGER  NOT NULL
);

 SELECT create_hypertable('eeg_data', 'time', if_not_exists => TRUE);

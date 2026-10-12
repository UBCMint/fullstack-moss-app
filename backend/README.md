https://www.figma.com/board/4UUXdzNg0rMLQoMUcc5R3e/ubcmint_backend?node-id=0-1&t=NO81CLSnXEB2WoHj-1

For more info on set up: https://docs.tigerdata.com/self-hosted/latest/install/installation-docker/

# Prerequisites
- docker, https://www.docker.com/get-started/

# Setup Docker container 
- Pull the timescaleDB image
```
docker pull timescale/timescaledb:latest-pg17
```

- Run the container, replace `C:\Users\local_folder` with the folder location on your computer
```
docker run -d --name timescaledb -p 5432:5432 -e POSTGRES_PASSWORD=my_secure_password_123 -v C:\Users\local_folder:/var/lib/postgresql/data timescale/timescaledb:latest-pg17
```

# Setting up Database

- Access the database 
```sql
docker exec -it timescaledb psql -U postgres
```

*Note: to copy and paste, Ctr + Shift+ C*

- Set up Mint User
```sql
CREATE USER team_user WITH PASSWORD 'ubcmintpw';
\du --to check user is created
CREATE DATABASE ubcmint;
\l --to check the database was created
GRANT ALL PRIVILEGES ON DATABASE ubcmint TO team_user; 

SET ROLE team_user;
SELECT CURRENT_USER; --to check the current role is team_user
```

- Go into the created ubcmint database
```sql
\c ubcmint
```

- Creating the tables

 ```
 -- Create Users table
 CREATE TABLE users (
   id SERIAL PRIMARY KEY,
   username VARCHAR(50) NOT NULL UNIQUE,
   email VARCHAR(100) NOT NULL UNIQUE
 );
 
 -- Create User_Settings table
 CREATE TABLE user_settings (
   id SERIAL PRIMARY KEY,
   user_id INTEGER NOT NULL REFERENCES users(id),
   filter_config JSONB,
   interface_prefs JSONB
 );
 
 -- Create Sessions table
 CREATE TABLE sessions (
   id SERIAL PRIMARY KEY,
   user_id INTEGER NOT NULL REFERENCES users(id),
   started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   ended_at TIMESTAMPTZ
 );
 
 -- Create Headsets table
 CREATE TABLE headsets (
   id SERIAL PRIMARY KEY,
   model VARCHAR(100) NOT NULL,
   manufacturer VARCHAR(100) NOT NULL,
   serial_number TEXT UNIQUE,
   calibration_data JSONB
 );
 
 -- Create ML_Models table
 CREATE TABLE ml_models (
   id SERIAL PRIMARY KEY,
   name VARCHAR(100) NOT NULL,
   version VARCHAR(50),
   description TEXT,
   config JSONB
 );
 
 -- Create User_ML_Selections table
 CREATE TABLE user_ml_selections (
   id SERIAL PRIMARY KEY,
   user_id INTEGER NOT NULL REFERENCES users(id),
   ml_model_id INTEGER NOT NULL REFERENCES ml_models(id),
   parameters JSONB
 );
 
 -- Create EEG_Data table (to store time-series EEG data)
 CREATE TABLE eeg_data (
   time TIMESTAMPTZ NOT NULL,
   session_id INTEGER NOT NULL REFERENCES sessions(id),
   headset_id INTEGER NOT NULL REFERENCES headsets(id),
   channel1 DOUBLE PRECISION,
   channel2 DOUBLE PRECISION,
   channel3 DOUBLE PRECISION,
   channel4 DOUBLE PRECISION,
   PRIMARY KEY (time, session_id)
 );
 
 -- Convert the eeg_data table into a hypertable
 SELECT create_hypertable('eeg_data', 'time');
 ```
 
- to escape
```sql
exit
```

## Database

PostgreSQL with the TimescaleDB extension. The schema is defined entirely by the SQL files in
`backend/migrations/`.

### Tables

**`users`**

| Column | Type | Constraints |
|---|---|---|
| `id` | `SERIAL` | primary key |
| `username` | `TEXT` | not null, unique |
| `email` | `TEXT` | not null, unique |
| `password_hash` | `VARCHAR(257)` | not null, default `''` |

**`sessions`**

| Column | Type | Constraints |
|---|---|---|
| `id` | `SERIAL` | primary key |
| `name` | `TEXT` | not null, unique |

**`frontend_state`**: one row of UI state (JSON) per session.

| Column | Type | Constraints |
|---|---|---|
| `session_id` | `INTEGER` | primary key, references `sessions(id)` on delete cascade |
| `data` | `JSONB` | not null |
| `updated_at` | `TIMESTAMPTZ` | not null, default `NOW()` |

**`time_labels`**: annotations over a span of a session's timeline.

| Column | Type | Constraints |
|---|---|---|
| `id` | `SERIAL` | primary key |
| `session_id` | `INTEGER` | not null, references `sessions(id)` on delete cascade |
| `start_timestamp` | `TIMESTAMPTZ` | not null |
| `end_timestamp` | `TIMESTAMPTZ` | nullable |
| `label` | `TEXT` | not null |
| `color` | `TEXT` | not null |

**`eeg_data`**: the EEG samples (a hypertable, see below).

| Column | Type | Constraints |
|---|---|---|
| `time` | `TIMESTAMPTZ` | not null |
| `channel1` to `channel4` | `INTEGER` | not null |
| `session_id` | `INTEGER` | not null, references `sessions(id)` on delete cascade |

**`test_time_series`**: a hypertable created by the first migration for testing. Columns are
`id`, `timestamp`, `value`, `metadata`. Helper functions for it exist in `db.rs`, but nothing in
the application calls them.

### Relationships

- A session has at most one `frontend_state` row, any number of `time_labels`, and any number of
  `eeg_data` rows.
- Deleting a session deletes all of its `frontend_state`, `time_labels` and `eeg_data` rows.
- `users` is not linked to any other table.

### The `eeg_data` hypertable

A hypertable is a regular PostgreSQL table that TimescaleDB automatically splits into
time-based chunks. `eeg_data` is partitioned on its `time` column (`create_hypertable('eeg_data', 'time')`
in the first migration), which keeps inserts and time-range queries fast as data grows.

- **Unique constraint:** `uq_eeg_session_time` on `(session_id, time)`. Inserts use
  `ON CONFLICT (session_id, time) DO NOTHING`, so a sample with an existing timestamp for a
  session is skipped rather than overwritten or rejected. This is why re-importing a CSV does not
  create duplicates.
- **Index:** `eeg_data_session_time_idx` on `(session_id, time DESC)`, for queries that filter by
  session and time range.

### Migrations

Migrations are applied in ascending order of the numeric prefix in the filename, which is the
order listed here. They are run with `sqlx migrate run`; the api-server Docker image does this on
startup.

| # | File | What it does |
|---|---|---|
| 1 | `20250630230435_create_initial_tables.sql` | Enables the `timescaledb` extension. Creates `users` (`id`, `username`, `email`), `test_time_series` and `eeg_data` (`time`, `channel1` to `channel4`), and turns the last two into hypertables. |
| 2 | `20251101120000_add_sessions_and_frontend_state.sql` | Creates `sessions` and `frontend_state`. |
| 3 | `20260219120000_add_time_labels.sql` | Creates `time_labels` with `session_id`, `timestamp` and `label`. |
| 4 | `20260301000000_unique_eeg_session_time.sql` | Empty file. Applies no changes. The unique constraint on `eeg_data` is added by migration 6. |
| 5 | `20260310120000_update_time_labels.sql` | Renames `time_labels.timestamp` to `start_timestamp`, adds nullable `end_timestamp`, and adds `color` (not null; existing rows get `''`). |
| 6 | `20263101120000_sessions_on_eeg_data.sql` | Adds `eeg_data.session_id` (not null, foreign key to `sessions`), the unique constraint `uq_eeg_session_time`, and the index `eeg_data_session_time_idx`. `eeg_data` must be empty first: the new column is `NOT NULL` with no default. |
| 7 | `20263103300000_add_auth_column.sql` | Adds `users.password_hash` (`VARCHAR(257)`, not null, default `''`). Existing users get an empty hash. |

The numeric prefixes of migrations 6 and 7 (`20263101...`, `20263103...`) are not valid calendar
timestamps. They still sort after migrations 1 to 5, so they apply last.
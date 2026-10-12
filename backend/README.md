# MOSS Backend

Rust backend for the MOSS EEG platform: a REST API, a websocket server for live EEG streaming,
and a TimescaleDB database.

Architecture diagram: https://www.figma.com/board/4UUXdzNg0rMLQoMUcc5R3e/ubcmint_backend?node-id=0-1&t=NO81CLSnXEB2WoHj-1

- [Part 1: Setup](#part-1-setup)
- [Part 2: How the system works](#part-2-how-the-system-works)

---

# Part 1: Setup

Steps to run the backend locally. Commands assume you start in the repository root.

## Prerequisites

| Tool | Used for |
|---|---|
| Docker | Running the database |
| Rust (`cargo`) | Building and running the servers |
| `sqlx-cli` | Applying database migrations |
| Python 3.8 to 3.11, with development headers | The servers embed Python through PyO3 0.18, which does not support newer versions. The `python3` on your `PATH` is the one it builds against |
| `numpy` below 2.0, installed in that Python | The websocket server passes EEG data to Python as numpy arrays |
| CMake and a C/C++ toolchain | Building the LSL library (`lsl-sys`) |

Install `sqlx-cli` (the version the Docker image uses) with:

```sh
cargo install sqlx-cli --version 0.8.3 --no-default-features --features postgres
```

Install numpy with:

```sh
pip install "numpy<2"
```

The mock pipeline manager used by default needs nothing else. The real model needs the full list in
`backend/api-server/python/requirements.txt`.

## 1. Start the database

```sh
docker compose up -d db
```

This starts TimescaleDB (PostgreSQL 16) on port `5432` with these credentials, taken from
`docker-compose.yml`:

| Setting | Value |
|---|---|
| User | `postgres` |
| Password | `my_secure_password_123` |
| Database | `postgres` |

## 2. Apply the migrations

```sh
export DATABASE_URL="postgres://postgres:my_secure_password_123@localhost:5432/postgres"
sqlx migrate run --source backend/migrations
```

Run this before building the servers. They check their SQL queries against the live database at
compile time, so the tables must exist first.

## 3. Run the API server

```sh
cd backend/api-server
cargo run
```

Listens on `127.0.0.1:9000` by default.

## 4. Run the websocket server

In a second terminal:

```sh
export DATABASE_URL="postgres://postgres:my_secure_password_123@localhost:5432/postgres"
export PIPELINE_MANAGER_SCRIPT="$(pwd)/backend/shared-logic/src/signal_processing/moss/mock_manager.py"
cd backend/websocket-server
cargo run
```

Listens on `127.0.0.1:8080` by default. `PIPELINE_MANAGER_SCRIPT` must be set for local runs; its
default is a path that only exists inside the Docker image.

## Environment variables

| Variable | Used by | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | all | none (required) | PostgreSQL connection string |
| `API_HOST` | api-server | `127.0.0.1` | Address to bind |
| `API_PORT` | api-server | `9000` | Port to bind |
| `WS_HOST` | websocket-server | `127.0.0.1` | Address to bind |
| `WS_PORT` | websocket-server | `8080` | Port to bind |
| `PIPELINE_MANAGER_SCRIPT` | websocket-server | `/app/shared-logic/src/signal_processing/moss/mock_manager.py` | Python pipeline manager to load |

## Check that it works

With the database and API server running:

```sh
curl http://127.0.0.1:9000/users
```

A fresh database returns `[]`. The full list of routes is in
[`api-server/src/apidocumentation.md`](api-server/src/apidocumentation.md).

## Resetting the database

```sh
docker compose down -v
```

This deletes the database volume and all data in it. Repeat steps 1 and 2 afterwards.

---

# Part 2: How the system works

## Workspace layout

`backend/` is a Cargo workspace with three crates.

| Crate | Role |
|---|---|
| `shared-logic` | Library used by both servers: database access (`db.rs`), shared data types (`models.rs`), and the EEG acquisition and processing code |
| `api-server` | REST API (Axum) for users, sessions, saved frontend state, time labels, and EEG data import/export |
| `websocket-server` | Accepts a websocket connection from the frontend and streams EEG data to it while saving it to the database |

`backend/test-lsl` is a standalone binary for testing the LSL stream and is not part of the
workspace.

## How a request is handled

**REST (`api-server`).** The frontend calls the API server for anything that is a request and
response: creating sessions, saving UI state, reading or exporting stored EEG data. Handlers in
`api-server/src/main.rs` call functions in `shared-logic/src/db.rs`, which run SQL against the
database. See [`api-server/src/apidocumentation.md`](api-server/src/apidocumentation.md) for every
route.

**Live streaming (`websocket-server`).** For a live session the frontend opens a websocket, sends
a first message containing the session id and the processing pipeline, and then receives EEG
batches as they arrive. The same batches are written to the `eeg_data` table, so after a session
the data is read back through the REST API.

The websocket server, pipeline definition, and Python signal processing code are not covered in
this README.

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

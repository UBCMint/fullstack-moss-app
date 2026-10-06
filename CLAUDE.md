# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A full-stack EEG processing application for the UBC MINT MOSS platform: a Next.js frontend, two Rust services (an Axum REST API and a Tungstenite websocket server), a shared Rust library that embeds Python (via PyO3) for signal processing/ML, and a TimescaleDB/Postgres database.

## Running the stack

```sh
docker compose up --build       # full stack: db (5432), api-server (9000), websocket-server (8080), frontend (3000)
docker compose up -d db         # just the database, for local backend dev
docker compose logs -f api-server
```

`docker compose watch` semantics are configured (rebuild on Rust src changes, sync on frontend changes) if using `docker compose watch` instead of `up`.

### Backend, run locally (outside Docker)

```sh
export DATABASE_URL="postgres://postgres:my_secure_password_123@localhost:5432/postgres"
cd backend && sqlx migrate run          # apply migrations
cd backend/api-server && cargo run       # API server (needs API_HOST/API_PORT, defaults 127.0.0.1:9000)
cd backend/websocket-server && cargo run # websocket server (needs WS_HOST/WS_PORT, defaults 127.0.0.1:8080)
```

Note `backend/.sqlx/*.json` holds cached query metadata for `SQLX_OFFLINE=true` builds (used in CI) — regenerate with `cargo sqlx prepare` after changing a query macro (`sqlx::query!`/`query_as!`), against a live `DATABASE_URL`.

The LSL (Lab Streaming Layer) integration in `shared-logic::lsl` needs CMake + a C/C++ toolchain to build (`lsl-sys`). Live headset streaming additionally needs `muselsl` (`pip install muselsl`). By default the websocket server generates mock EEG data instead of reading a real headset — see "Mock vs. real EEG data" below.

### Frontend, run locally

```sh
cd frontend
npm install
npm run dev      # next dev --hostname 0.0.0.0
```

### Common dev commands (mirrors CI in .github/workflows/code-quality.yml)

```sh
# Rust (from backend/)
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace              # includes unit tests, e.g. signal_processing::pipeline_gateway
cargo test -p shared-logic <name>   # single test

# Python (repo root)
ruff format --check .
ruff check .

# Frontend (from frontend/)
npx eslint .
npx tsc --noEmit
npx prettier --check .
```

## Architecture

### Backend workspace (`backend/`, Cargo workspace)

- **`shared-logic`** — the core library everything else depends on (`use shared_logic::...`). Owns:
  - `db.rs` — all Postgres/TimescaleDB access via a shared `DbClient` (sqlx): users, sessions, frontend_state (JSON blobs saved per session), EEG data (batch insert, range queries, CSV import/export, hypertable `eeg_data`), and time labels.
  - `models.rs` — shared request/response/DB row structs (`NewUser`, `Session`, `EegDataRow`, `TimeLabel`, `FrontendState`, etc.) used by both `api-server` and `websocket-server`.
  - `pipeline.rs` — the `Pipeline`/`Node` model that describes a client-configured processing pipeline (`Window`, `Preprocessing`, `ML` node variants), sent from the frontend over the websocket init message and parsed here.
  - `lsl.rs` — the EEG acquisition loop (`receive_eeg`/`receive_eeg_with_config`): pulls samples from an LSL `StreamInlet` (or mock generator), batches them per the pipeline's window config, and calls into `signal_processing::pipeline_gateway` for ML inference, producing `EEGDataPacket`s (timestamps + per-channel signals + optional `ml_result`).
  - `mockeeg.rs` — generates synthetic EEG samples when no real headset is connected; toggled in `bc::start_broadcast` (currently always spawned alongside the real receiver — see inline comments there for how to disable it).
  - `bc.rs` — `start_broadcast`: fans a single `tokio::broadcast` channel of `EEGDataPacket`s out to two consumers — `ws_receiver` (serializes to JSON, sends to the connected websocket client) and `db_receiver` (batch-inserts into TimescaleDB). This is the runtime core of a live session.
  - `signal_processing/` — the Rust↔Python bridge:
    - `signal_processor.rs` — thin PyO3 wrapper for ad hoc filter calls (FIR/IIR bandpass, downsample) against `signalProcessing.py`.
    - `pipeline_gateway.rs` — `PipelineGateway` loads `moss/manager.py` (or `moss/mock_manager.py`, selected via `PIPELINE_MANAGER_SCRIPT` env var) as an embedded Python module and calls `run_pipeline_sync(pipeline_dict, numpy_array)` per batch, translating Rust `ProcessingConfig` into the node-graph dict format the Python side expects (quality check + bandpass nodes) and translating the classifier's dict result back into `PipelineOutput { overall_label, confidence, task }`.
    - `moss/` — the actual Python ML stack (NeuroLM-based mental-state classifier: `coordinator.py`, `classifier.py`, `encoder.py`, `preprocessing.py`, `segmenter.py`, model definitions under `model/`, and trained artifacts under `moss_models/*.pkl`/`*.npz`). `mock_manager.py` is a lightweight stand-in used by default so the Rust build/tests don't require the real model weights.

- **`api-server`** (`main.rs`, single file, Axum) — stateless-ish REST API holding an `AppState { db_client }`. Routes: user CRUD + Argon2-based login (`/users*`), session CRUD (`/api/sessions`), per-session frontend UI state persistence (`/api/sessions/:id/frontend-state`), EEG data range queries/import/export as CSV (`/api/sessions/:id/eeg-data`, `.../eeg_data/import`, `.../eeg_data/export`), and time-label annotations (`/api/sessions/:id/time-label`). Also embeds a Python interpreter directly for a legacy `/run-python-script` demo endpoint (separate from the pipeline gateway above).

- **`websocket-server`** (`main.rs`) — accepts raw TCP, upgrades to a websocket, and expects the *first* text message to be a `WebSocketInitMessage { session_id, nodes }` (the pipeline definition built in the frontend's node-graph editor). It then spawns `bc::start_broadcast` for that connection, which runs until the client sends `"clientClosing"` (triggers a graceful drain via `CancellationToken`, then replies `"confirmed closing"`) or disconnects.

- **`test-lsl`** — standalone binary for exercising the LSL stream in isolation, not part of the served app.

### Frontend (`frontend/`, Next.js App Router)

- `app/api/sessions/**/route.ts` — Next.js API routes that proxy to the Rust `api-server` via `lib/backend-proxy.ts` (`forwardToBackend`, which tries several base URLs in order: `SESSION_API_BASE_URL` / `API_BASE_URL` / `VITE_API_URL` env vars, then `api-server:9000` (Docker network), then `127.0.0.1`/`localhost`). This is the pattern to follow for any new backend-backed endpoint — add a route here rather than calling the Rust server directly from client code, except for the live EEG websocket.
- `context/WebSocketContext.tsx` — owns the *live* websocket connection to `ws://localhost:8080` (bypasses the Next.js proxy, since it's a persistent stream, not request/response). Connects when `dataStreaming` is true and `activeSessionId` is set (see `GlobalContext`), sends the pipeline payload from `lib/pipeline.ts` on open, normalizes incoming `{timestamps, signals}` batches into `DataPoint[]`, and exposes `subscribe`/`sendPipelinePayload` to consumers. Handles the same `"clientClosing"`/`"confirmed closing"` handshake as the Rust server.
- `context/GlobalContext.tsx` — top-level app state (active session id, streaming flag) shared across the tree.
- `components/nodes/*` + `components/ui-react-flow/*` — the React Flow-based pipeline editor (window/filter/resampling/ML/label/signal-graph/artifact nodes) that lets users visually assemble the `Pipeline`/`Node` graph defined in the Rust `pipeline.rs`; keep the two in sync when adding a new node type.
- `lib/session-api.ts`, `lib/eeg-api.ts`, `lib/frontend-state.ts` — typed client wrappers around the `app/api/sessions/...` proxy routes.

### Data flow for a live session

1. Frontend builds a `Pipeline` (node graph) → opens websocket → sends `{session_id, nodes}` as the init message.
2. `websocket-server` parses it, calls `bc::start_broadcast`, which starts the mock/real EEG generator, `receive_eeg` (batches + runs ML via `PipelineGateway`), and fans results out to the websocket client and to TimescaleDB concurrently.
3. Frontend's `WebSocketContext` receives batches, normalizes them, and pushes to subscribed chart/node components in real time.
4. After a session, historical data is fetched/exported through the REST API (`api-server` → `db.rs`), not the websocket.

## CI / review conventions

- `.github/workflows/code-quality.yml` gates PRs on `cargo fmt`, `cargo clippy -D warnings`, `ruff format`/`ruff check`, and frontend `eslint`/`tsc --noEmit`/`prettier --check` — run the relevant subset locally before pushing.
- `.github/workflows/pr-workflow.yml` auto-labels PRs by path (`frontend/`, `backend/`, `.github/`) and requires lead or team approval before merge; it's automatic and doesn't need local action.

# API Reference

Routes registered by `backend/api-server/src/main.rs`.

**Base URL:** `http://<API_HOST>:<API_PORT>` (default `http://127.0.0.1:9000`).

**Format:** request and response bodies are JSON unless stated otherwise. Timestamps are RFC 3339 (`2026-03-01T12:00:00Z`). Error responses have a plain-text body.

**Errors common to all routes with a JSON body or path parameter:**

| Status | When |
|---|---|
| 400 | Body is not valid JSON, or `:session_id` is not an integer |
| 415 | `Content-Type: application/json` header is missing |
| 422 | A required field is missing or has the wrong type |

## Routes

| Method | Path | Success |
|---|---|---|
| POST | `/users` | 200 |
| POST | `/users/login` | 200 |
| GET | `/users` | 200 |
| POST | `/users/delete` | 200 |
| POST | `/api/sessions` | 200 |
| GET | `/api/sessions` | 200 |
| POST | `/api/sessions/:session_id/frontend-state` | 200 |
| GET | `/api/sessions/:session_id/frontend-state` | 200 |
| POST | `/api/sessions/:session_id/time-label` | 201 |
| GET | `/api/sessions/:session_id/time-label` | 200 |
| GET | `/api/sessions/:session_id/eeg-data` | 200 |
| POST | `/api/sessions/:session_id/eeg_data/export` | 200 |
| POST | `/api/sessions/:session_id/eeg_data/import` | 200 |
| GET | `/run-python-script` | 200 |

---

## Users

### POST /users

Create a user.

**Request body**
```json
{ "username": "mint", "email": "mint@example.com", "password": "secret" }
```

**Response 200**
```json
{ "id": 1, "username": "mint", "email": "mint@example.com" }
```

**Errors**
- 500: password hashing failed, or the insert failed (including a duplicate `username` or `email`)

### POST /users/login

Verify an email and password.

**Request body**
```json
{ "email": "mint@example.com", "password": "secret" }
```

**Response 200**
```json
{ "id": 1, "username": "mint", "email": "mint@example.com" }
```

**Errors**
- 401: no user with that email, or the password is wrong (`Invalid email or password`)
- 500: the stored password hash could not be parsed

### GET /users

List all users.

**Response 200**
```json
[
  { "id": 1, "username": "mint", "email": "mint@example.com" }
]
```

**Errors**
- 500: query failed

### POST /users/delete

Delete a user by id.

**Request body**
```json
{ "id": 1 }
```

**Response 200:** empty body. Also returned when no user has that id.

**Errors**
- 500: delete failed

---

## Sessions

### POST /api/sessions

Create a session.

**Request body:** a JSON string.
```json
"Alpha baseline run"
```

**Response 200**
```json
{ "id": 1, "name": "Alpha baseline run" }
```

**Errors**
- 500: insert failed (including a duplicate name)

### GET /api/sessions

List all sessions.

**Response 200**
```json
[
  { "id": 1, "name": "Alpha baseline run" }
]
```

**Errors**
- 500: query failed

---

## Frontend state

### POST /api/sessions/:session_id/frontend-state

Store the frontend state for a session. Replaces any existing state for that session.

**Request body:** any JSON value.
```json
{ "nodes": [], "edges": [] }
```

**Response 200**
```json
{
  "session_id": 1,
  "data": { "nodes": [], "edges": [] },
  "updated_at": "2026-03-01T12:00:00Z"
}
```

**Errors**
- 500: upsert failed (including a `session_id` that does not exist)

### GET /api/sessions/:session_id/frontend-state

Get the stored frontend state.

**Response 200:** the stored JSON value.
```json
{ "nodes": [], "edges": [] }
```

**Errors**
- 404: no state stored for this session
- 500: query failed

---

## Time labels

### POST /api/sessions/:session_id/time-label

Store a batch of time labels.

**Request body**
```json
[
  {
    "start_timestamp": "2026-03-01T12:00:05Z",
    "end_timestamp": "2026-03-01T12:00:09Z",
    "label": "eyes closed",
    "color": "#4f46e5"
  }
]
```

`end_timestamp` is optional. An empty array stores nothing and returns 201.

**Response 201:** empty body.

**Errors**
- 500: insert failed (including a `session_id` that does not exist)

### GET /api/sessions/:session_id/time-label

Get the labels whose `start_timestamp` is between `start` and `end` (inclusive), ordered by `start_timestamp`.

**Query parameters:** `start` and `end`, both required, RFC 3339.

```
GET /api/sessions/1/time-label?start=2026-03-01T12:00:00Z&end=2026-03-01T12:05:00Z
```

**Response 200**
```json
[
  {
    "id": 1,
    "session_id": 1,
    "start_timestamp": "2026-03-01T12:00:05Z",
    "end_timestamp": "2026-03-01T12:00:09Z",
    "label": "eyes closed",
    "color": "#4f46e5"
  }
]
```

**Errors**
- 400: `start` or `end` is missing or not RFC 3339
- 500: query failed

---

## EEG data

### GET /api/sessions/:session_id/eeg-data

Get the rows with `time` between `start` and `end` (inclusive), ordered by `time`.

**Query parameters:** `start` and `end`, both required, RFC 3339.

```
GET /api/sessions/1/eeg-data?start=2026-03-01T12:00:00Z&end=2026-03-01T12:00:01Z
```

**Response 200**
```json
[
  {
    "time": "2026-03-01T12:00:00Z",
    "eeg1": 12.5, "eeg2": -4.1, "eeg3": 8.0, "eeg4": 0.3,
    "eeg5": 3.2, "eeg6": -1.7, "eeg7": 6.4, "eeg8": 2.2,
    "emg1": 1.9, "emg2": -2.4, "emg3": 0.8, "emg4": 55.1
  }
]
```

Values are microvolts (floats). A channel the recording device doesn't have is `null`. For
example, rows recorded with a 4-channel Muse have `eeg5..eeg8` and `emg1..emg4` as `null`.

**Errors**
- 400: `start` or `end` is missing or not RFC 3339
- 500: query failed

### POST /api/sessions/:session_id/eeg_data/export

Export EEG data for a session as CSV.

**Request body**
```json
{
  "filename": "session-1.csv",
  "options": {
    "format": "csv",
    "include_header": true,
    "start_time": "2026-03-01T12:00:00Z",
    "end_time": "2026-03-01T12:05:00Z"
  }
}
```

| Field | Required | Notes |
|---|---|---|
| `filename` | yes | Used in the `Content-Disposition` header |
| `options.format` | yes | Only `csv` is supported |
| `options.include_header` | yes | Include the header row |
| `options.start_time` | no | Defaults to the session's earliest timestamp |
| `options.end_time` | no | Defaults to the current time |

**Response 200:** CSV body with `Content-Type: text/csv; charset=utf-8` and `Content-Disposition: attachment; filename="<filename>"`.
```
time,eeg1,eeg2,eeg3,eeg4,eeg5,eeg6,eeg7,eeg8,emg1,emg2,emg3,emg4
2026-03-01T12:00:00+00:00,12.5,-4.1,8,0.3,3.2,-1.7,6.4,2.2,1.9,-2.4,0.8,55.1
2026-03-01T12:00:00.003906+00:00,11.9,-3.8,7.6,0.1,,,,,,,,
```

All 12 channel columns are always written. A channel the device didn't record is an empty cell.

**Errors**
- 400: `format` is not `csv`, or `start_time` is after `end_time`
- 404: `start_time` was omitted and the session has no EEG data
- 500: query failed

### POST /api/sessions/:session_id/eeg_data/import

Import EEG data from CSV.

**Request body:** raw CSV text (not JSON). The first row must be a header. Columns are matched **by header name** (case-insensitive, any order):

- `time` (required): RFC 3339
- any subset of `eeg1`..`eeg8`, `emg1`..`emg4` (at least one)
- legacy `channel1`..`channel4`, read as `eeg1`..`eeg4`, so files exported before the 12-channel change still import

```
time,eeg1,eeg2,eeg3,eeg4,emg1
2026-03-01T12:00:00Z,12.5,-4.1,8,0.3,1.9
```

Missing columns and empty cells are stored as `NULL`. Rows whose `(session_id, time)` already exists are skipped. Large files are inserted in several statements (about 4,600 rows each) to stay under Postgres's bind-parameter limit.

**Response 200**
```json
{ "status": "success" }
```

**Errors**
- 500: the header has an unknown or duplicate column, no `time` column or no channel column; a row has the wrong number of fields, an invalid timestamp, or a non-numeric channel value (nothing is inserted); or the insert failed (including a `session_id` that does not exist). All statements run in one transaction, so a failed import inserts nothing.

---

## Legacy

### GET /run-python-script

Runs `./python/EyeBlink/src/test.py` and `./scripts/hello.py` (relative to the server's working directory) and returns the output of `hello.test(20, 30)`.

**Response 200**
```json
{ "python_output": "<string>" }
```

**Errors**
- 500: a script file is missing, or the Python code raised

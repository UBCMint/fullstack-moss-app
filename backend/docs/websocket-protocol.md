# Live EEG websocket protocol

This is the contract between the frontend (`frontend/context/WebSocketContext.tsx`) and the
websocket server (`backend/websocket-server/src/main.rs`) for a live streaming session.
The pipeline node configs carried in the init message are specified separately in
[pipeline-nodes.md](pipeline-nodes.md).

Out of scope: the REST API (`api-server`), frontend components, and the Python ML internals.

## Connection

| | |
|---|---|
| URL | `ws://<WS_HOST>:<WS_PORT>`, defaults to `ws://127.0.0.1:8080`. In Docker the server binds `0.0.0.0:8080`. |
| Path | None. Any path is accepted. |
| Subprotocol / auth | None. |
| Frames | Text only. The server ignores binary, ping and pong frames from the client (tungstenite replies to pings automatically). |
| Sessions per connection | One. Each connection runs one pipeline, writes to one session, and then ends. To change the pipeline, close the connection and open a new one. |

## Lifecycle

```
client                                         server
  |  ---- TCP + websocket upgrade ---------------> |
  |  ---- init message (JSON text) --------------> |  parse; on failure log and keep waiting
  |                                                |  start_broadcast(): start EEG source,
  |                                                |  batching + ML, DB writer, ws writer
  |  <--- batch (JSON text) ---------------------- |
  |  <--- batch ---------------------------------- |  repeats once per window
  |  ...                                           |
  |  ---- "clientClosing" -----------------------> |  cancel; flush partial window; wait
  |                                                |  for the acquisition task to stop
  |  <--- (maybe one last batch, see below) ------ |
  |  <--- "confirmed closing" -------------------- |
  |  ---- websocket Close -----------------------> |  server stops reading; connection dropped
```

### 1. Init message (client → server)

The first non-empty text frame that parses as the JSON below is treated as the init message.
Text frames before it that don't parse are logged and skipped. Non-text frames are skipped.

```json
{
  "session_id": "42",
  "nodes": [
    { "type": "window",        "config": { "chunk_size": 64, "overlap_size": 0 } },
    { "type": "preprocessing", "config": { "apply_bandpass": true, "apply_quality_check": true,
                                           "use_iir": false, "l_freq": 1.0, "h_freq": 50.0,
                                           "downsample_factor": null, "sfreq": 256.0, "n_channels": 4 } },
    { "type": "ml",            "config": { "model": "Stress" } }
  ]
}
```

| Field | Type | Notes |
|---|---|---|
| `session_id` | string | Decimal integer **as a string**, the id of a row in `sessions` (created through the REST API beforehand). Parsed with `parse::<i32>()`. If that fails, the server **quietly uses `0`**. |
| `nodes` | array of `{type, config}` | Adjacently tagged enum `shared_logic::pipeline::Node`. Order doesn't matter: the server uses the **first** node of each type and ignores the rest. The array can be empty, in which case every stage uses its default. |

`type` must be exactly `"window"`, `"preprocessing"` or `"ml"`. One unknown `type`, or one
missing required config field, makes the **whole message** fail to parse (see
[Error behaviour](#error-behaviour)).

**Currently only one init message is read**. Text frames sent after it other than `"clientClosing"` are
ignored, including a second pipeline payload. For any changes to the pipeline, the connection needs to be closed and a new one started with the updated init message (see [Known issues](#known-issues)).

### 2. Data batches (server → client)

Each batch is one text frame holding a JSON-serialized `shared_logic::lsl::EEGDataPacket`:

```json
{
  "timestamps": ["2026-03-11T03:55:22.715574979Z", "2026-03-11T03:55:22.719612001Z", "..."],
  "signals": [
    [12.5, 80.1, "..."],
    [44.0,  3.2, "..."],
    [91.7, 55.5, "..."],
    [ 0.4, 67.9, "..."]
  ],
  "ml_result": { "overall_label": "focused", "confidence": 0.85, "task": "focus" }
}
```

| Field | Type | Notes |
|---|---|---|
| `timestamps` | string[] | RFC 3339 UTC with nanosecond precision (chrono `DateTime<Utc>`). This is the LSL sample time converted to wall-clock time. Length is `N`. |
| `signals` | number[4][N] | **Channel-major**: `signals[c][i]` is channel `c` at `timestamps[i]`. There are always exactly 4 channels (Muse TP9, AF7, AF8, TP10 order when using a real headset). |
| `ml_result` | object \| null | Output of the Python pipeline for this batch. It is `null` when the pipeline returned no classifier output or failed. See below. |

`ml_result` fields (`PipelineOutput`):

| Field | Type | Notes |
|---|---|---|
| `overall_label` | string | The predicted class label, e.g. `"focused"`. |
| `confidence` | number | Usually 0–1. |
| `task` | string | Which classification task produced the label, e.g. `"focus"`. |

Batch size `N`:

- First batch: `chunk_size`.
- Later batches, when `overlap_size > 0`: `overlap_size + chunk_size`. The last `overlap_size`
  samples of the previous batch are repeated at the front. **Their timestamps are not the
  original ones.** They are all copies of the first new sample's timestamp. Clients that
  plot by timestamp should drop the first `overlap_size` points of every batch after the first.
- The final batch, flushed on `clientClosing`, can be shorter than `chunk_size` and has no
  overlap prefix.

`signals` always holds the **raw** samples. Preprocessing settings change only what the ML
stage sees. They do not change the data streamed to the client or written to the database.
See [pipeline-nodes.md](pipeline-nodes.md).

Rate: about `sample_rate / chunk_size` batches per second, so roughly 4/s at the defaults
(256 Hz, chunk 64).

### 3. Graceful close: `clientClosing` / `confirmed closing`

1. The client sends the exact text frame `clientClosing`, case-sensitive, with no JSON wrapper.
2. The server cancels the session's `CancellationToken`. The mock generator stops, and the
   acquisition loop sends any samples left in the current window as a final batch and exits.
3. The server waits for the acquisition task to finish, then sends the text frame
   `confirmed closing`.
4. The server stops reading from the socket and drops the connection without sending a Close
   frame of its own. The client should call `ws.close()` when it receives `confirmed closing`.

Ordering caveat: the websocket writer runs as its own task, and the server does not wait for
it before sending `confirmed closing`. So the final flushed batch can arrive **after**
`confirmed closing`, or not at all if the client has already closed. Database writes are not
affected by this.

### 4. Other ways a connection ends

| Trigger | Server behaviour |
|---|---|
| Client sends a websocket Close frame without `clientClosing` first | The server echoes the Close and stops reading. **The pipeline is not cancelled** ([known issue](#known-issues)). |
| TCP drop or read error | Same as above. The pipeline keeps running in the background. |
| Stream closed before an init message | Logged. Nothing else happens. |
| Websocket handshake fails | Logged. The connection is dropped. |

Clients should **always send `clientClosing` and wait for `confirmed closing`** before closing.
Until the known issue is fixed, closing any other way leaks a background pipeline.

## Error behaviour

The server **never sends an error message to the client**. Every failure is either logged on
the server (`RUST_LOG=info` or higher) or shows up as missing or `null` data. What the client
sees in each case:

| Failure | Where | What the client sees |
|---|---|---|
| Init JSON is invalid, has an unknown node `type`, or is missing a required config field | `websocket-server` | Nothing. The server logs `Failed to parse init message JSON: ...` and keeps waiting for another init message. The connection stays open with no data. |
| `session_id` is not an integer | `websocket-server` | Normal streaming, but the rows are written to session `0`. If session 0 doesn't exist, every DB insert fails (logged). |
| The Python manager script can't be loaded (`PIPELINE_MANAGER_SCRIPT` is wrong) | `lsl.rs` | No batches. Acquisition stops right away. `clientClosing` still gets `confirmed closing`. |
| No LSL stream of type `EEG` exists | `lsl.rs` | No batches. `resolve_bypred` waits **forever**. In this state `clientClosing` never gets `confirmed closing`, because the server is waiting on a task that never finishes, so the client's timeout is the only way out. |
| A sample has fewer than 4 channels | `lsl.rs` | The sample is dropped. Channels beyond 4 are ignored without a message. |
| The Python pipeline raises, or returns no `classifier_output` | `pipeline_gateway.rs` | The batch is still sent, with `ml_result: null`. |
| The websocket writer falls behind by more than 1000 batches | `bc.rs` | Batches are skipped without notice. The DB writer has its own 1000-batch buffer. |
| A DB insert fails | `bc.rs` | Nothing. Streaming continues. Rows that duplicate an existing `(session_id, time)` are skipped without notice. |
| Sending to the websocket fails | `bc.rs` | The websocket writer stops. Acquisition and DB writes continue. |

## Data source: mock vs. real headset

`bc::start_broadcast` always starts `mockeeg::generate_mock_data`. It publishes an LSL outlet
named `MyStream` (type `EEG`, 4 × float32 channels, nominal 256 Hz, values uniformly random in
`[0, 100)`). The acquisition loop then connects to **the first LSL stream of type `EEG` that it
finds**. If `muselsl stream` is also running, or more than one client is connected, which
stream gets picked is effectively random. To use a real headset, comment out the mock spawn
block in `bc.rs` and run `muselsl stream`.

## Known issues

These are listed so the spec describes how the code behaves today. Each one should be fixed in
code and then removed from this list alongside any update to this document.

1. **Pipelines with a filter node never start.** The frontend's filter-node config
   (`DEFAULT_PROCESSING` in `react-flow-view.tsx`, and `filter-node.tsx`) leaves out
   `apply_quality_check`. That field is required by `PreprocessingConfig`, so the init message
   fails to parse and the connection sits idle.
2. A Close frame or a disconnect without `clientClosing` leaks the session's pipeline (see §4). The EEG source, the ML loop and the DB writer keep running and keep inserting rows for the session until the process restarts.
3. Overlap samples have made-up timestamps. Because of `ON CONFLICT (session_id, time) DO NOTHING`,
   the DB stores the first *overlap* sample at the first new sample's timestamp and drops the
   real one. With `overlap_size > 0`, one stored sample per batch is wrong.
4. The final batch can race `confirmed closing` (see §3).
5. Errors are never reported to the client. A protocol-level error message (for example
   `{"error": "...", "code": "..."}`) would let the frontend show why a session isn't streaming.
6. Runtime pipeline updates are not supported. `lsl.rs` has a `watch` channel set up for
   window config changes, but its sender is dropped right away, so nothing can push an update. The frontend currently re-sends the payload every time the graph changes, but those updates do nothing until the next connection.

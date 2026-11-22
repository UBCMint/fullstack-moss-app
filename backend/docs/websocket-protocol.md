# Live EEG websocket protocol

This is the contract between the frontend (`frontend/context/WebSocketContext.tsx`) and the
websocket server (`backend/websocket-server/src/main.rs`) for a live streaming session.
The pipeline node configs carried in the init message are specified separately in
[pipeline-nodes.md](pipeline-nodes.md).

Out of scope: the REST API (`api-server`), frontend components, and the Python ML internals.

## Known gap: no session-ownership check

The REST API (`api-server`) enforces that a session belongs to the logged-in user on every
`/api/sessions/:session_id/...` route (see `ensure_session_owner` in `api-server/src/main.rs`).
This server has no such check: it accepts whatever `session_id` the client sends in the init
message and writes EEG data to it regardless of who's logged in — it doesn't even know who's
logged in, since it has no cookie/auth handling at all (see "Subprotocol / auth" below). A user
who can reach this port and knows (or guesses) another user's session id can currently stream
data into that session. This server binds to `127.0.0.1` only, so the practical exposure today
is local-machine processes, not the network — but it's an open item, not something this task
closed. Fixing it needs this server to authenticate the init message the same way `api-server`
does and look up ownership before calling `start_broadcast`; tracked as a backlog item (see also
the WebSocket-auth backlog note from the session-auth task).

## Connection

| | |
|---|---|
| URL | `ws://<WS_HOST>:<WS_PORT>`, defaults to `ws://127.0.0.1:8080`. In Docker the server binds `0.0.0.0:8080`. |
| Path | None. Any path is accepted. |
| Subprotocol / auth | None. |
| Frames | Text only. The server ignores binary, ping and pong frames from the client (tungstenite replies to pings automatically). |
| Sessions per connection | One. Each connection runs one pipeline, writes to one session, and then ends. To change the pipeline, close the connection and open a new one. |
| Server → client frames | Data batches, the `{"type": "error", ...}` frame, and the text `confirmed closing`. |

## Lifecycle

```
client                                         server
  |  ---- TCP + websocket upgrade ---------------> |
  |  ---- init message (JSON text) --------------> |  parse + compile the graph
  |  <--- error frame, then Close (if invalid) --- |
  |                                                |  start_broadcast(): start EEG source,
  |                                                |  batching + processing + ML, DB writer,
  |                                                |  ws writer
  |  <--- error frame (if the stream can't start)  |
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

The first non-empty text frame is the init message. Non-text frames before it are skipped.

```json
{
  "session_id": "42",
  "nodes": [
    { "id": "source-1", "type": "source",        "config": {} },
    { "id": "window-1", "type": "window",        "config": { "chunk_size": 64, "overlap_size": 0 } },
    { "id": "filter-1", "type": "preprocessing", "config": { "apply_bandpass": true, "l_freq": 1.0, "h_freq": 30.0 } },
    { "id": "ml-1",     "type": "ml",            "config": { "model": "Stress" } }
  ],
  "edges": [
    { "source": "source-1", "target": "window-1" },
    { "source": "window-1", "target": "filter-1" },
    { "source": "filter-1", "target": "ml-1" }
  ]
}
```

| Field | Type | Notes |
|---|---|---|
| `session_id` | string | Decimal integer **as a string**, the id of a row in `sessions` (created through the REST API beforehand). Parsed with `parse::<i32>()`. If that fails, the server **quietly uses `0`**. |
| `nodes` | array of `{id, type, config}` | Every node on the canvas. See [pipeline-nodes.md](pipeline-nodes.md) for the types and configs. |
| `edges` | array of `{source, target}` | Connections between node ids. They set the processing order. Optional, but without edges only a lone `source` node is valid. |

If the message can't be read (bad JSON, unknown node `type`, a field of the wrong type), the
server sends an `invalid_message` [error frame](#error-frame-server--client) and closes the
connection. If the graph breaks a rule in
[pipeline-nodes.md § Graph rules](pipeline-nodes.md#graph-rules), it sends an
`invalid_pipeline` error frame naming the node, and closes the connection.

**Only one init message is read**. Text frames sent after it other than `"clientClosing"` are
ignored, including a second pipeline payload. To change the pipeline, close the connection and
start a new one with the updated init message. The frontend locks the canvas while streaming.

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
| `signals` | number[4][N] | **Channel-major**: `signals[c][i]` is channel `c` at `timestamps[i]`. There are always exactly 4 channels (Muse TP9, AF7, AF8, TP10 order when using a real headset). This is the output of the **last processing node** in the pipeline (raw if there are none). |
| `ml_result` | object \| null | Output of the Python pipeline for this batch. It is `null` when the pipeline returned no classifier output or failed. See below. |

`ml_result` fields (`PipelineOutput`):

| Field | Type | Notes |
|---|---|---|
| `overall_label` | string | The predicted class label, e.g. `"focused"`. |
| `confidence` | number | Usually 0–1. |
| `task` | string | Which classification task produced the label, e.g. `"focus"`. |

Batch size `N`, with `r = rate at the end of the chain / stream rate` (`1` without a
`resample` node):

- First batch: about `chunk_size × r`.
- Later batches: about `(chunk_size + overlap_size) × r`. The overlap samples at the front
  repeat the end of the previous batch, **with their real timestamps**, so clients that plot by
  timestamp should drop points they've already drawn.
- The final batch, flushed on `clientClosing`, can be shorter.
- A batch can be empty after heavy downsampling with a small window.

The database stores the **raw** samples of each batch (no overlap, no processing), whatever the
pipeline does. See [pipeline-nodes.md](pipeline-nodes.md).

Rate: about `stream_rate / chunk_size` batches per second, so roughly 4/s at the defaults
(256 Hz, chunk 64).

### Error frame (server → client)

Sent instead of data when a session can't start, before the server stops:

```json
{ "type": "error", "code": "invalid_pipeline", "message": "Low cutoff (60 Hz) must be below the high cutoff (30 Hz).", "node_id": "filter-1" }
```

| `code` | When | What happens next |
|---|---|---|
| `invalid_message` | The init message can't be parsed. | The server closes the connection. |
| `invalid_pipeline` | The graph breaks a rule, or a setting doesn't fit the stream's sample rate (checked once the stream is found). `node_id` names the node. | Before streaming: the server closes the connection. After the stream is found: the pipeline stops; the client should send `clientClosing` as usual. |
| `no_source` | No LSL stream of type `EEG` was found within 10 s. | The pipeline stops; send `clientClosing`. |
| `pipeline_init_failed` | The pipeline has an ML node and the Python manager couldn't be loaded. | The pipeline stops; send `clientClosing`. |
| `internal_error` | The acquisition task panicked. | The pipeline stops; send `clientClosing`. |

`node_id` is left out when the error isn't about one node. The frontend shows `message` as a
notification, selects the node named by `node_id`, and stops streaming
(`WebSocketContext.tsx`, `react-flow-view.tsx`).

### 3. Graceful close: `clientClosing` / `confirmed closing`

1. The client sends the exact text frame `clientClosing`, case-sensitive, with no JSON wrapper.
2. The server cancels the session's `CancellationToken`. The mock generator stops, and the
   acquisition loop runs any samples left in the current window through the pipeline as a
   final batch and exits.
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

Errors that stop a session are sent as an [error frame](#error-frame-server--client). Errors
during a running session are only logged on the server (`RUST_LOG=info` or higher) or show up
as missing or `null` data:

| Failure | Where | What the client sees |
|---|---|---|
| Init message can't be parsed, or the graph is invalid | `websocket-server` | `invalid_message` / `invalid_pipeline` error frame, then the connection closes. |
| A setting doesn't fit the stream's rate (e.g. a cutoff above Nyquist) | `lsl.rs` | `invalid_pipeline` error frame with `node_id`. No batches. |
| `session_id` is not an integer | `websocket-server` | Normal streaming, but the rows are written to session `0`. If session 0 doesn't exist, every DB insert fails (logged). |
| The pipeline has an ML node and the Python manager script can't be loaded | `lsl.rs` | `pipeline_init_failed` error frame. No batches. |
| No LSL stream of type `EEG` within 10 s | `lsl.rs` | `no_source` error frame. No batches. |
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

1. A Close frame or a disconnect without `clientClosing` leaks the session's pipeline (see §4). The EEG source, the ML loop and the DB writer keep running and keep inserting rows for the session until the process restarts.
2. The final batch can race `confirmed closing` (see §3).
3. Runtime pipeline updates are not supported: the pipeline is fixed for the life of the
   connection, and the frontend locks the canvas while streaming. Changing it means stopping
   and starting again.
4. All chart nodes show the same stream (the end of the processing chain), even when they
   branch off earlier in the pipeline.

# Live streaming: frontend ↔ websocket server

This is the frontend's quick reference for the live EEG websocket. The full
specs live in the backend:

- [backend/docs/websocket-protocol.md](../backend/docs/websocket-protocol.md):
  connection, message formats, close handshake, error behaviour.
- [backend/docs/pipeline-nodes.md](../backend/docs/pipeline-nodes.md): every
  pipeline node type, its fields, its defaults, and what it changes.

## Where this lives in the frontend

| Concern                                                                      | File                                                                                                                            |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Socket lifecycle, sending the init message, close handshake, parsing batches | `context/WebSocketContext.tsx`                                                                                                  |
| Payload types                                                                | `lib/pipeline.ts` (`PipelinePayload`, `PipelineNode`)                                                                           |
| Turning the React Flow graph into `nodes` + `edges`, validating, defaults    | `lib/pipeline-validation.ts` (`buildPipelinePayload`, `validatePipeline`, `typeMap`, `DEFAULT_PROCESSING`, `DEFAULT_WINDOWING`) |
| Showing server errors on the canvas                                          | `components/ui-react-flow/react-flow-view.tsx` (`pipeline-error` listener)                                                      |
| Per-node config                                                              | `components/nodes/*`                                                                                                            |

## The exchange

1. When `dataStreaming` is true and `activeSessionId` is set, open
   `ws://localhost:8080`.
2. On open, send the init message once: every node with its React Flow `id`,
   plus the edges.

    ```json
    {
        "session_id": "42",
        "nodes": [
            { "id": "source-1", "type": "source", "config": {} },
            {
                "id": "window-1",
                "type": "window",
                "config": { "chunk_size": 64, "overlap_size": 0 }
            },
            {
                "id": "filter-1",
                "type": "preprocessing",
                "config": {
                    "apply_bandpass": true,
                    "apply_quality_check": true,
                    "use_iir": false,
                    "l_freq": 1,
                    "h_freq": 30,
                    "downsample_factor": null,
                    "sfreq": 256,
                    "n_channels": 4
                }
            },
            { "id": "ml-1", "type": "ml", "config": { "model": "Stress" } }
        ],
        "edges": [
            { "source": "source-1", "target": "window-1" },
            { "source": "window-1", "target": "filter-1" },
            { "source": "filter-1", "target": "ml-1" }
        ]
    }
    ```

    - `session_id` is a **string** holding an integer session id.
    - The server reads only the init message. Changes made to the graph after
      that are ignored until the next connection (the canvas is locked while
      streaming anyway).
    - If the message doesn't parse or the graph is invalid, the server sends an
      error frame and closes the connection (see below).

3. Receive batches, one JSON text frame per window:

    ```json
    {
      "timestamps": ["2026-03-11T03:55:22.715574979Z", "..."],
      "signals": [[...ch1], [...ch2], [...ch3], [...ch4]],
      "ml_result": { "overall_label": "focused", "confidence": 0.85, "task": "focus" }
    }
    ```

    - `signals` is channel-major: `signals[c][i]` lines up with `timestamps[i]`.
    - `signals` is the output of the **last processing node** (filtered,
      resampled, …). After a resampling node there are fewer or more samples per
      batch than `chunk_size`.
    - `ml_result` is `null` without an ML node, and can be `null` with one.
    - When `overlap_size > 0`, every batch after the first starts with samples
      repeated from the previous batch, with their real timestamps.

    Or receive an error frame instead, when the session can't start:

    ```json
    {
        "type": "error",
        "code": "invalid_pipeline",
        "message": "…",
        "node_id": "filter-1"
    }
    ```

    `WebSocketContext` dispatches it as a `pipeline-error` event and stops
    streaming; the canvas shows `message` and selects the node `node_id` names.

4. To stop, send the plain text `clientClosing`, wait for the plain text
   `confirmed closing`, then call `ws.close()`. If no confirmation arrives
   within 5 s, close anyway (this is what `WebSocketContext` already does).
   **Don't close without sending `clientClosing` first.** The server only stops
   the session's acquisition and DB writes when it gets that message.

## Contract rules for the node editor

- Every node needs a `type` the backend knows (`typeMap`) and a `config` object.
  Unknown types reject the whole payload.
- Config fields can be left out; the backend fills in defaults. See the field
  tables in `pipeline-nodes.md`.
- The backend enforces the graph rules in `pipeline-nodes.md` (one source,
  window right after it, processing nodes in a single chain, every node
  connected). Catch what you can in `validatePipeline` so users see it before
  Start.
- Keep window validation (`chunk_size > 0`, `0 ≤ overlap_size < chunk_size`) on
  the frontend. The backend only rejects `chunk_size: 0`.

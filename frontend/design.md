# Live streaming: frontend ↔ websocket server

This is the frontend's quick reference for the live EEG websocket. The full
specs live in the backend:

- [backend/docs/websocket-protocol.md](../backend/docs/websocket-protocol.md):
  connection, message formats, close handshake, error behaviour.
- [backend/docs/pipeline-nodes.md](../backend/docs/pipeline-nodes.md): every
  pipeline node type, its fields, its defaults, and what it changes.


## Where this lives in the frontend

| Concern                                                                      | File                                                                                                                                              |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Socket lifecycle, sending the init message, close handshake, parsing batches | `context/WebSocketContext.tsx`                                                                                                                    |
| Payload types                                                                | `lib/pipeline.ts` (`PipelinePayload`, `PipelineNode`)                                                                                             |
| Turning the React Flow graph into `nodes`, validating, applying defaults     | `components/ui-react-flow/react-flow-view.tsx` (`buildPipelinePayload`, `validatePipeline`, `typeMap`, `DEFAULT_PROCESSING`, `DEFAULT_WINDOWING`) |
| Per-node config                                                              | `components/nodes/{window-node,filter-node,machine-learning-node}/*`                                                                              |

## The exchange

1. When `dataStreaming` is true and `activeSessionId` is set, open
   `ws://localhost:8080`.
2. On open, send the init message once:

    ```json
    {
        "session_id": "42",
        "nodes": [
            {
                "type": "window",
                "config": { "chunk_size": 64, "overlap_size": 0 }
            },
            {
                "type": "preprocessing",
                "config": {
                    "apply_bandpass": true,
                    "apply_quality_check": true,
                    "use_iir": false,
                    "l_freq": 1,
                    "h_freq": 50,
                    "downsample_factor": null,
                    "sfreq": 256,
                    "n_channels": 4
                }
            },
            { "type": "ml", "config": { "model": "Stress" } }
        ]
    }
    ```

    - `session_id` is a **string** holding an integer session id.
    - The server reads only the first init message it can parse. Changes made to
      the graph after that are ignored until the next connection.
    - If the message doesn't parse, the server sends **nothing back**. A
      connection that stays silent usually means the payload was rejected. Check
      the websocket-server logs.

3. Receive batches, one JSON text frame per window:

    ```json
    {
      "timestamps": ["2026-03-11T03:55:22.715574979Z", "..."],
      "signals": [[...ch1], [...ch2], [...ch3], [...ch4]],
      "ml_result": { "overall_label": "focused", "confidence": 0.85, "task": "focus" }
    }
    ```

    - `signals` is channel-major: `signals[c][i]` lines up with `timestamps[i]`.
    - `signals` is always **raw**. Filter settings change only `ml_result`, not
      the plotted data.
    - `ml_result` can be `null`.
    - When `overlap_size > 0`, every batch after the first starts with
      `overlap_size` repeated samples whose timestamps are placeholders. Drop
      them before plotting.

4. To stop, send the plain text `clientClosing`, wait for the plain text
   `confirmed closing`, then call `ws.close()`. If no confirmation arrives
   within 5 s, close anyway (this is what `WebSocketContext` already does).
   **Don't close without sending `clientClosing` first.** The server only stops
   the session's acquisition and DB writes when it gets that message.

## Contract rules for the node editor

- Node `type` strings must be exactly `window`, `preprocessing` or `ml`. Strip
  out display-only nodes before sending.
- Every non-nullable field in a node's config must be present, or the whole
  payload is rejected. See the field tables in `pipeline-nodes.md`.
- Keep window validation (`chunk_size > 0`, `0 ≤ overlap_size < chunk_size`) on
  the frontend. The backend doesn't check these.
